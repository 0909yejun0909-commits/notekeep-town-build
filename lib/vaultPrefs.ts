import { vaultStorageKey } from './walletStore';

// Small per-vault settings kept beside the wallet. The demo town keeps them for the session only.
const memory = new Map<string, unknown>();

export function readPref<T>(suffix: string, fallback: T): T {
  const key = vaultStorageKey(suffix);
  if (!key) return (memory.get(suffix) as T | undefined) ?? fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writePref<T>(suffix: string, value: T) {
  const key = vaultStorageKey(suffix);
  if (!key) {
    memory.set(suffix, value);
    return;
  }
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable — the setting just won't persist.
  }
}
