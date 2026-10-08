import type { CatalogCategory, CatalogEntry, CatalogItemId, CatalogLayer, CatalogTier } from './types';

// Every furniture sprite sheet, by its file name in public/assets/furniture/
// (scripts/install-assets.sh copies them there). BootScene loads each one as
// the Phaser texture `furn_<sheet>` and carves every catalog entry's frame out of it.
export const FURNITURE_SHEETS = [
  'tables', 'bookshelves', 'beds', 'chest', 'plants', 'decor', 'lamps', 'carpets',
  'chairs', 'other', 'bathroom', 'kitchen', 'clocks', 'fireplaces', 'planters',
  'chest_gold', 'chest_jeweled', 'chest_metal', 'windows', 'tabletop', 'counters', 'festive',
  'desert_rugs', 'desert_pots', 'golden_pots', 'curios', 'tech',
] as const;
export type FurnitureSheet = (typeof FURNITURE_SHEETS)[number];

export const furnitureTextureKey = (sheet: FurnitureSheet) => `furn_${sheet}`;
// Our own drawn art is committed under public/art; the licensed packs are gitignored under public/assets.
export const furnitureSheetUrl = (sheet: FurnitureSheet) =>
  sheet === 'tech' ? '/art/tech.png' : `/assets/furniture/${sheet}.png`;

// The bookshelf isn't a catalog item (it's structural and always present), but
// it's carved from the same sheet as the placeable bookcases.
export const SHELF_SHEET: FurnitureSheet = 'bookshelves';
export const SHELF_RECT: [number, number, number, number] = [16, 0, 32, 32];

// What else a room's shelf can look like, so a kitchen or bedroom needn't keep a bookshelf.
// Each is a catalog piece, so its sprite and footprint come from CATALOG_BY_ID. A wardrobe
// also still changes your outfit.
export const NOTE_STORE_ITEMS: CatalogItemId[] = [
  'fridge_magnets', 'cabinet_oak', 'cabinet_walnut', 'wardrobe_oak', 'wardrobe_pine', 'wardrobe_walnut',
];

// What the notes look like once it's open: books, food in a fridge, or clothes on a rail.
export type ShelfLook = 'books' | 'fridge' | 'wardrobe';
export function shelfLook(item: CatalogItemId | undefined): ShelfLook {
  const category = item ? CATALOG_BY_ID[item]?.category : undefined;
  return category === 'fridge' || category === 'wardrobe' ? category : 'books';
}

type Rect = [number, number, number, number];
type Rotations = CatalogEntry['rotations'];

// Only a left/right mirror for almost everything, since no rotated art exists;
// square, symmetric sprites (rugs, the painting) can take a full quarter-turn.
const MIRROR: Rotations = [0, 180];
const TURN: Rotations = [0, 90, 180, 270];

const RUGS: CatalogCategory[] = ['rug', 'mat', 'mat_small', 'rug_wide'];
const WALL: CatalogCategory[] = [
  'painting', 'window', 'window_wide', 'wall_clock', 'wall_mirror', 'wall_mirror_wide', 'towel', 'pot_rack',
  'wreath', 'stocking',
];
const TABLETOP: CatalogCategory[] = [
  'table_lamp', 'candle', 'potion', 'book', 'dish', 'food', 'vase', 'trinket', 'toiletry', 'tabletop_plant', 'gift',
  'computer', 'laptop',
];

export function layerOf(category: CatalogCategory): CatalogLayer {
  if (RUGS.includes(category)) return 'rug';
  if (WALL.includes(category)) return 'wall';
  if (TABLETOP.includes(category)) return 'tabletop';
  return 'floor';
}

// What tabletop pieces can stand on, and how many pixels above the bottom of the piece's back
// row its top is, so a candle stands on the table instead of in front of it.
export const SURFACES: Partial<Record<CatalogCategory, number>> = {
  desk: 2, table: 2, table_tall: 2, sideboard: 9, nightstand: 9, counter: 9,
  dresser: 12, dresser_wide: 12, writing_desk: 10,
};

type Options = { rotations?: Rotations; base?: [number, number]; views?: CatalogEntry['views'] };

