import type { NoteRef, VaultHandle } from './types';
import { replaceWorld } from './vault/open';
import { moveNoteSaves } from './houseRename';
import { bus } from '@/game/bus';

// Renames a note's file from its title, and everything that knows the note by its path follows:
// the world the scenes draw, furniture holding it, coins counted for it. Returns the note as it
// is now. Throws a message fit to show.
export async function renameNote(
  vault: VaultHandle,
  setVault: (v: VaultHandle) => void,
  note: NoteRef,
  title: string,
): Promise<NoteRef> {
  if (!vault.renameNote) throw new Error("Notes can't be renamed here.");
  const { world, note: renamed } = await vault.renameNote(note.id, title);
  if (renamed.id === note.id) return renamed;
  const fingerprint = (window as any).__game?.registry.get('vaultFingerprint') as string | undefined;
  if (fingerprint) moveNoteSaves(fingerprint, note.id, renamed.id);
  setVault({ ...vault, world });
  replaceWorld(world);
  bus.emit('note-renamed', { from: note.id, to: renamed.id });
  return renamed;
}
