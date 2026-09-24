import type { NoteRequest, ShareMode } from './protocol.ts';
import type { VaultHandle, WorldModel } from '@/lib/types';

// The host's side of "can I read that?": only notes that are in the town, only images
// and videos that a note already opened in this session embeds, only while sharing
// notes. Never throws — every request gets a reply so a guest's reader never waits
// out the timeout.

export const MAX_SHARED_BYTES = 4 * 1024 * 1024;
export const NOT_SHARED = "The host isn't sharing notes.";

const MEDIA_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'mp4', 'webm', 'ogg', 'mov'];
const encoder = new TextEncoder();

export type NoteReply =
  | { ok: true; text: string }
  | { ok: true; bytes: Uint8Array; mime: string }
  | { ok: false; error: string };

export function noteIdsOf(world: WorldModel): Set<string> {
  return new Set(world.regions.flatMap((r) => r.houses.flatMap((h) => h.rooms.flatMap((room) => room.notes.map((n) => n.id)))));
}

// Every path NoteReader will ask for when it renders this note's embeds: the same two
// patterns and the same "note's folder first, then as written" candidates.
function embedPaths(notePath: string, markdown: string): string[] {
  const dir = notePath.includes('/') ? notePath.slice(0, notePath.lastIndexOf('/') + 1) : '';
  const targets = [
    ...[...markdown.matchAll(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)].map((m) => m[1]),
    ...[...markdown.matchAll(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map((m) => m[2]).filter((p) => !/^(https?:|data:|blob:)/i.test(p)),
  ];
  return targets.flatMap((p) => (dir ? [dir + p, p] : [p]));
}

export async function resolveNoteRequest(
  vault: Pick<VaultHandle, 'readNote' | 'readBinary'>,
  share: ShareMode,
  noteIds: Set<string>,
  allowedMedia: Set<string>,
  req: NoteRequest,
): Promise<NoteReply> {
  if (share !== 'notes') return { ok: false, error: NOT_SHARED };
  try {
    if (req.kind === 'text') {
      if (!noteIds.has(req.path)) return { ok: false, error: 'That note is not in this town.' };
      const text = await vault.readNote(req.path);
      if (encoder.encode(text).length > MAX_SHARED_BYTES) return { ok: false, error: 'This note is too large to share.' };
      for (const path of embedPaths(req.path, text)) allowedMedia.add(path);
      return { ok: true, text };
    }
    if (!allowedMedia.has(req.path)) return { ok: false, error: 'Not found.' };
    const ext = req.path.split(/[#?]/)[0].split('.').pop()?.toLowerCase() ?? '';
    if (!MEDIA_EXT.includes(ext)) return { ok: false, error: 'Only images and videos are shared.' };
    const blob = await vault.readBinary(req.path);
    if (blob.size > MAX_SHARED_BYTES) return { ok: false, error: 'This file is too large to share.' };
    return { ok: true, bytes: new Uint8Array(await blob.arrayBuffer()), mime: blob.type };
  } catch {
    return { ok: false, error: 'Not found.' };
  }
}
