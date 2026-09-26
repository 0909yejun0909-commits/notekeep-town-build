import type { CatalogCategory, CatalogEntry, CatalogItemId, CatalogTier } from './types';

// Every furniture sprite sheet, by its file name in public/assets/furniture/
// (scripts/install-assets.sh copies them there). BootScene loads each one as
// the Phaser texture `furn_<sheet>` and carves every catalog entry's frame out of it.
export const FURNITURE_SHEETS = [
  'tables', 'bookshelves', 'beds', 'chest', 'plants', 'decor', 'lamps', 'carpets',
  'chairs', 'other', 'bathroom', 'kitchen', 'clocks', 'fireplaces', 'planters',
  'chest_gold', 'chest_jeweled', 'chest_metal',
] as const;
export type FurnitureSheet = (typeof FURNITURE_SHEETS)[number];

export const furnitureTextureKey = (sheet: FurnitureSheet) => `furn_${sheet}`;
export const furnitureSheetUrl = (sheet: FurnitureSheet) => `/assets/furniture/${sheet}.png`;

// The bookshelf isn't a catalog item (it's structural and always present), but
// it's carved from the same sheet as the placeable bookcases.
export const SHELF_SHEET: FurnitureSheet = 'bookshelves';
export const SHELF_RECT: [number, number, number, number] = [16, 0, 32, 32];

type Rect = [number, number, number, number];
type Rotations = CatalogEntry['rotations'];

// Only a left/right mirror for almost everything, since no rotated art exists;
// square, symmetric sprites (rugs, the painting) can take a full quarter-turn.
const MIRROR: Rotations = [0, 180];
const TURN: Rotations = [0, 90, 180, 270];

// The footprint is the rect in tiles, so the Phaser frame, the editor thumbnail
// and the tiles a piece blocks can never disagree about its size.
function item(
  id: CatalogItemId,
  name: string,
  category: CatalogCategory,
  tier: CatalogTier,
  sheet: FurnitureSheet,
  rect: Rect,
  rotations: Rotations = MIRROR,
): CatalogEntry {
  return {
    id,
    name,
    category,
    tier,
    textureKey: furnitureTextureKey(sheet),
    frameKey: id,
    footprint: [rect[2] / 16, rect[3] / 16],
    rotations,
    sheetUrl: furnitureSheetUrl(sheet),
    rect,
  };
}