// The footprint is the rect in tiles unless `base` says the sprite is taller than what it
// stands on, so the Phaser frame, the editor thumbnail and the tiles a piece blocks agree.
function item(
  id: CatalogItemId,
  name: string,
  category: CatalogCategory,
  tier: CatalogTier,
  sheet: FurnitureSheet,
  rect: Rect,
  options: Rotations | Options = {},
): CatalogEntry {
  const { rotations = MIRROR, base, views } = Array.isArray(options) ? { rotations: options } : options;
  return {
    id,
    name,
    category,
    tier,
    layer: layerOf(category),
    textureKey: furnitureTextureKey(sheet),
    frameKey: id,
    footprint: base ?? [rect[2] / 16, rect[3] / 16],
    rotations,
    sheetUrl: furnitureSheetUrl(sheet),
    rect,
    ...(views ? { views } : {}),
  };
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

// The five upholstery colours of the chairs sheet, one 64px band each from y 128.
const UPHOLSTERY = ['peach', 'blue', 'green', 'rose', 'gold'] as const;
// The 14 table finishes, one 64px band each.
const TABLE_FINISHES: Array<[string, string, CatalogTier]> = [
  ['pine', 'pine', 'common'], ['walnut', 'walnut', 'common'], ['oak', 'oak', 'common'],
  ['white', 'white tablecloth', 'uncommon'], ['cyan', 'cyan tablecloth', 'uncommon'],
  ['green', 'green tablecloth', 'uncommon'], ['pink', 'pink tablecloth', 'uncommon'],
  ['yellow', 'yellow tablecloth', 'uncommon'], ['red', 'red tablecloth', 'uncommon'],
  ['check_blue', 'blue checked', 'uncommon'], ['check_green', 'green checked', 'uncommon'],
  ['check_pink', 'pink checked', 'uncommon'], ['check_yellow', 'yellow checked', 'uncommon'],
  ['check_red', 'red checked', 'uncommon'],
];
const up = (t: CatalogTier): CatalogTier => (t === 'common' ? 'uncommon' : t === 'uncommon' ? 'rare' : 'treasure');
// Furniture_Other.png: each wood comes with a grained and a plain top, side by side.
const WOODS: Array<[string, string]> = [
  ['oak', 'Oak'], ['oak_plain', 'Plain oak'], ['pine', 'Pine'], ['pine_plain', 'Plain pine'],
  ['walnut', 'Walnut'], ['walnut_plain', 'Plain walnut'],
];
// Kitchen.png's counters, one 128px block per finish.
const COUNTER_FINISHES = [
  ['pine', 'Pine'], ['oak', 'Oak'], ['walnut', 'Walnut'], ['red', 'Red'], ['teal', 'Teal'],
  ['pink', 'Pink'], ['butter', 'Butter'], ['slate', 'Slate'],
] as const;
const COUNTER_FRONTS = ['drawer', 'cupboard', 'panel', 'double drawer', 'double door', 'drawer and door', 'door and drawer'];
// Carpets.png: one 80px band per colour.
const CARPETS: Array<[string, string, CatalogTier]> = [
  ['white', 'White', 'common'], ['cyan', 'Cyan', 'common'], ['green', 'Green', 'uncommon'],
  ['pink', 'Pink', 'uncommon'], ['yellow', 'Yellow', 'common'], ['red', 'Red', 'uncommon'],
  ['royal_blue', 'Royal blue', 'rare'], ['royal_red', 'Royal red', 'rare'],
];
// House_Plants.png: eight plants across, a 128px band per pot colour.
const POTTED = [
  ['cactus', 'Cactus'], ['snake', 'Snake plant'], ['fiddle', 'Fiddle-leaf plant'], ['ivy', 'Ivy'],
  ['sunflowers', 'Sunflowers'], ['lavender', 'Lavender'], ['salvia', 'Red salvia'], ['forget_me_not', 'Forget-me-nots'],
] as const;
const POTS: Array<[string, string, CatalogTier]> = [
  ['clay', 'clay', 'common'], ['white', 'white', 'uncommon'], ['blue', 'blue', 'uncommon'],
  ['pink', 'pink', 'uncommon'], ['orange', 'orange', 'uncommon'],
];
const BRIGHT = ['red', 'blue', 'green', 'orange', 'pink'] as const;

const ORIGINAL_PLANTS: Record<string, CatalogItemId> = {
  cactus: 'plant_a', snake: 'plant_b', fiddle: 'plant', ivy: 'plant_c',
  sunflowers: 'plant_d', lavender: 'plant_e', salvia: 'plant_f',
};

function generated(): CatalogEntry[] {
  const out: CatalogEntry[] = [];

  // Seating
  const tones = [['oak', 'Oak'], ['pine', 'Pine'], ['walnut', 'Walnut']] as const;
  const backs = [['ladder', 'ladder-back'], ['spindle', 'spindle'], ['arched', 'arched'], ['panel', 'panel-back']] as const;
  const originalChairs: Record<string, true> = { ladder_oak: true, spindle_pine: true, arched_walnut: true };
  backs.forEach(([b, bn], row) => tones.forEach(([t, tn], col) => {
    if (originalChairs[`${b}_${t}`]) return;
    out.push(item(`chair_${b}_${t}`, `${tn} ${bn} chair`, 'chair', 'common', 'chairs', [col * 64 + 16, row * 32, 16, 32]));
  }));
  UPHOLSTERY.forEach((c, i) => {
    const y = 128 + i * 64;
    const C = cap(c);
    out.push(item(`armchair_${c}_high`, `${C} wingback armchair`, 'armchair', 'rare', 'chairs', [16, y + 32, 16, 32]));
    out.push(item(`sofa_${c}_high`, `${C} high-back sofa`, 'sofa', 'rare', 'chairs', [80, y + 32, 32, 32]));
    out.push(item(`chair_${c}_cushion`, `${C} cushioned chair`, 'chair', 'uncommon', 'chairs', [176, y + 32, 16, 32]));
    out.push(item(`stool_${c}_cushion`, `${C} cushioned stool`, 'stool', 'common', 'chairs', [176, y + 16, 16, 16]));
    out.push(item(`stool_${c}_foot`, `${C} footstool`, 'stool', 'common', 'chairs', [192, y + 16, 16, 16]));
    out.push(item(`stool_${c}_ottoman`, `${C} ottoman`, 'stool', 'uncommon', 'chairs', [208, y + 16, 16, 16]));
  });
  out.push(item('bench_oak', 'Oak bench', 'bench', 'common', 'decor', [0, 0, 32, 16]));
  out.push(item('bench_long', 'Plank bench', 'bench', 'common', 'decor', [0, 112, 32, 16]));

  // Tables
  TABLE_FINISHES.forEach(([key, name, tier], i) => {
    const y = i * 64;
    const small = `desk_${key}`;
    if (!ORIGINAL_DESKS.has(small)) out.push(item(small, `${cap(name)} table`, 'desk', tier, 'tables', [72, y + 24, 32, 32]));
    const long = `table_${key}`;
    if (!ORIGINAL_DESKS.has(long)) out.push(item(long, `Long ${name} table`, 'table', up(tier), 'tables', [8, y + 24, 48, 32]));
    out.push(item(`table_tall_${key}`, `Tall ${name} table`, 'table_tall', up(tier), 'tables', [120, y + 8, 32, 48]));
  });
  WOODS.forEach(([key, name], i) => {
    out.push(item(`writing_desk_${key}`, `${name} writing desk`, 'writing_desk', 'uncommon', 'other', [i * 32, 16, 32, 32], { base: [2, 1] }));
  });

  // Beds
  const bedColours = ['peach', 'blue', 'green', 'pink', 'yellow', 'red'];
  bedColours.forEach((c, i) => {
    out.push(item(`bed_side_${c}`, `${cap(c)} daybed`, 'bed_side', 'uncommon', 'beds', [48, i * 32, 32, 32]));
  });
  out.push(item('single_bed_pink', 'Pink single bed', 'single_bed', 'common', 'beds', [32, 96, 16, 32]));
  out.push(item('single_bed_yellow', 'Yellow single bed', 'single_bed', 'common', 'beds', [32, 128, 16, 32]));

  // Storage
  WOODS.forEach(([key, name], i) => {
    if (!ORIGINAL_STORAGE.has(`nightstand_${key}`)) out.push(item(`nightstand_${key}`, `${name} nightstand`, 'nightstand', 'common', 'other', [i * 16, 0, 16, 16]));
    out.push(item(`dresser_${key}`, `${name} dresser`, 'dresser', 'common', 'other', [i * 16, 128, 16, 32], { base: [1, 1] }));
    if (!ORIGINAL_STORAGE.has(`sideboard_${key}`)) out.push(item(`sideboard_${key}`, `${name} sideboard`, 'sideboard', 'common', 'other', [i * 32, 160, 32, 16]));
    out.push(item(`dresser_double_${key}`, `${name} double dresser`, 'dresser_wide', 'uncommon', 'other', [i * 32, 176, 32, 32], { base: [2, 1] }));
    out.push(item(`console_${key}`, `${name} console`, 'dresser_wide', 'uncommon', 'other', [i * 32, 208, 32, 32], { base: [2, 1] }));
    out.push(item(`chest_of_drawers_${key}`, `${name} chest of drawers`, 'dresser_wide', 'uncommon', 'other', [i * 32, 272, 32, 32], { base: [2, 1] }));
  });
  const cabinetStyles = [
    ['oak_flat', 'Flat-top oak'], ['oak_arched', 'Arched oak'], ['pine_flat', 'Flat-top pine'],
    ['pine_arched', 'Arched pine'], ['walnut_flat', 'Flat-top walnut'], ['walnut_arched', 'Arched walnut'],
  ];
  const originalCabinets: Record<string, CatalogItemId> = { oak_arched: 'cabinet_oak', walnut_arched: 'cabinet_walnut' };
  const originalWardrobes: Record<string, CatalogItemId> = { oak_flat: 'wardrobe_oak', pine_arched: 'wardrobe_pine', walnut_arched: 'wardrobe_walnut' };
  cabinetStyles.forEach(([key, name], i) => {
    if (!originalCabinets[key]) out.push(item(`cabinet_${key}`, `${name} cabinet`, 'cabinet', 'common', 'other', [i * 16, 48, 16, 32]));
    if (!originalWardrobes[key]) out.push(item(`wardrobe_${key}`, `${name} wardrobe`, 'wardrobe', 'uncommon', 'other', [i * 32, 80, 32, 32]));
  });
  const shelfFill = [['', 'Full'], ['_half', 'Half-full'], ['_sparse', 'Sparse'], ['_empty', 'Empty']] as const;
  shelfFill.forEach(([key, name], i) => {
    for (const [arched, row] of [['', 0], ['_arched', 32]] as const) {
      const label = `${name}${arched ? ' arched' : ''}`.toLowerCase();
      if (i > 0) out.push(item(`bookcase${key}${arched}`, `${cap(label)} bookcase`, 'bookcase', 'uncommon', 'bookshelves', [i * 48, row, 16, 32]));
      out.push(item(`bookcase_wide${key}${arched}`, `${cap(label)} wide bookcase`, 'bookcase_wide', 'rare', 'bookshelves', [i * 48 + 16, row, 32, 32]));
    }
  });
  out.push(item('bookcase_tall', 'Tall bookcase', 'bookcase_tall', 'rare', 'bookshelves', [0, 64, 32, 48]));
  out.push(item('bookcase_tall_dark', 'Tall dark bookcase', 'bookcase_tall', 'rare', 'bookshelves', [32, 64, 32, 48]));

  // Kitchen
  COUNTER_FINISHES.forEach(([key, name], i) => {
    const x = i * 128;
    COUNTER_FRONTS.forEach((front, row) => {
      out.push(item(`counter_${key}_${row}`, `${name} ${front} counter`, 'counter', 'common', 'counters', [x + 16, 144 + row * 32, 16, 32], { base: [1, 1] }));
    });
    out.push(item(`counter_${key}_end`, `${name} counter end`, 'counter', 'common', 'counters', [x + 48, 144, 16, 32], { base: [1, 1] }));
  });
  const sinkFinishes = [['pine', 'Pine'], ['walnut', 'Walnut'], ['birch', 'Birch'], ['pink', 'Pink'], ['butter', 'Butter']];
  sinkFinishes.forEach(([key, name], i) => {
    out.push(item(`sink_${key}`, `${name} kitchen sink`, 'sink', 'uncommon', 'kitchen', [16 + i * 16, 32, 16, 32]));
  });
  out.push(item('stove_oven_cold', 'Cold bread oven', 'stove', 'uncommon', 'kitchen', [32, 0, 16, 32]));
  out.push(item('stove_range', 'Range', 'stove', 'uncommon', 'kitchen', [80, 0, 16, 32]));
  out.push(item('stove_iron_cold', 'Cold iron stove', 'stove', 'uncommon', 'fireplaces', [80, 16, 16, 32]));
  out.push(item('stove_potbelly', 'Pot-bellied stove', 'stove', 'rare', 'decor', [32, 0, 16, 32]));
  out.push(item('stove_potbelly_lit', 'Lit pot-bellied stove', 'stove', 'rare', 'decor', [32, 32, 16, 32]));
  out.push(item('fridge_mini', 'Mini fridge', 'fridge', 'uncommon', 'kitchen', [32, 64, 16, 32]));
  out.push(item('fridge_mini_magnets', 'Mini fridge with magnets', 'fridge', 'uncommon', 'kitchen', [48, 64, 16, 32]));
  out.push(item('pot_rack', 'Pot rack', 'pot_rack', 'uncommon', 'kitchen', [64, 64, 32, 32]));
  const tubs = [['greens', 'Greens'], ['empty', 'Empty'], ['lidded', 'Lidded']] as const;
  tubs.forEach(([key, name], i) => {
    out.push(item(`barrel_${key}`, `${name} barrel`, 'barrel', 'common', 'decor', [32 + i * 16, 128, 16, 32]));
  });
  [['apples', 'Apple'], ['water', 'Water'], ['greens', 'Greens'], ['empty', 'Empty'], ['lidded', 'Lidded']].forEach(([key, name], i) => {
    out.push(item(`tub_${key}`, `${name} tub`, 'barrel', 'common', 'decor', [i * 16, 160, 16, 32]));
  });
  out.push(item('milk_can', 'Milk can', 'barrel', 'common', 'decor', [80, 128, 16, 32]));

  // Bathroom
  out.push(item('basin_tall', 'Tall pedestal sink', 'basin', 'common', 'bathroom', [32, 0, 16, 32]));
  out.push(item('basin_tall_full', 'Filled tall pedestal sink', 'basin', 'common', 'bathroom', [48, 0, 16, 32]));
  out.push(item('vanity_pine', 'Pine vanity', 'vanity', 'uncommon', 'bathroom', [32, 32, 32, 32]));
  out.push(item('bathtub_square', 'Square bathtub', 'bathtub', 'rare', 'bathroom', [64, 64, 32, 32]));
  out.push(item('bathtub_square_full', 'Filled square bathtub', 'bathtub', 'rare', 'bathroom', [96, 64, 32, 32]));
  ['', '_full', '_square', '_square_full'].forEach((key, i) => {
    const name = `${key.includes('full') ? 'Filled ' : ''}${key.includes('square') ? 'square ' : ''}long bathtub`;
    out.push(item(`bathtub_long${key}`, cap(name), 'bathtub_tall', 'rare', 'bathroom', [i * 16, 96, 16, 48]));
  });
  out.push(item('toilet_tank', 'Toilet with tank', 'toilet', 'common', 'bathroom', [48, 144, 16, 32]));
  const soaps = [['green', 'Green soap'], ['orange', 'Orange soap'], ['blue', 'Blue soap'], ['pink', 'Pink soap'], ['red', 'Red soap'], ['duck', 'Rubber duck'], ['duck_float', 'Floating rubber duck']];
  soaps.forEach(([key, name], i) => out.push(item(`soap_${key}`, name, 'toiletry', key.startsWith('duck') ? 'uncommon' : 'common', 'bathroom', [16 + i * 16, 176, 16, 16])));
  const frames = [['wood', 'Wooden'], ['birch', 'Birch'], ['walnut', 'Walnut'], ['silver', 'Silver']] as const;
  frames.forEach(([key, name], i) => {
    const y = 224 + i * 32;
    out.push(item(`wall_mirror_${key}`, `${name} wall mirror`, 'wall_mirror', 'uncommon', 'bathroom', [0, y, 16, 32]));
    out.push(item(`wall_mirror_${key}_tall`, `${name} tall wall mirror`, 'wall_mirror', 'uncommon', 'bathroom', [16, y, 16, 32]));
    out.push(item(`wall_mirror_${key}_oval`, `${name} oval wall mirror`, 'wall_mirror', 'rare', 'bathroom', [32, y, 16, 32]));
    out.push(item(`wall_mirror_${key}_wide`, `${name} wide wall mirror`, 'wall_mirror_wide', 'rare', 'bathroom', [48, y, 32, 32]));
    out.push(item(`wall_mirror_${key}_long`, `${name} long wall mirror`, 'wall_mirror_wide', 'rare', 'bathroom', [80, y, 32, 32]));
  });
  ['white', 'green', 'blue', 'yellow', 'pink', 'red'].forEach((c, i) => {
    out.push(item(`towel_${c}`, `${cap(c)} towel`, 'towel', 'common', 'bathroom', [i * 16, 352, 16, 16]));
  });

  // Lighting
  const shades = [['peach', 'Peach'], ['blue', 'Blue'], ['green', 'Green'], ['pink', 'Pink'], ['yellow', 'Yellow']] as const;
  const poles = [['brass', 'brass', 0], ['silver', 'silver', 64], ['wood', 'wooden', 128]] as const;
  const originalLamps: Record<string, CatalogItemId> = {
    peach_brass: 'lamp', blue_brass: 'lamp_blue', green_brass: 'lamp_green', pink_brass: 'lamp_pink',
    yellow_brass: 'lamp_yellow', peach_silver: 'lamp_silver', blue_silver: 'lamp_silver_blue', green_wood: 'lamp_wood_green',
  };
  poles.forEach(([pole, pname, y], p) => shades.forEach(([shade, sname], i) => {
    if (!originalLamps[`${shade}_${pole}`]) out.push(item(`lamp_${shade}_${pole}`, `${sname} ${pname} floor lamp`, 'lamp', 'uncommon', 'lamps', [i * 32, y, 16, 32]));
    out.push(item(`table_lamp_${shade}_${pole}`, `${sname} ${pname} table lamp`, 'table_lamp', 'common', 'lamps', [i * 32, 192 + p * 32, 16, 32], { base: [1, 1] }));
  }));
  ['red', 'blue', 'purple'].forEach((c, i) => {
    out.push(item(`mushroom_lamp_${c}`, `${cap(c)} mushroom lamp`, 'table_lamp', 'rare', 'decor', [80, 48 + i * 16, 16, 16]));
  });
  const waxes = ['red', 'magenta', 'lilac', 'purple', 'indigo', 'teal', 'orange', 'gold', 'green', 'blue'];
  waxes.forEach((c, i) => {
    const x = (i % 5) * 16;
    const y = i < 5 ? 0 : 16;
    out.push(item(`candle_${c}`, `${cap(c)} candle`, 'candle', 'common', 'tabletop', [x, 64 + y, 16, 16]));
    out.push(item(`candle_${c}_holder`, `${cap(c)} candle in a holder`, 'candle', 'uncommon', 'tabletop', [x, 96 + y, 16, 16]));
  });
  out.push(item('candlestick_iron', 'Iron candlestick', 'candle', 'uncommon', 'curios', [16, 16, 16, 32], { base: [1, 1] }));
  out.push(item('candelabra_iron', 'Iron candelabra', 'candle', 'rare', 'curios', [32, 16, 16, 32], { base: [1, 1] }));

  // Wall
  const panes = [['cross', 'Cross-pane'], ['tall', 'Tall'], ['plain', 'Plain']] as const;
  const views = { dusk: -64, night: -32, dawn: 32 };
  panes.forEach(([key, name], i) => {
    out.push(item(`window_${key}`, `${name} window`, 'window', 'uncommon', 'windows', [i * 16, 64, 16, 32], { views }));
  });
  out.push(item('window_wide', 'Wide window', 'window_wide', 'rare', 'windows', [48, 64, 32, 32], { views }));
  const clockFaces = ['red', 'orange', 'blue', 'green', 'white', 'wooden', 'purple', 'silver'];
  clockFaces.forEach((c, i) => {
    out.push(item(`wall_clock_${c}`, `${cap(c)} wall clock`, 'wall_clock', 'common', 'clocks', [32 + (i % 4) * 16, i < 4 ? 0 : 16, 16, 16]));
  });

  // Tabletop
  const potionColours = ['red', 'blue', 'green', 'orange', 'pink'];
  potionColours.forEach((c, i) => {
    out.push(item(`potion_${c}`, `${cap(c)} potion`, 'potion', 'uncommon', 'tabletop', [i * 16, 0, 16, 16]));
    out.push(item(`flask_${c}`, `${cap(c)} flask`, 'potion', 'uncommon', 'tabletop', [i * 16, 16, 16, 16]));
    out.push(item(`tonic_${c}`, `${cap(c)} tonic`, 'potion', 'uncommon', 'tabletop', [i * 16, 32, 16, 16]));
  });
  ['red', 'cyan', 'green', 'orange', 'violet'].forEach((c, i) => {
    out.push(item(`elixir_${c}`, `${cap(c)} elixir`, 'potion', 'rare', 'tabletop', [i * 16, 128, 16, 16]));
    out.push(item(`vial_${c}`, `${cap(c)} vial`, 'potion', 'rare', 'tabletop', [i * 16, 160, 16, 16]));
  });
  const dishes: Array<[string, string, number, number]> = [
    ['mug_white', 'White mug', 80, 0], ['mug_clay', 'Clay mug', 96, 0],
    ['bowl_water', 'Bowl of water', 80, 16], ['bowl_white', 'White bowl', 96, 16], ['plate_white', 'White plate', 112, 16],
    ['bowl_wood_water', 'Wooden bowl of water', 80, 32], ['bowl_wood', 'Wooden bowl', 96, 32], ['plate_wood', 'Wooden plate', 112, 32],
    ['cauldron', 'Cauldron', 112, 48], ['frying_pan', 'Frying pan', 128, 48],
  ];
  for (const [key, name, x, y] of dishes) out.push(item(key, name, 'dish', 'common', 'tabletop', [x, y, 16, 16]));
  const foods: Array<[string, string, number]> = [['bread', 'Loaf of bread', 0], ['ham', 'Ham', 48], ['cheese', 'Wedge of cheese', 64]];
  for (const [key, name, x] of foods) out.push(item(key, name, 'food', 'common', 'tabletop', [x, 48, 16, 16]));
  out.push(item('key_brass', 'Brass key', 'trinket', 'uncommon', 'tabletop', [16, 48, 16, 16]));
  out.push(item('seedling', 'Seedling', 'tabletop_plant', 'common', 'tabletop', [32, 48, 16, 16]));
  out.push(item('fern_pot', 'Potted fern', 'tabletop_plant', 'common', 'decor', [64, 112, 16, 16]));
  out.push(item('book_open', 'Open book', 'book', 'common', 'tabletop', [80, 48, 16, 16]));
  out.push(item('book_open_blank', 'Open journal', 'book', 'common', 'tabletop', [96, 48, 16, 16]));
  ['red', 'blue', 'green', 'orange'].forEach((c, i) => {
    out.push(item(`book_${c}`, `${cap(c)} book`, 'book', 'common', 'tabletop', [80 + (i % 2) * 32, 64 + Math.floor(i / 2) * 16, 16, 16]));
    out.push(item(`book_${c}_stack`, `${cap(c)} books`, 'book', 'common', 'tabletop', [96 + (i % 2) * 32, 64 + Math.floor(i / 2) * 16, 16, 16]));
  });
  [['clay', 'Clay pot'], ['sack', 'Grain sack'], ['jar', 'Clay jar'], ['urn', 'Clay urn'], ['bowl', 'Clay bowl']].forEach(([key, name], i) => {
    out.push(item(`desert_${key}`, name, 'vase', 'common', 'desert_pots', [i * 16, 0, 16, 16]));
  });
  ['ewer', 'pot', 'goblet'].forEach((key, i) => {
    out.push(item(`golden_${key}`, `Golden ${key}`, 'vase', 'treasure', 'golden_pots', [i * 16, 0, 16, 16]));
  });
  out.push(item('vase_brown', 'Brown vase', 'vase', 'uncommon', 'curios', [80, 0, 16, 32], { base: [1, 1] }));
  out.push(item('vase_small', 'Small vase', 'vase', 'common', 'curios', [80, 32, 16, 16]));
  out.push(item('vase_ringed', 'Ringed vase', 'vase', 'rare', 'curios', [80, 48, 16, 32], { base: [1, 1] }));
  out.push(item('vase_dark', 'Dark vase', 'vase', 'uncommon', 'curios', [80, 80, 16, 16]));
  out.push(item('urn_dark', 'Dark urn', 'vase', 'uncommon', 'curios', [96, 32, 16, 32], { base: [1, 1] }));
  out.push(item('vase_dark_tall', 'Tall dark vase', 'vase', 'rare', 'curios', [96, 64, 16, 32], { base: [1, 1] }));

  // Rugs
  CARPETS.forEach(([key, name, tier], i) => {
    const y = i * 80;
    const bigs = [['bordered', 'bordered', 48], ['plain', 'plain', 96], ['scalloped', 'scalloped', 144]] as const;
    for (const [k, n, x] of bigs) out.push(item(`rug_${key}_${k}`, `${name} ${n} rug`, 'rug', tier, 'carpets', [x, y, 48, 48], TURN));
    const mats = [['round', 'round mat', 0], ['dot', 'small round mat', 32], ['oval', 'oval mat', 64], ['striped', 'striped mat', 96], ['framed', 'framed mat', 128], ['lace', 'lace mat', 160], ['runner', 'runner', 192]] as const;
    for (const [k, n, x] of mats) {
      if (ORIGINAL_MATS[`${key}_${k}`]) continue;
      out.push(item(`mat_${key}_${k}`, `${name} ${n}`, 'mat', tier, 'carpets', [x, y + 48, 32, 32], TURN));
    }
    out.push(item(`mat_${key}_tiny`, `${name} doily`, 'mat_small', tier, 'carpets', [192, y + 16, 16, 16], TURN));
    out.push(item(`mat_${key}_tiny_oval`, `${name} little oval mat`, 'mat_small', tier, 'carpets', [192, y + 32, 16, 16], TURN));
  });
  [['red', 'Red'], ['blue', 'Blue'], ['green', 'Green']].forEach(([key, name], row) => {
    out.push(item(`rug_desert_${key}`, `${name} desert rug`, 'rug_wide', 'rare', 'desert_rugs', [0, row * 32, 48, 32]));
    out.push(item(`rug_desert_${key}_sun`, `${name} sunburst rug`, 'rug_wide', 'rare', 'desert_rugs', [48, row * 32, 48, 32]));
  });

  // Plants
  POTS.forEach(([pot, potName, tier], p) => {
    POTTED.forEach(([plant, plantName], i) => {
      const y = p * 128;
      if (p > 0 || !ORIGINAL_PLANTS[plant]) {
        out.push(item(`plant_${plant}_${pot}`, `${plantName} in a ${potName} pot`, 'plant', tier, 'plants', [i * 16, y, 16, 32]));
      }
      out.push(item(`plant_${plant}_${pot}_bowl`, `${plantName} in a ${potName} bowl`, 'plant', tier, 'plants', [i * 16, y + 64, 16, 32]));
    });
    out.push(item(`plant_big_${pot}`, `Big leafy plant in a ${potName} pot`, 'plant_big', up(tier), 'plants', [136, p * 128, 32, 32]));
  });
  ['red', 'coral'].forEach((c, i) => {
    out.push(item(`pot_${c}`, `${cap(c)} flowerpot`, 'plant', 'common', 'decor', [32 + i * 32, 192, 16, 32]));
  });
  out.push(item('seedling_pot', 'Potted seedling', 'plant', 'common', 'decor', [48, 96, 16, 32]));
  const planters: Array<[string, string, number, number]> = [
    ['planter_wood_empty', 'Empty wooden planter', 8, 0], ['planter_stone_empty', 'Empty stone planter', 8, 16],
    ['planter_stone_soil', 'Stone planter with soil', 8, 32], ['planter_slate', 'Slate planter', 8, 80],
    ['planter_wood_small', 'Small wooden planter', 48, 48], ['planter_stone_small', 'Small stone planter', 48, 64],
    ['planter_slate_small', 'Small slate planter', 48, 80],
  ];
  for (const [key, name, x, y] of planters) out.push(item(key, name, 'planter', 'uncommon', 'planters', [x, y, 32, 16]));
  [['wood', 'Wooden'], ['stone', 'Stone'], ['slate', 'Slate']].forEach(([key, name], i) => {
    out.push(item(`planter_grass_${key}`, `${name} grass planter`, 'planter_tall', 'uncommon', 'planters', [88, i * 32, 32, 32]));
    out.push(item(`planter_grass_${key}_small`, `Small ${name.toLowerCase()} grass planter`, 'planter_tall', 'uncommon', 'planters', [128, i * 32, 32, 32]));
  });

  // Festive
  out.push(item('xmas_tree', 'Christmas tree', 'xmas_tree', 'rare', 'festive', [64, 0, 32, 48]));
  out.push(item('xmas_tree_lit', 'Twinkling Christmas tree', 'xmas_tree', 'treasure', 'festive', [96, 0, 32, 48]));
  out.push(item('candy_cane_big', 'Giant candy cane', 'candy_cane', 'uncommon', 'festive', [128, 0, 32, 32]));
  out.push(item('candy_cane_big_hook', 'Giant candy cane hook', 'candy_cane', 'uncommon', 'festive', [160, 0, 32, 32]));
  out.push(item('candy_cane_mint', 'Giant mint candy cane', 'candy_cane', 'uncommon', 'festive', [128, 80, 32, 32]));
  out.push(item('candy_cane_mint_hook', 'Giant mint candy cane hook', 'candy_cane', 'uncommon', 'festive', [160, 80, 32, 32]));
  const giftColours = ['red', 'crimson', 'mint', 'forest', 'orange', 'scarlet', 'lime', 'olive', 'sky', 'azure', 'lilac', 'plum', 'teal', 'cyan', 'violet', 'magenta'];
  giftColours.forEach((c, i) => {
    out.push(item(`gift_${c}`, `${cap(c)} gift`, 'gift', 'common', 'festive', [(i % 4) * 16, 16 + Math.floor(i / 4) * 16, 16, 16]));
  });
  ['warm', 'cool', 'sunny'].forEach((c, i) => {
    out.push(item(`gift_pile_${c}`, `Pile of ${c} gifts`, 'gift_pile', 'uncommon', 'festive', [8 + i * 32, 80, 16, 32], { base: [1, 1] }));
  });
  [['red', 'Red stocking', 96, 80], ['green', 'Green stocking', 112, 80]].forEach(([key, name, x, y]) => {
    out.push(item(`stocking_${key}`, name as string, 'stocking', 'common', 'festive', [x as number, y as number, 16, 16]));
  });
  out.push(item('wreath_berry', 'Holly wreath', 'wreath', 'uncommon', 'festive', [64, 128, 16, 16]));
  out.push(item('wreath_green', 'Pine wreath', 'wreath', 'uncommon', 'festive', [80, 128, 16, 16]));
  out.push(item('wreath_berry_small', 'Little holly wreath', 'wreath', 'common', 'festive', [64, 112, 16, 16]));
  out.push(item('wreath_green_small', 'Little pine wreath', 'wreath', 'common', 'festive', [80, 112, 16, 16]));

  return out;
}

const ORIGINAL_DESKS = new Set([
  'desk_pine', 'desk_walnut', 'desk_white', 'desk_cyan', 'desk_pink', 'desk_check_red',
  'table_pine', 'table_white', 'table_check_red',
]);
const ORIGINAL_STORAGE = new Set(['nightstand_oak', 'nightstand_pine', 'sideboard_oak', 'sideboard_walnut']);
const ORIGINAL_MATS: Record<string, true> = { cyan_round: true, yellow_round: true, royal_red_round: true };

// The original 114 pieces keep their ids and rects, so saved rooms and inventories still
// load; everything after them is generated from the sheets.
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

  // Tech, drawn for Notekeep (scripts/draw-tech.py)
  item('computer_crt', 'Desktop computer', 'computer', 'uncommon', 'tech', [0, 16, 16, 16]),
  item('laptop', 'Laptop', 'laptop', 'uncommon', 'tech', [0, 0, 16, 16]),
  item('arcade_cabinet', 'Arcade cabinet', 'arcade', 'treasure', 'tech', [16, 0, 16, 32], { base: [1, 1] }),
  item('computer_desk', 'Computer desk', 'computer_desk', 'rare', 'tech', [32, 0, 32, 32], { base: [2, 1] }),
  item('tv_console', 'TV and games console', 'tv_console', 'rare', 'tech', [64, 0, 32, 32], { base: [2, 1] }),

  ...generated(),
];

