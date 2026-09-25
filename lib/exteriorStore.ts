import type { House, MaterialId, RoofColor, WallColor } from './types';
import {
  HOUSE_VARIANTS, MATERIALS, WALL_COLORS, ROOF_COLORS,
  DEFAULT_MATERIAL, DEFAULT_WALL_COLOR, DEFAULT_ROOF_COLOR, availableWallColors,
} from './houseCatalog';

export type ExteriorOverride = {
  variant: number;
  // null means "no saved value" — the caller falls back to that variant's default. Kept
  // separate from variant validity so an old saved entry (from before material/wall/roof color
  // existed) still applies its saved shape. A non-null wallColor here is only guaranteed
  // structurally valid (one of the 3 known colors) — the caller still has to check it against
  // availableWallColors(material, variant), since not every material+shape combo ships every
  // wall color and the save could predate a material this house is now set to.
  material: MaterialId | null;
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
    const material = (MATERIALS as readonly string[]).includes(parsed.material)
      ? (parsed.material as MaterialId)
      : null;
    const wallColor = (WALL_COLORS as readonly string[]).includes(parsed.wallColor)
      ? (parsed.wallColor as WallColor)
      : null;
    const roofColor = (ROOF_COLORS as readonly string[]).includes(parsed.roofColor)
      ? (parsed.roofColor as RoofColor)
      : null;
    return { variant: parsed.variant, material, wallColor, roofColor };
  } catch {
    return null;
  }
}

export function saveExteriorOverride(
  fingerprint: string,
  houseId: string,
  variant: number,
  material: MaterialId,
  wallColor: WallColor,
  roofColor: RoofColor,
): void {
  try {
    localStorage.setItem(
      storageKey(fingerprint, houseId),
      JSON.stringify({ variant, material, wallColor, roofColor }),
    );
  } catch {
    // Storage full or unavailable (private browsing) — the choice just won't persist.
  }
}

export function applyExteriorOverride(house: House, saved: ExteriorOverride): void {
  house.variant = saved.variant;
  house.material = saved.material ?? DEFAULT_MATERIAL[saved.variant];
  // A saved wallColor is only structurally valid (one of the 3 known colors), not
  // necessarily available for this material+shape combo — Limestone and Stone's
  // shape 3 only ship a subset. Fall back to 'base', always available everywhere.
  const wallColor = saved.wallColor ?? DEFAULT_WALL_COLOR[saved.variant];
  house.wallColor = availableWallColors(house.material, house.variant).includes(wallColor) ? wallColor : 'base';
  house.roofColor = saved.roofColor ?? DEFAULT_ROOF_COLOR[saved.variant];
}
