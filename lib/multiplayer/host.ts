'use client';

import { bus } from '@/game/bus';
import { applyExteriorOverride, getExteriorOverride } from '@/lib/exteriorStore';
import { getLayout } from '@/lib/interiorStore';
import { emptyTownEdits, loadTownEdits } from '@/lib/townEdits';
import type { InteriorLayout, VaultHandle, WorldModel } from '@/lib/types';
import { bytesToBase64, exportRoomKey, generateRoomKey } from './crypto.ts';
import { noteIdsOf, resolveNoteRequest } from './noteAccess.ts';
import type { NoteResponse, ShareMode, WorldPayload } from './protocol.ts';
import { Room } from './room.ts';
import { RELAY_URL, setSessionShare, startSession } from './session.ts';

let changeShare: ((share: ShareMode) => void) | null = null;

function hostFingerprint(): string | undefined {
  return (window as any).__game?.registry?.get('vaultFingerprint');
}

// The town exactly as the host sees it: saved exteriors baked into each house, every
// saved interior alongside, previews blanked unless notes are shared.
export function buildWorldPayload(world: WorldModel, fingerprint: string | undefined, share: ShareMode): WorldPayload {
  const copy: WorldModel = structuredClone(world);
  const layouts: Record<string, InteriorLayout> = {};
  for (const region of copy.regions) {
    for (const house of region.houses) {
      if (fingerprint) {
        const exterior = getExteriorOverride(fingerprint, house.id);
        if (exterior) applyExteriorOverride(house, exterior);
        for (const room of house.rooms) {
          const layout = getLayout(fingerprint, room.id);
          if (layout) layouts[room.id] = layout;
        }
      }
      if (share === 'town') {
        for (const room of house.rooms) for (const note of room.notes) note.preview = '';
      }
    }
  }
  return { world: copy, layouts, share, town: fingerprint ? loadTownEdits(fingerprint) : emptyTownEdits() };
}

export async function startHosting(vault: VaultHandle, name: string, share: ShareMode): Promise<void> {
  const key = await generateRoomKey();
  const room = await Room.create(RELAY_URL, key);
  const invite = `${location.origin}${location.pathname}?room=${room.roomId}#key=${await exportRoomKey(key)}`;
  // The town as it is now, not when hosting began: a note or room added since then must
  // reach guests who join later.
  const liveWorld = (): WorldModel => ((window as any).__game?.registry?.get('world') as WorldModel | undefined) ?? vault.world;
  const allowedMedia = new Set<string>();
  let current = share;

  const sendWorld = (to: string) => {
    room.send(to, { t: 'world', ...buildWorldPayload(liveWorld(), hostFingerprint(), current) }).catch(() => {});
  };

  const offRoom = room.on(async (e) => {
    if (e.kind !== 'message') return;
    if (e.msg.t === 'hello') sendWorld(e.from);
    if (e.msg.t !== 'note-req') return;
    const { reqId } = e.msg;
    const reply = await resolveNoteRequest(vault, current, noteIdsOf(liveWorld()), allowedMedia, e.msg);
    const res: NoteResponse = !reply.ok
      ? { t: 'note-res', reqId, ok: false, error: reply.error }
      : 'text' in reply
        ? { t: 'note-res', reqId, ok: true, text: reply.text }
        : { t: 'note-res', reqId, ok: true, b64: bytesToBase64(reply.bytes), mime: reply.mime };
    room.send(e.from, res).catch(() =>
      room.send(e.from, { t: 'note-res', reqId, ok: false, error: 'This file is too large to share.' }).catch(() => {}),
    );
  });

  // The scene saves the edit in its own handler; broadcast on the next tick so the save is in.
  const onCommit = () => setTimeout(() => sendWorld('all'), 0);
  bus.on('commit-exterior-variant', onCommit);
  bus.on('commit-interior-layout', onCommit);
  // Village edits are saved as they're made; guests get them when building is done.
  bus.on('close-town-editor', onCommit);

  changeShare = (next) => {
    current = next;
    setSessionShare(next);
    sendWorld('all');
  };

  startSession(room, 'host', name, { share, invite }, () => {
    offRoom();
    bus.off('commit-exterior-variant', onCommit);
    bus.off('commit-interior-layout', onCommit);
    bus.off('close-town-editor', onCommit);
    changeShare = null;
  });
}

export function setHostShare(share: ShareMode) {
  changeShare?.(share);
}
