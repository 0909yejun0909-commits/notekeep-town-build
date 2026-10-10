// The player's own changes to the town outside: decorations they placed, ground they painted
// and trees they cut down. The town itself is generated from the vault every time it loads
// (game/scenes/OverworldScene.ts); these are laid over it, keyed by world tile, and saved per
// vault like the house exteriors (lib/exteriorStore.ts).

export type TownPropId = 'fountain' | 'bench' | 'lamp' | 'well' | 'barrel' | 'pot' | 'bush' | 'rock' | 'flowers';
export type GroundPaint = 'path' | 'tall' | 'grass';

export type TownProp = { item: TownPropId; gx: number; gy: number };

// What a click does in build mode.
export type TownTool =
  | { kind: 'prop'; item: TownPropId }
  | { kind: 'ground'; paint: GroundPaint }
  | { kind: 'cut' }
  | { kind: 'remove' };

export type TownEdits = {
  // Anchor tiles ("x,y") of the trees cut down.
  cut: string[];
  // Painted tiles; 'grass' undoes a path (generated or painted) or tall grass.
  ground: Record<string, GroundPaint>;
  props: TownProp[];
  // Decorations picked back up: placed again for free.
  bag: Partial<Record<TownPropId, number>>;
};

export type TownPropSpec = {
  id: TownPropId;
  name: string;
  price: number;
  w: number; // footprint in tiles
  h: number;
  blocks: boolean; // whether you can walk through it
  art: { key: string; frame: number }; // the texture the town draws it with, for thumbnails
};

export const TOWN_PROPS: TownPropSpec[] = [
  { id: 'flowers', name: 'Flowers', price: 5, w: 1, h: 1, blocks: false, art: { key: 'flower-anim-1', frame: 0 } },
  { id: 'rock', name: 'Rock', price: 5, w: 1, h: 1, blocks: true, art: { key: 'decor', frame: 45 } },
  { id: 'bush', name: 'Bush', price: 8, w: 1, h: 1, blocks: true, art: { key: 'decor', frame: 50 } },
  { id: 'pot', name: 'Flower pot', price: 10, w: 1, h: 1, blocks: true, art: { key: 'flowers', frame: 5 } },
  { id: 'barrel', name: 'Barrel', price: 10, w: 1, h: 1, blocks: true, art: { key: 'barrels', frame: 7 } },
  { id: 'lamp', name: 'Lamppost', price: 25, w: 1, h: 1, blocks: true, art: { key: 'lamp-posts', frame: 0 } },
  { id: 'bench', name: 'Bench', price: 30, w: 2, h: 1, blocks: true, art: { key: 'benches', frame: 1 } },
  { id: 'well', name: 'Well', price: 80, w: 2, h: 2, blocks: true, art: { key: 'well', frame: 0 } },
  { id: 'fountain', name: 'Fountain', price: 150, w: 2, h: 2, blocks: true, art: { key: 'fountain', frame: 0 } },
];
export const TOWN_PROP_BY_ID = Object.fromEntries(TOWN_PROPS.map((p) => [p.id, p])) as Record<TownPropId, TownPropSpec>;

export type GroundSpec = { id: GroundPaint; name: string; price: number };

// Per tile changed. Painting grass back costs nothing.
export const GROUND_KINDS: GroundSpec[] = [
  { id: 'path', name: 'Path', price: 1 },
  { id: 'tall', name: 'Tall grass', price: 1 },
  { id: 'grass', name: 'Grass', price: 0 },
];
export const GROUND_PRICE = Object.fromEntries(GROUND_KINDS.map((k) => [k.id, k.price])) as Record<GroundPaint, number>;

export const TREE_CUT_PRICE = 15;

// Ground is painted 2x2 tiles at a time: paths are drawn with the same edge tiles as the
// town's roads, which need at least two tiles across to look right.
export const BRUSH = 2;

export const emptyTownEdits = (): TownEdits => ({ cut: [], ground: {}, props: [], bag: {} });

const PAINTS = new Set<string>(GROUND_KINDS.map((k) => k.id));
const TILE_KEY = /^-?\d+,-?\d+$/;

// Anything malformed is dropped piece by piece, so one bad entry never loses the rest.
export function parseTownEdits(raw: unknown): TownEdits {
  const out = emptyTownEdits();
  if (typeof raw !== 'object' || raw === null) return out;
  const r = raw as Record<string, unknown>;
  if (Array.isArray(r.cut)) out.cut = r.cut.filter((k): k is string => typeof k === 'string' && TILE_KEY.test(k));
  if (typeof r.ground === 'object' && r.ground !== null) {
    for (const [k, v] of Object.entries(r.ground)) if (TILE_KEY.test(k) && typeof v === 'string' && PAINTS.has(v)) out.ground[k] = v as GroundPaint;
  }
  if (Array.isArray(r.props)) {
    out.props = r.props.filter(
      (p): p is TownProp =>
        typeof p === 'object' && p !== null && (p as TownProp).item in TOWN_PROP_BY_ID &&
        Number.isInteger((p as TownProp).gx) && Number.isInteger((p as TownProp).gy),
    ).map(({ item, gx, gy }) => ({ item, gx, gy }));
  }
  if (typeof r.bag === 'object' && r.bag !== null) {
    for (const [k, v] of Object.entries(r.bag)) {
      if (k in TOWN_PROP_BY_ID && Number.isInteger(v) && (v as number) > 0) out.bag[k as TownPropId] = v as number;
    }
  }
  return out;
}

const storageKey = (fingerprint: string) => `town:${fingerprint}`;

export function loadTownEdits(fingerprint: string): TownEdits {
  try {
    const raw = localStorage.getItem(storageKey(fingerprint));
    return raw ? parseTownEdits(JSON.parse(raw)) : emptyTownEdits();
  } catch {
    return emptyTownEdits();
  }
}

export function saveTownEdits(fingerprint: string, edits: TownEdits): void {
  try {
    localStorage.setItem(storageKey(fingerprint), JSON.stringify(edits));
  } catch {
    // Storage full or unavailable: the edits last until the town reloads.
  }
}
