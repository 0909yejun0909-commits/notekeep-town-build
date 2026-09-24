import type { House, MaterialId, RoofColor, WallColor } from './types';

// Building sprite size in tiles per variant, and the lower door tile, from the manifest.
// The single source of truth — lib/vault/parse.ts and game/tilemap.ts both import from here
// instead of keeping their own copies.
export const HOUSE_FOOTPRINT: Record<number, [number, number]> = {
  0: [6, 8], 1: [9, 8], 2: [9, 8], 3: [7, 6], 4: [12, 8],
};
export const HOUSE_DOOR: Record<number, [number, number]> = {
  0: [2, 6], 1: [2, 6], 2: [5, 6], 3: [2, 4], 4: [5, 6],
};
export const HOUSE_VARIANTS = [0, 1, 2, 3, 4] as const;
export const REGION_MARGIN = 2;
export const HOUSE_GAP = 3;

// Every shape ships in all 9 wall/roof color combinations of the Wood material — color is
// independent of shape and never changes a house's footprint or door tile, only which of the
// installed sprites (scripts/install-assets.sh) gets loaded.
export const WALL_COLORS: readonly WallColor[] = ['base', 'green', 'red'];
export const ROOF_COLORS: readonly RoofColor[] = ['black', 'blue', 'red'];
export const MATERIALS: readonly MaterialId[] = ['wood', 'stone', 'limestone'];

// Each shape's original fixed material/color combo, from before wall/roof color became
// independently pickable — the default for a house with no saved override, so an un-customized
// town looks exactly as it did before this feature (always Wood; the feature predates Stone
// and Limestone).
export const DEFAULT_MATERIAL: Record<number, MaterialId> = {
  0: 'wood', 1: 'wood', 2: 'wood', 3: 'wood', 4: 'wood',
};
export const DEFAULT_WALL_COLOR: Record<number, WallColor> = {
  0: 'base', 1: 'base', 2: 'green', 3: 'base', 4: 'red',
};
export const DEFAULT_ROOF_COLOR: Record<number, RoofColor> = {
  0: 'red', 1: 'blue', 2: 'red', 3: 'black', 4: 'blue',
};

// Limestone and Stone are both single-tone materials with no separately-colorable wall area:
// Limestone ships only one wall look per shape from Kenmi, and Stone's "green"/"red" plaster
// variants were recolored to match its stone-gray foundation (scripts/install-assets.sh), so
// every shape's Stone sprite is uniformly gray and only the base wall look is kept installed.
// Every material+shape combo that supports a wall color supports it in all 3 roof colors — roof
// coverage never needs filtering.
export function availableWallColors(material: MaterialId, _shape: number): readonly WallColor[] {
  if (material === 'limestone' || material === 'stone') return ['base'];
  return WALL_COLORS;
}

export function houseTextureKey(
  variant: number,
  material: MaterialId,
  wallColor: WallColor,
  roofColor: RoofColor,
): string {
  return `house-${variant}-${material}-${wallColor}-${roofColor}`;
}

// Would `house` (at its existing, fixed gx/gy) fit as `newVariant` without overlapping any
// other house in the same region, with the same HOUSE_GAP clearance the original layout packer
// used? The region canvas itself always auto-grows to fit (regionSize() takes a fresh max over
// every house's current footprint on every load), so there is no separate "region edge" case to
// check here — only house-to-house overlap.
export function canPlaceHouseVariant(
  house: Pick<House, 'id' | 'gx' | 'gy'>,
  newVariant: number,
  siblingHouses: Array<Pick<House, 'id' | 'gx' | 'gy' | 'variant'>>,
): boolean {
  const [nw, nh] = HOUSE_FOOTPRINT[newVariant];
  for (const other of siblingHouses) {
    if (other.id === house.id) continue;
    const [ow, oh] = HOUSE_FOOTPRINT[other.variant];
    const overlaps =
      house.gx - HOUSE_GAP < other.gx + ow &&
      house.gx + nw + HOUSE_GAP > other.gx &&
      house.gy - HOUSE_GAP < other.gy + oh &&
      house.gy + nh + HOUSE_GAP > other.gy;
    if (overlaps) return false;
  }
  return true;
}