export const CATALOG: CatalogEntry[] = [
  // Living room
  item('sofa_peach', 'Peach sofa', 'sofa', 'rare', 'chairs', [80, 128, 32, 32]),
  item('sofa_blue', 'Blue sofa', 'sofa', 'rare', 'chairs', [80, 192, 32, 32]),
  item('sofa_green', 'Green sofa', 'sofa', 'rare', 'chairs', [80, 256, 32, 32]),
  item('sofa_rose', 'Rose sofa', 'sofa', 'rare', 'chairs', [80, 320, 32, 32]),
  item('sofa_gold', 'Gold sofa', 'sofa', 'rare', 'chairs', [80, 384, 32, 32]),
  item('armchair_peach', 'Peach armchair', 'armchair', 'uncommon', 'chairs', [16, 128, 16, 32]),
  item('armchair_blue', 'Blue armchair', 'armchair', 'uncommon', 'chairs', [16, 192, 16, 32]),
  item('armchair_green', 'Green armchair', 'armchair', 'uncommon', 'chairs', [16, 256, 16, 32]),
  item('armchair_rose', 'Rose armchair', 'armchair', 'uncommon', 'chairs', [16, 320, 16, 32]),
  item('armchair_gold', 'Gold armchair', 'armchair', 'uncommon', 'chairs', [16, 384, 16, 32]),
  item('stool_peach', 'Peach stool', 'stool', 'common', 'chairs', [160, 144, 16, 16]),
  item('stool_blue', 'Blue stool', 'stool', 'common', 'chairs', [160, 208, 16, 16]),
  item('stool_green', 'Green stool', 'stool', 'common', 'chairs', [160, 272, 16, 16]),
  item('stool_rose', 'Rose stool', 'stool', 'common', 'chairs', [160, 336, 16, 16]),
  item('stool_gold', 'Gold stool', 'stool', 'common', 'chairs', [160, 400, 16, 16]),
  item('chair_ladder', 'Ladder-back chair', 'chair', 'common', 'chairs', [16, 0, 16, 32]),
  item('chair_spindle', 'Spindle chair', 'chair', 'common', 'chairs', [80, 32, 16, 32]),
  item('chair_arched', 'Arched chair', 'chair', 'common', 'chairs', [144, 64, 16, 32]),
  item('fireplace_stone', 'Stone fireplace', 'fireplace', 'rare', 'fireplaces', [0, 0, 32, 48]),
  item('fireplace_brick', 'Brick fireplace', 'fireplace', 'rare', 'fireplaces', [32, 0, 32, 48]),
  item('clock_oak', 'Oak grandfather clock', 'clock', 'uncommon', 'clocks', [0, 0, 16, 32]),
  item('clock_walnut', 'Walnut grandfather clock', 'clock', 'uncommon', 'clocks', [16, 0, 16, 32]),
  item('rug', 'White rug', 'rug', 'common', 'carpets', [0, 0, 48, 48], TURN),
  item('rug_cyan', 'Cyan rug', 'rug', 'common', 'carpets', [0, 80, 48, 48], TURN),
  item('rug_green', 'Green rug', 'rug', 'uncommon', 'carpets', [0, 160, 48, 48], TURN),
  item('rug_pink', 'Pink rug', 'rug', 'uncommon', 'carpets', [0, 240, 48, 48], TURN),
  item('rug_royal_blue', 'Royal blue rug', 'rug', 'rare', 'carpets', [0, 480, 48, 48], TURN),
  item('rug_royal_red', 'Royal red rug', 'rug', 'rare', 'carpets', [0, 560, 48, 48], TURN),
  item('mat_cyan', 'Round cyan mat', 'mat', 'common', 'carpets', [0, 128, 32, 32], TURN),
  item('mat_yellow', 'Round yellow mat', 'mat', 'common', 'carpets', [0, 368, 32, 32], TURN),
  item('mat_royal', 'Royal round mat', 'mat', 'uncommon', 'carpets', [0, 608, 32, 32], TURN),
  item('painting', 'Landscape painting', 'painting', 'common', 'decor', [48, 32, 16, 16], TURN),
  item('lamp', 'Peach floor lamp', 'lamp', 'common', 'lamps', [0, 0, 16, 32]),
  item('lamp_blue', 'Blue floor lamp', 'lamp', 'common', 'lamps', [32, 0, 16, 32]),
  item('lamp_green', 'Green floor lamp', 'lamp', 'common', 'lamps', [64, 0, 16, 32]),
  item('lamp_pink', 'Pink floor lamp', 'lamp', 'common', 'lamps', [96, 0, 16, 32]),
  item('lamp_yellow', 'Yellow floor lamp', 'lamp', 'common', 'lamps', [128, 0, 16, 32]),
  item('lamp_silver', 'Silver floor lamp', 'lamp', 'uncommon', 'lamps', [0, 64, 16, 32]),
  item('lamp_silver_blue', 'Silver blue floor lamp', 'lamp', 'uncommon', 'lamps', [32, 64, 16, 32]),
  item('lamp_wood_green', 'Wooden green floor lamp', 'lamp', 'uncommon', 'lamps', [64, 128, 16, 32]),

  // Bedroom
  item('bed', 'Peach bed', 'bed', 'common', 'beds', [0, 0, 32, 32]),
  item('bed_blue', 'Blue bed', 'bed', 'common', 'beds', [0, 32, 32, 32]),
  item('bed_green', 'Green bed', 'bed', 'common', 'beds', [0, 64, 32, 32]),
  item('bed_pink', 'Pink bed', 'bed', 'common', 'beds', [0, 96, 32, 32]),
  item('bed_yellow', 'Yellow bed', 'bed', 'common', 'beds', [0, 128, 32, 32]),
  item('bed_red', 'Red bed', 'bed', 'common', 'beds', [0, 160, 32, 32]),
  item('single_bed_peach', 'Peach single bed', 'single_bed', 'common', 'beds', [32, 0, 16, 32]),
  item('single_bed_blue', 'Blue single bed', 'single_bed', 'common', 'beds', [32, 32, 16, 32]),
  item('single_bed_green', 'Green single bed', 'single_bed', 'common', 'beds', [32, 64, 16, 32]),
  item('single_bed_red', 'Red single bed', 'single_bed', 'common', 'beds', [32, 160, 16, 32]),
  item('wardrobe_oak', 'Oak wardrobe', 'wardrobe', 'uncommon', 'other', [0, 80, 32, 32]),
  item('wardrobe_pine', 'Pine wardrobe', 'wardrobe', 'uncommon', 'other', [96, 80, 32, 32]),
  item('wardrobe_walnut', 'Walnut wardrobe', 'wardrobe', 'uncommon', 'other', [160, 80, 32, 32]),
  item('cabinet_oak', 'Oak cabinet', 'cabinet', 'common', 'other', [16, 48, 16, 32]),
  item('cabinet_walnut', 'Walnut cabinet', 'cabinet', 'common', 'other', [80, 48, 16, 32]),
  item('sideboard_oak', 'Oak sideboard', 'sideboard', 'common', 'other', [0, 160, 32, 16]),
  item('sideboard_walnut', 'Walnut sideboard', 'sideboard', 'common', 'other', [128, 160, 32, 16]),
  item('nightstand_oak', 'Oak nightstand', 'nightstand', 'common', 'other', [0, 0, 16, 16]),
  item('nightstand_pine', 'Pine nightstand', 'nightstand', 'common', 'other', [32, 0, 16, 16]),
  item('mirror_silver', 'Silver standing mirror', 'mirror', 'uncommon', 'bathroom', [0, 192, 16, 32]),
  item('mirror_gold', 'Gold standing mirror', 'mirror', 'rare', 'bathroom', [16, 192, 16, 32]),

  // Kitchen & dining
  item('desk', 'Pine table', 'desk', 'common', 'tables', [72, 24, 32, 32]),
  item('desk_walnut', 'Walnut table', 'desk', 'common', 'tables', [72, 88, 32, 32]),
  item('desk_white', 'White tablecloth table', 'desk', 'uncommon', 'tables', [72, 216, 32, 32]),
  item('desk_cyan', 'Cyan tablecloth table', 'desk', 'uncommon', 'tables', [72, 280, 32, 32]),
  item('desk_pink', 'Pink tablecloth table', 'desk', 'uncommon', 'tables', [72, 408, 32, 32]),
  item('desk_check_red', 'Red checked table', 'desk', 'uncommon', 'tables', [72, 856, 32, 32]),
  item('table_pine', 'Long pine table', 'table', 'uncommon', 'tables', [8, 24, 48, 32]),
  item('table_white', 'Long white tablecloth table', 'table', 'rare', 'tables', [8, 216, 48, 32]),
  item('table_check_red', 'Long red checked table', 'table', 'rare', 'tables', [8, 856, 48, 32]),
  item('stove', 'Stove', 'stove', 'uncommon', 'kitchen', [0, 0, 16, 32]),
  item('stove_lit', 'Lit stove', 'stove', 'uncommon', 'kitchen', [16, 0, 16, 32]),
  item('stove_oven', 'Bread oven', 'stove', 'rare', 'kitchen', [48, 0, 16, 32]),
  item('stove_iron', 'Iron wood stove', 'stove', 'uncommon', 'fireplaces', [64, 16, 16, 32]),
  item('sink_oak', 'Kitchen sink', 'sink', 'uncommon', 'kitchen', [0, 32, 16, 32]),
  item('sink_steel', 'Steel kitchen sink', 'sink', 'uncommon', 'kitchen', [96, 32, 16, 32]),
  item('fridge', 'Fridge', 'fridge', 'rare', 'kitchen', [0, 64, 16, 32]),
  item('fridge_magnets', 'Fridge with magnets', 'fridge', 'rare', 'kitchen', [16, 64, 16, 32]),
  item('barrel_apples', 'Apple barrel', 'barrel', 'common', 'decor', [0, 128, 16, 32]),
  item('barrel_water', 'Water barrel', 'barrel', 'common', 'decor', [16, 128, 16, 32]),
  item('barrel_cask', 'Wine cask', 'barrel', 'uncommon', 'decor', [64, 224, 16, 32]),

  // Bathroom
  item('bathtub', 'Bathtub', 'bathtub', 'rare', 'bathroom', [0, 64, 32, 32]),
  item('bathtub_full', 'Filled bathtub', 'bathtub', 'rare', 'bathroom', [32, 64, 32, 32]),
  item('toilet', 'Toilet', 'toilet', 'common', 'bathroom', [16, 144, 16, 32]),
  item('basin', 'Pedestal sink', 'basin', 'common', 'bathroom', [0, 0, 16, 32]),
  item('basin_full', 'Filled pedestal sink', 'basin', 'common', 'bathroom', [16, 0, 16, 32]),
  item('vanity_oak', 'Oak vanity', 'vanity', 'uncommon', 'bathroom', [0, 32, 32, 32]),
  item('vanity_walnut', 'Walnut vanity', 'vanity', 'uncommon', 'bathroom', [64, 32, 32, 32]),

  // Study & music
  item('bookcase', 'Bookcase', 'bookcase', 'uncommon', 'bookshelves', [0, 0, 16, 32]),
  item('bookcase_arched', 'Arched bookcase', 'bookcase', 'uncommon', 'bookshelves', [0, 32, 16, 32]),
  item('piano', 'Upright piano', 'piano', 'rare', 'other', [0, 319, 32, 32]),
  item('piano_keyboard', 'Keyboard', 'piano', 'rare', 'other', [64, 320, 32, 32]),
  item('guitar', 'Acoustic guitar', 'guitar', 'uncommon', 'other', [32, 320, 16, 32]),
  item('guitar_electric', 'Electric guitar', 'guitar', 'rare', 'other', [48, 320, 16, 32]),

  // Plants
  item('plant', 'Fiddle-leaf plant', 'plant', 'common', 'plants', [32, 0, 16, 32]),
  item('plant_a', 'Cactus', 'plant', 'common', 'plants', [0, 0, 16, 32]),
  item('plant_b', 'Snake plant', 'plant', 'common', 'plants', [16, 0, 16, 32]),
  item('plant_c', 'Ivy', 'plant', 'common', 'plants', [48, 0, 16, 32]),
  item('plant_d', 'Sunflowers', 'plant', 'common', 'plants', [64, 0, 16, 32]),
  item('plant_e', 'Lavender', 'plant', 'common', 'plants', [80, 0, 16, 32]),
  item('plant_f', 'Red salvia', 'plant', 'common', 'plants', [96, 0, 16, 32]),
  item('pot_green', 'Leafy flowerpot', 'plant', 'common', 'decor', [0, 192, 16, 32]),
  item('pot_purple', 'Purple flowerpot', 'plant', 'common', 'decor', [16, 192, 16, 32]),
  item('pot_pink', 'Pink flowerpot', 'plant', 'common', 'decor', [48, 192, 16, 32]),
  item('pot_blue', 'Blue flowerpot', 'plant', 'uncommon', 'decor', [80, 192, 16, 32]),
  item('plant_tree', 'Potted tree', 'plant', 'uncommon', 'decor', [32, 96, 16, 32]),
  item('planter_wood', 'Wooden planter', 'planter', 'uncommon', 'planters', [8, 48, 32, 16]),
  item('planter_stone', 'Stone planter', 'planter', 'uncommon', 'planters', [8, 64, 32, 16]),

  // Chests
  item('chest', 'Wooden chest', 'chest', 'common', 'chest', [0, 0, 16, 16]),
  item('chest_iron', 'Iron chest', 'chest', 'uncommon', 'chest_metal', [0, 0, 16, 16]),
  item('chest_gold', 'Golden chest', 'chest', 'rare', 'chest_gold', [0, 0, 16, 16]),
  item('chest_ruby', 'Ruby chest', 'chest', 'treasure', 'chest_jeweled', [0, 0, 16, 16]),
  item('chest_sapphire', 'Sapphire chest', 'chest', 'treasure', 'chest_jeweled', [0, 32, 16, 16]),
  item('chest_emerald', 'Emerald chest', 'chest', 'treasure', 'chest_jeweled', [0, 48, 16, 16]),
];

