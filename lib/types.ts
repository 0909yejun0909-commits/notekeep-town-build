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
  desk: [2, 3], shelf: [2, 2], bed: [2, 2], chest: [1, 1],
  plant: [1, 2], painting: [1, 1], lamp: [1, 2], rug: [3, 3],
};

export const BIOMES: BiomeId[] = ['meadow', 'forest', 'desert', 'volcano', 'snow'];
export const FURNITURE: FurnitureId[] =
  ['desk', 'shelf', 'bed', 'chest', 'plant', 'painting', 'lamp', 'rug'];

export function hash(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (h * 33) ^ str.charCodeAt(i);
  }
  return h >>> 0;
}
