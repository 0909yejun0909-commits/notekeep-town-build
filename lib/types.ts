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

export type WallColor = 'base' | 'green' | 'red';
export type RoofColor = 'black' | 'blue' | 'red';
export type MaterialId = 'wood' | 'stone' | 'limestone';

export type HairStyle = 1 | 2 | 3 | 4 | 5 | 6;
export type HairColor = 'black' | 'blonde' | 'brown' | 'ginger' | 'grey';
export type ClothColor = 'black' | 'blue' | 'brown' | 'green' | 'orange' | 'pink' | 'purple' | 'red';

export type Appearance = {
  hairStyle: HairStyle;
  hairColor: HairColor;
  shirtColor: ClothColor;
  pantsColor: ClothColor;
  shoesColor: ClothColor;
};

export type House = {
  id: string; name: string;
  gx: number; gy: number;   // grid position inside its region
  variant: number;          // which building sprite shape, 0-4
  material: MaterialId;     // independent of shape — every shape has all 3
  // Not every material+shape combo ships every wall color (see
  // lib/houseCatalog.ts's availableWallColors) — always valid for the house's own
  // current material+variant, since the editor filters and OverworldScene defaults safely.
  wallColor: WallColor;
  roofColor: RoofColor;     // independent of shape and material — every combo has all 3
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
  // Optional: absent means notes can't be added (read-only vault, multiplayer guest). Creates
  // an empty `<title>.md` in `folder` (vault-relative, '' for the root) and returns the
  // re-parsed world that contains it. The caller publishes that world.
  createNote?: (folder: string, title: string) => Promise<{ world: WorldModel; note: NoteRef }>;
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

// Decoration-only kinds: placeable from the interior editor (and later the shop),
// but the vault parser never puts a note on one — notes only land on a FurnitureId.
export type DecorKind =
  | 'sofa' | 'armchair' | 'chair' | 'stool' | 'fireplace' | 'clock'
  | 'single_bed' | 'wardrobe' | 'cabinet' | 'sideboard' | 'nightstand' | 'mirror'
  | 'table' | 'stove' | 'sink' | 'fridge' | 'barrel'
  | 'bathtub' | 'toilet' | 'basin' | 'vanity'
  | 'bookcase' | 'piano' | 'guitar' | 'planter' | 'mat';

export type CatalogCategory = FurnitureId | DecorKind;

// How special a piece is. The shop maps tiers to credit prices, so prices can be
// tuned in one place once the earn rate is known.
export type CatalogTier = 'common' | 'uncommon' | 'rare' | 'treasure';

// A catalog item is a specific placeable variant (e.g. 'bed_blue'); `category` says
// which kind it's a variant of. Every variant of a kind shares its footprint, which
// is what lets the editor swap one for another in place.
export type CatalogItemId = string;

export type CatalogEntry = {
  id: CatalogItemId;
  name: string;
  category: CatalogCategory;
  tier: CatalogTier;
  textureKey: string;
  frameKey: string;
  footprint: [number, number];
  rotations: Array<0 | 90 | 180 | 270>;
  // The sprite's pixel rect on its sheet — BootScene carves the Phaser frame from
  // it and the editor crops a CSS thumbnail from it, so it's always footprint*16.
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
