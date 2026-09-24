function storageKey(fingerprint: string, houseId: string): string {
  return `exterior:${fingerprint}:${houseId}`;
}

export function getExteriorVariant(fingerprint: string, houseId: string): number | null {
  try {
    const raw = localStorage.getItem(storageKey(fingerprint, houseId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || typeof parsed.variant !== 'number') {
      return null;
    }
    return parsed.variant;
  } catch {
    return null;
  }
}

export function saveExteriorVariant(fingerprint: string, houseId: string, variant: number): void {
  try {
    localStorage.setItem(storageKey(fingerprint, houseId), JSON.stringify({ variant }));
  } catch {
    // Storage full or unavailable (private browsing) — the choice just won't persist.
  }
}