export const CATALOG_BY_ID: Record<CatalogItemId, CatalogEntry> = Object.fromEntries(
  CATALOG.map((e) => [e.id, e]),
);

// The editor's tabs. Every category belongs to exactly one.
export const CATALOG_GROUPS = [
  { id: 'living', label: 'Living', categories: ['sofa', 'armchair', 'stool', 'chair', 'fireplace', 'clock', 'rug', 'mat', 'painting', 'lamp'] },
  { id: 'bedroom', label: 'Bedroom', categories: ['bed', 'single_bed', 'wardrobe', 'cabinet', 'sideboard', 'nightstand', 'mirror'] },
  { id: 'kitchen', label: 'Kitchen', categories: ['desk', 'table', 'stove', 'sink', 'fridge', 'barrel'] },
  { id: 'bathroom', label: 'Bath', categories: ['bathtub', 'toilet', 'basin', 'vanity'] },
  { id: 'study', label: 'Study', categories: ['bookcase', 'piano', 'guitar'] },
  { id: 'plants', label: 'Plants', categories: ['plant', 'planter'] },
  { id: 'chests', label: 'Chests', categories: ['chest'] },
] as const satisfies ReadonlyArray<{ id: string; label: string; categories: readonly CatalogCategory[] }>;
export type CatalogGroupId = (typeof CATALOG_GROUPS)[number]['id'];

export const CATALOG_BY_GROUP = Object.fromEntries(
  CATALOG_GROUPS.map((g) => [g.id, CATALOG.filter((e) => (g.categories as readonly CatalogCategory[]).includes(e.category))]),
) as Record<CatalogGroupId, CatalogEntry[]>;

// Pieces you walk over rather than around.
export const WALKABLE: ReadonlySet<CatalogCategory> = new Set<CatalogCategory>(['rug', 'mat']);
