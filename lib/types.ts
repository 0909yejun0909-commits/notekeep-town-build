export type BiomeId = 'meadow' | 'forest' | 'desert' | 'volcano' | 'snow';
// The whole town's look, picked by the player (components/BiomePicker.tsx). Separate from
// Region.biome, which is hash-derived per region and not rendered.
export type TownBiome = Extract<BiomeId, 'forest' | 'snow' | 'desert'>;
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
  // Optional: absent means rooms can't be added (multiplayer guest). Creates the folder
  // `<houseId>/<name>` and returns the re-parsed world that contains the new, empty room.
  createRoom?: (houseId: string, name: string) => Promise<{ world: WorldModel; room: Room }>;
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
  | 'sofa' | 'armchair' | 'chair' | 'stool' | 'bench' | 'fireplace' | 'clock'
  | 'bed_side' | 'single_bed' | 'wardrobe' | 'cabinet' | 'sideboard' | 'nightstand' | 'mirror'
  | 'dresser' | 'dresser_wide' | 'writing_desk'
  | 'table' | 'table_tall' | 'counter' | 'stove' | 'sink' | 'fridge' | 'barrel'
  | 'bathtub' | 'bathtub_tall' | 'toilet' | 'basin' | 'vanity'
  | 'bookcase' | 'bookcase_wide' | 'bookcase_tall' | 'piano' | 'guitar'
  | 'plant_big' | 'planter' | 'planter_tall'
  | 'mat' | 'mat_small' | 'rug_wide'
  | 'window' | 'window_wide' | 'wall_clock' | 'wall_mirror' | 'wall_mirror_wide' | 'towel' | 'pot_rack'
  | 'table_lamp' | 'candle' | 'potion' | 'book' | 'dish' | 'food' | 'vase' | 'trinket' | 'toiletry' | 'tabletop_plant'
  | 'xmas_tree' | 'candy_cane' | 'gift' | 'gift_pile' | 'wreath' | 'stocking'
  | 'computer' | 'laptop' | 'computer_desk' | 'tv_console' | 'arcade'
  | 'speaker' | 'headphones' | 'earphones' | 'radio' | 'record_player' | 'noise_machine'
  | 'beanbag' | 'cushion';

// Where a piece goes, Stardew-style: rugs lie under everything, wall pieces hang on the
// back wall, tabletop pieces stand on a table, counter or nightstand (or on the floor), and
// everything else stands on the floor.
export type CatalogLayer = 'rug' | 'floor' | 'wall' | 'tabletop';

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
  layer: CatalogLayer;
  footprint: [number, number];
  rotations: Array<0 | 90 | 180 | 270>;
  // The sprite's pixel rect on its sheet — BootScene carves the Phaser frame from
  // it and the editor crops a CSS thumbnail from it. It's footprint*16 wide and at least
  // footprint*16 tall: a taller sprite stands on its footprint and its top overhangs the
  // tiles behind, the way Stardew draws tall furniture.
  sheetUrl: string;
  rect: [number, number, number, number];
  // A window's view at dawn, dusk and night, as y offsets from `rect` on the same sheet.
  views?: Partial<Record<'dawn' | 'dusk' | 'night', number>>;
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
  // The shelf isn't a FurniturePlacement — it's always present and it's the only
  // guaranteed way to browse every note in the house — but it can be moved, and
  // it can look like a fridge, cabinet or wardrobe instead (`item`, one of
  // NOTE_STORE_ITEMS in lib/catalog.ts; absent means the bookshelf).
  shelf: { gx: number; gy: number; item?: CatalogItemId };
  placements: FurniturePlacement[];
};

export function hash(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (h * 33) ^ str.charCodeAt(i);
  }
  return h >>> 0;
}
