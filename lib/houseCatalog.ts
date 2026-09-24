import type { House } from './types';

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
