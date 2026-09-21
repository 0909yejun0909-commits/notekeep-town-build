import type { CatalogEntry, CatalogItemId } from './types';

// Base 8 categories, one catalog entry each (single-variant categories, or the
// "default" variant of a category that also has colour/species variants below).
// rotations: symmetric sprites (rug, painting) allow a full quarter-turn; every
// other category only supports a left/right mirror, since no rotated art exists.
export const CATALOG: CatalogEntry[] = [
  { id: 'desk', category: 'desk', textureKey: 'furn_desk', frameKey: 'desk', footprint: [2, 3], rotations: [0, 180] },
  { id: 'chest', category: 'chest', textureKey: 'furn_chest', frameKey: 'chest', footprint: [1, 1], rotations: [0, 180] },
  { id: 'painting', category: 'painting', textureKey: 'furn_painting', frameKey: 'painting', footprint: [1, 1], rotations: [0, 90, 180, 270] },
  { id: 'bed', category: 'bed', textureKey: 'furn_bed', frameKey: 'bed', footprint: [2, 2], rotations: [0, 180] },
  { id: 'bed_blue', category: 'bed', textureKey: 'furn_bed', frameKey: 'bed_blue', footprint: [2, 2], rotations: [0, 180] },
  { id: 'bed_green', category: 'bed', textureKey: 'furn_bed', frameKey: 'bed_green', footprint: [2, 2], rotations: [0, 180] },
  { id: 'bed_pink', category: 'bed', textureKey: 'furn_bed', frameKey: 'bed_pink', footprint: [2, 2], rotations: [0, 180] },
  { id: 'bed_yellow', category: 'bed', textureKey: 'furn_bed', frameKey: 'bed_yellow', footprint: [2, 2], rotations: [0, 180] },
  { id: 'bed_red', category: 'bed', textureKey: 'furn_bed', frameKey: 'bed_red', footprint: [2, 2], rotations: [0, 180] },
  { id: 'rug', category: 'rug', textureKey: 'furn_rug', frameKey: 'rug', footprint: [3, 3], rotations: [0, 90, 180, 270] },
  { id: 'rug_cyan', category: 'rug', textureKey: 'furn_rug', frameKey: 'rug_cyan', footprint: [3, 3], rotations: [0, 90, 180, 270] },
  { id: 'lamp', category: 'lamp', textureKey: 'furn_lamp', frameKey: 'lamp', footprint: [1, 2], rotations: [0, 180] },
  { id: 'lamp_blue', category: 'lamp', textureKey: 'furn_lamp', frameKey: 'lamp_blue', footprint: [1, 2], rotations: [0, 180] },
  { id: 'lamp_green', category: 'lamp', textureKey: 'furn_lamp', frameKey: 'lamp_green', footprint: [1, 2], rotations: [0, 180] },
  { id: 'lamp_pink', category: 'lamp', textureKey: 'furn_lamp', frameKey: 'lamp_pink', footprint: [1, 2], rotations: [0, 180] },
  { id: 'lamp_yellow', category: 'lamp', textureKey: 'furn_lamp', frameKey: 'lamp_yellow', footprint: [1, 2], rotations: [0, 180] },
  { id: 'plant', category: 'plant', textureKey: 'furn_plant', frameKey: 'plant', footprint: [1, 2], rotations: [0, 180] },
  { id: 'plant_a', category: 'plant', textureKey: 'furn_plant', frameKey: 'plant_a', footprint: [1, 2], rotations: [0, 180] },
  { id: 'plant_b', category: 'plant', textureKey: 'furn_plant', frameKey: 'plant_b', footprint: [1, 2], rotations: [0, 180] },
  { id: 'plant_c', category: 'plant', textureKey: 'furn_plant', frameKey: 'plant_c', footprint: [1, 2], rotations: [0, 180] },
  { id: 'plant_d', category: 'plant', textureKey: 'furn_plant', frameKey: 'plant_d', footprint: [1, 2], rotations: [0, 180] },
  { id: 'plant_e', category: 'plant', textureKey: 'furn_plant', frameKey: 'plant_e', footprint: [1, 2], rotations: [0, 180] },
  { id: 'plant_f', category: 'plant', textureKey: 'furn_plant', frameKey: 'plant_f', footprint: [1, 2], rotations: [0, 180] },
];

export const CATALOG_BY_ID: Record<CatalogItemId, CatalogEntry> = Object.fromEntries(
  CATALOG.map((e) => [e.id, e]),
);