export const CATALOG_BY_ID: Record<CatalogItemId, CatalogEntry> = Object.fromEntries(
  CATALOG.map((e) => [e.id, e]),
);

// The catalogue's tabs, after Stardew's furniture catalogue. Every category belongs to exactly one.
export const CATALOG_GROUPS = [
  { id: 'seating', label: 'Seating', categories: ['chair', 'armchair', 'sofa', 'stool', 'bench'] },
  { id: 'tables', label: 'Tables', categories: ['desk', 'table', 'table_tall', 'writing_desk'] },
  { id: 'beds', label: 'Beds', categories: ['bed', 'single_bed', 'bed_side'] },
  { id: 'storage', label: 'Storage', categories: ['wardrobe', 'cabinet', 'nightstand', 'sideboard', 'dresser', 'dresser_wide', 'bookcase', 'bookcase_wide', 'bookcase_tall', 'chest'] },
  { id: 'rugs', label: 'Rugs', categories: ['rug', 'rug_wide', 'mat', 'mat_small'] },
  { id: 'wall', label: 'Wall', categories: ['window', 'window_wide', 'painting', 'wall_clock', 'wall_mirror', 'wall_mirror_wide', 'towel', 'pot_rack'] },
  { id: 'lighting', label: 'Lighting', categories: ['lamp', 'table_lamp', 'candle', 'fireplace'] },
  { id: 'tabletop', label: 'Tabletop', categories: ['potion', 'book', 'dish', 'food', 'vase', 'trinket', 'toiletry', 'tabletop_plant'] },
  { id: 'plants', label: 'Plants', categories: ['plant', 'plant_big', 'planter', 'planter_tall'] },
  { id: 'kitchen', label: 'Kitchen', categories: ['counter', 'stove', 'sink', 'fridge', 'barrel'] },
  { id: 'bathroom', label: 'Bath', categories: ['bathtub', 'bathtub_tall', 'toilet', 'basin', 'vanity', 'mirror'] },
  { id: 'hobby', label: 'Hobby', categories: ['piano', 'guitar', 'clock'] },
  { id: 'tech', label: 'Tech', categories: ['computer', 'laptop', 'computer_desk', 'tv_console', 'arcade'] },
  { id: 'festive', label: 'Festive', categories: ['xmas_tree', 'candy_cane', 'gift', 'gift_pile', 'wreath', 'stocking'] },
] as const satisfies ReadonlyArray<{ id: string; label: string; categories: readonly CatalogCategory[] }>;
export type CatalogGroupId = (typeof CATALOG_GROUPS)[number]['id'];

