import type { RoofColor, WallColor } from './types';
import { HOUSE_VARIANTS, WALL_COLORS, ROOF_COLORS } from './houseCatalog';

export type ExteriorOverride = {
  variant: number;
  // null means "no saved color" — the caller falls back to that variant's default.
  // Kept separate from variant validity so an old, color-less saved entry (from before
  // wall/roof color existed) still applies its saved shape.
  wallColor: WallColor | null;
  roofColor: RoofColor | null;
};

function storageKey(fingerprint: string, houseId: string): string {
  return `exterior:${fingerprint}:${houseId}`;
}

export function getExteriorOverride(fingerprint: string, houseId: string): ExteriorOverride | null {
  try {
    const raw = localStorage.getItem(storageKey(fingerprint, houseId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed !== 'object' || parsed === null ||
      typeof parsed.variant !== 'number' ||
      !(HOUSE_VARIANTS as readonly number[]).includes(parsed.variant)
    ) {
      return null;
    }
    const wallColor = (WALL_COLORS as readonly string[]).includes(parsed.wallColor)
      ? (parsed.wallColor as WallColor)
      : null;
    const roofColor = (ROOF_COLORS as readonly string[]).includes(parsed.roofColor)
      ? (parsed.roofColor as RoofColor)
      : null;
    return { variant: parsed.variant, wallColor, roofColor };
  } catch {
    return null;
  }
}

export function saveExteriorOverride(
  fingerprint: string,
  houseId: string,
  variant: number,
  wallColor: WallColor,
  roofColor: RoofColor,
): void {
  try {
    localStorage.setItem(storageKey(fingerprint, houseId), JSON.stringify({ variant, wallColor, roofColor }));
  } catch {
    // Storage full or unavailable (private browsing) — the choice just won't persist.
  }
}
