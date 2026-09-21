import { hash } from './types';
import type { InteriorLayout } from './types';

function storageKey(fingerprint: string, houseId: string): string {
  return `interior:${fingerprint}:${houseId}`;
}

// The File System Access API never exposes a real filesystem path, so a vault's
// identity is approximated by its display name plus its full file listing — two
// different vaults would need an identical name AND an identical set of files to
// collide, which in practice doesn't happen.
export function vaultFingerprint(vaultName: string, paths: string[]): string {
  const sorted = [...paths].sort();
  return String(hash(`${vaultName}\n${sorted.join('\n')}`));
}

export function getLayout(fingerprint: string, houseId: string): InteriorLayout | null {
  try {
    const raw = localStorage.getItem(storageKey(fingerprint, houseId));
    if (!raw) return null;
    return JSON.parse(raw) as InteriorLayout;
  } catch {
    return null;
  }
}

export function saveLayout(fingerprint: string, houseId: string, layout: InteriorLayout): void {
  try {
    localStorage.setItem(storageKey(fingerprint, houseId), JSON.stringify(layout));
  } catch {
    // Storage full or unavailable (private browsing) — the layout just won't persist.
  }
}