export const CATALOG_BY_GROUP = Object.fromEntries(
  CATALOG_GROUPS.map((g) => [g.id, CATALOG.filter((e) => (g.categories as readonly CatalogCategory[]).includes(e.category))]),
) as Record<CatalogGroupId, CatalogEntry[]>;

// What a window shows at `hour` (0-23), so the room's windows follow the player's real day.
export function windowView(hour: number): 'dawn' | 'day' | 'dusk' | 'night' {
  if (hour >= 5 && hour < 8) return 'dawn';
  if (hour >= 8 && hour < 17) return 'day';
  if (hour >= 17 && hour < 20) return 'dusk';
  return 'night';
}

// Pieces you walk over rather than around.
export const WALKABLE: ReadonlySet<CatalogCategory> = new Set<CatalogCategory>(RUGS);

// What Space does when you stand in front of a piece (InteriorScene). A note on the piece, or
// another piece sharing the approach tile, turns Space into a menu.
export type FurnitureAction = 'sit' | 'lie' | 'wardrobe' | 'study' | 'computer' | 'arcade';
export const FURNITURE_ACTIONS: Partial<Record<CatalogCategory, FurnitureAction>> = {
  sofa: 'sit',
  armchair: 'sit',
  chair: 'sit',
  stool: 'sit',
  bench: 'sit',
  bed: 'lie',
  single_bed: 'lie',
  wardrobe: 'wardrobe',
  desk: 'study',
  writing_desk: 'study',
  computer: 'computer',
  laptop: 'computer',
  computer_desk: 'computer',
  tv_console: 'arcade',
  arcade: 'arcade',
};
