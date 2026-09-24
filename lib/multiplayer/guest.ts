'use client';

import { bus } from '@/game/bus';
import { publishWorld, walk } from '@/lib/vault/open';
import { makeLinkResolver } from '@/lib/vault/parse';
import type { VaultHandle } from '@/lib/types';
import { base64ToBytes, importRoomKey } from './crypto.ts';
import type { NoteResponse, WorldPayload } from './protocol.ts';
import { Room, RoomError } from './room.ts';
import { RELAY_URL, endSession, setSessionShare, startSession, type SessionEnd } from './session.ts';

export type Invite = { roomId: string; key: string };

export class JoinError extends Error {
  reason: SessionEnd;
  constructor(reason: SessionEnd) {
    super(reason);
    this.reason = reason;
  }
}

const REQUEST_TIMEOUT_MS = 15_000;
const WORLD_TIMEOUT_MS = 15_000;

export function readInvite(): Invite | null {
  const roomId = new URLSearchParams(location.search).get('room');
  if (!roomId) return null;
  return { roomId, key: new URLSearchParams(location.hash.slice(1)).get('key') ?? '' };
}

function exteriorKey(p: WorldPayload): string {
  return JSON.stringify(p.world.regions.map((r) => r.houses.map((h) => [h.id, h.variant, h.material, h.wallColor, h.roofColor])));
}

export async function joinRoom(
  invite: Invite,
  name: string,
  localDir: FileSystemDirectoryHandle | null,
  onVault: (v: VaultHandle) => void,
): Promise<void> {
  let key: CryptoKey;
  try {
    key = await importRoomKey(invite.key);
  } catch {
    throw new JoinError('broken-link');
  }

  // Read the local copy before joining: once in the room, nothing may await before the
  // listeners below are attached, or the presence of people already there is lost.
  const local = new Map<string, FileSystemFileHandle>();
  if (localDir) await walk(localDir, '', local);
  const resolveLocal = makeLinkResolver([...local.keys()]);
  // Notes by exact path only — a same-named file elsewhere in the guest's copy is a
  // different note. Embeds resolve by name, the way Obsidian does.
  const readLocalNote = async (id: string): Promise<File | null> => (await local.get(id)?.getFile()) ?? null;
  const readLocalEmbed = async (link: string): Promise<File | null> => {
    const path = resolveLocal(link);
    return (path && (await local.get(path)?.getFile())) || null;
  };

  let room: Room;
  try {
    room = await Room.join(RELAY_URL, invite.roomId, key);
  } catch (err) {
    throw new JoinError(err instanceof RoomError ? err.reason : 'relay-unreachable');
  }

  const pending = new Map<string, { resolve: (r: NoteResponse) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  let reqCounter = 0;
  const ask = (path: string, kind: 'text' | 'binary') =>
    new Promise<NoteResponse>((resolve, reject) => {
      const reqId = String(++reqCounter);
      const timer = setTimeout(() => {
        pending.delete(reqId);
        reject(new Error("Couldn't reach the host.", { cause: 'host' }));
      }, REQUEST_TIMEOUT_MS);
      pending.set(reqId, { resolve, reject, timer });
      room.send('host', { t: 'note-req', reqId, path, kind }).catch(() => {});
    });

  const makeHandle = (p: WorldPayload): VaultHandle => ({
    world: p.world,
    readNote: async (id) => {
      const file = await readLocalNote(id);
      if (file) return file.text();
      const res = await ask(id, 'text');
      if (!res.ok) throw new Error(res.error, { cause: 'host' });
      return res.text ?? '';
    },
    readBinary: async (path) => {
      const file = await readLocalEmbed(path);
      if (file) return file;
      const res = await ask(path, 'binary');
      if (!res.ok) throw new Error(res.error, { cause: 'host' });
      return new Blob([base64ToBytes(res.b64 ?? '')], { type: res.mime ?? '' });
    },
  });

  let lastExterior = '';
  let lastLayouts = '';
  const apply = (p: WorldPayload, initial: boolean) => {
    const exterior = exteriorKey(p);
    const layouts = JSON.stringify(p.layouts);
    const exteriorChanged = exterior !== lastExterior;
    const layoutsChanged = layouts !== lastLayouts;
    lastExterior = exterior;
    lastLayouts = layouts;
    publishWorld(p.world, null, { layouts: p.layouts });
    onVault(makeHandle(p));
    setSessionShare(p.share);
    if (!initial && (exteriorChanged || layoutsChanged)) bus.emit('world-updated', { exteriorChanged });
  };

  let first: (p: WorldPayload) => void = () => {};
  let failed: (reason: SessionEnd) => void = () => {};
  const firstWorld = new Promise<WorldPayload>((resolve, reject) => {
    first = resolve;
    failed = (reason) => reject(new JoinError(reason));
  });
  const worldTimer = setTimeout(() => failed('broken-link'), WORLD_TIMEOUT_MS);
  let joined = false;

  // Listen before anything is sent: the host's presence arrives right after we join.
  const offRoom = room.on((e) => {
    if (e.kind === 'reconnected') room.send('host', { t: 'hello' }).catch(() => {});
    if (e.kind === 'closed' && !joined) failed(e.reason);
    if (e.kind === 'undecryptable' && e.from === room.hostId && !joined) failed('broken-link');
    if (e.kind !== 'message' || e.from !== room.hostId) return;
    if (e.msg.t === 'world') {
      if (joined) apply(e.msg, false);
      else first(e.msg);
    } else if (e.msg.t === 'note-res') {
      const waiting = pending.get(e.msg.reqId);
      if (!waiting) return;
      clearTimeout(waiting.timer);
      pending.delete(e.msg.reqId);
      waiting.resolve(e.msg);
    }
  });

  startSession(room, 'guest', name, { share: 'notes', invite: null }, () => {
    offRoom();
    clearTimeout(worldTimer);
    for (const waiting of pending.values()) {
      clearTimeout(waiting.timer);
      waiting.reject(new Error("Couldn't reach the host.", { cause: 'host' }));
    }
    pending.clear();
  });
  room.send('host', { t: 'hello' }).catch(() => {});

  let payload: WorldPayload;
  try {
    payload = await firstWorld;
  } catch (err) {
    endSession(null);
    throw err;
  }
  clearTimeout(worldTimer);
  joined = true;
  apply(payload, true);
}
