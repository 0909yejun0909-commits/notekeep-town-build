export type BiomeId = 'meadow' | 'forest' | 'desert' | 'volcano' | 'snow';
export type FurnitureId =
  'desk' | 'shelf' | 'bed' | 'chest' | 'plant' | 'painting' | 'lamp' | 'rug';

export type NoteRef = {
  id: string;        // path relative to vault root, e.g. "Work/Ideas/api.md"
  title: string;     // filename without extension
  furniture: FurnitureId;
  gx: number; gy: number;   // grid position inside its room
  preview: string;   // first 200 chars, plain text, no markdown syntax
};

export type Room = { id: string; name: string; notes: NoteRef[] };

export type House = {
  id: string; name: string;
  gx: number; gy: number;   // grid position inside its region
  variant: number;          // which building sprite, 0-4
  rooms: Room[];
};

export type Region = {
  id: string; name: string;
  biome: BiomeId;
  houses: House[];
};

export type WorldModel = { name: string; regions: Region[] };

// Content loads lazily — never read every file up front.
export type VaultHandle = {
  world: WorldModel;
  readNote: (id: string) => Promise<string>;
  readBinary: (path: string) => Promise<Blob>;
  // Optional: absent means the vault is read-only.
  writeNote?: (id: string, content: string) => Promise<void>;
};

// Every piece's footprint in tiles: [cols, rows]. Both the track that PLACES
// furniture (A) and the track that RENDERS it (C) need the same numbers, or
// placement and rendering disagree about how big a piece is and pieces overlap.
export const FOOTPRINT: Record<FurnitureId, [number, number]> = {
  desk: [2, 2], shelf: [2, 2], bed: [2, 2], chest: [1, 1],
  plant: [1, 2], painting: [1, 1], lamp: [1, 2], rug: [3, 3],
};

export const BIOMES: BiomeId[] = ['meadow', 'forest', 'desert', 'volcano', 'snow'];
export const FURNITURE: FurnitureId[] =
  ['desk', 'shelf', 'bed', 'chest', 'plant', 'painting', 'lamp', 'rug'];

// A catalog item is a specific placeable variant (e.g. 'bed_blue'); `category` says
// which of the 8 FurnitureId kinds it's a variant of, for footprint/interchange rules.
export type CatalogItemId = string;

export type CatalogEntry = {
  id: CatalogItemId;
  category: FurnitureId;
  textureKey: string;
  frameKey: string;
  footprint: [number, number];
  rotations: Array<0 | 90 | 180 | 270>;
  // Where to crop this item's sprite from, for rendering a real thumbnail in
  // the editor's grid (CSS background-position, not a Phaser texture frame —
  // duplicates BootScene.ts's pixel rects since that one carves Phaser frames
  // and this one crops a plain <img>, and the two can't share a data format).
  sheetUrl: string;
  rect: [number, number, number, number];
};

export type FurniturePlacement = {
  item: CatalogItemId;
  gx: number;
  gy: number;
  rotation: 0 | 90 | 180 | 270;
  // Set only when this placement was one of the house's original auto-assigned
  // note-holders. Never set on a placement added later from the catalog.
  noteId?: string;
};

export type RoomSize = 'small' | 'medium' | 'large';

export type InteriorLayout = {
  floorFrame: number;
  wallTriple: number;
  roomSize: RoomSize;
  // The bookshelf isn't a FurniturePlacement — it's always present, always the
  // same style, and it's the only guaranteed way to browse every note in the
  // house — but it can be moved, so its position lives here.
  shelf: { gx: number; gy: number };
  placements: FurniturePlacement[];
};

export function hash(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (h * 33) ^ str.charCodeAt(i);
  }
  return h >>> 0;
}
