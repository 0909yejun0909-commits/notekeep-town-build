import { hash } from './types';
import type { CatalogEntry, CatalogItemId, FurnitureId, FurniturePlacement, House, InteriorLayout, Room, RoomSize } from './types';
import { SURFACES } from './catalog';

// What the layout rules need to know about each catalog piece.
type Lookup = Record<CatalogItemId, Pick<CatalogEntry, 'footprint' | 'layer' | 'category'>>;

export const SHELF_SEGMENTS = 3;
export const SHELF_W = SHELF_SEGMENTS * 2;
export const SHELF_GY = 1;

export const FLOOR_FRAMES = [0, 2, 4, 6, 16, 32, 34, 48, 50, 52, 54];
export const WALL_TRIPLES: [number, number, number][] = [
  [42, 56, 70],
  [45, 59, 73],
  [46, 60, 74],
  [47, 61, 75],
];

export const ROOM_SIZES: Record<RoomSize, [number, number]> = {
  small: [13, 10],
  medium: [16, 12],
  large: [20, 15],
};

export function doorPositionFor(w: number, h: number): [number, number] {
  return [Math.floor(w / 2), h - 1];
}

export const DECOR_TYPES: Exclude<FurnitureId, 'shelf'>[] = ['rug', 'desk', 'bed', 'plant', 'lamp', 'chest', 'painting'];

export function footprintCells(gx: number, gy: number, fw: number, fh: number): string[] {
  const cells: string[] = [];
  for (let i = 0; i < fw; i++) {
    for (let j = 0; j < fh; j++) cells.push(`${gx + i},${gy + j}`);
  }
  return cells;
}

// Tiles no placement may ever occupy: the perimeter walls. Shared by the
// default-layout generator and the editor's placement validation so they
// can never disagree about what's free. Does NOT include the shelf's own
// footprint — the shelf can move now, so its occupied cells are computed
// separately by `shelfOccupied()` and unioned in by the caller, wherever it
// currently is. (Previously also reserved a clear lane from the door to the
// back wall so furniture could never block the path in from the door — cut
// because it ate a large share of a small room's usable space and the door
// tile itself is always walkable regardless of what's placed around it.)
export function structuralOccupied(w: number, h: number): Set<string> {
  const occupied = new Set<string>();
  for (let x = 0; x < w; x++) {
    occupied.add(`${x},0`);
    occupied.add(`${x},${h - 1}`);
  }
  for (let y = 0; y < h; y++) {
    occupied.add(`0,${y}`);
    occupied.add(`${w - 1},${y}`);
  }
  return occupied;
}

type Shelf = InteriorLayout['shelf'];

// The bookshelf is SHELF_W x 2 tiles; a fridge, cabinet or wardrobe standing in for it
// takes its catalog footprint.
export function shelfSize(
  shelf: Shelf,
  catalogById: Lookup,
): [number, number] {
  return (shelf.item && catalogById[shelf.item]?.footprint) || [SHELF_W, 2];
}

// The shelf's own footprint plus its approach row immediately below it — wherever it
// currently sits. Union this with `structuralOccupied()` to get "everything furniture
// must avoid."
export function shelfOccupied(
  shelf: Shelf,
  catalogById: Lookup,
): Set<string> {
  const [sw, sh] = shelfSize(shelf, catalogById);
  const occupied = new Set<string>();
  for (const cell of footprintCells(shelf.gx, shelf.gy, sw, sh)) occupied.add(cell);
  for (let x = shelf.gx; x < shelf.gx + sw; x++) occupied.add(`${x},${shelf.gy + sh}`);
  return occupied;
}

type Arrangement = Record<(typeof DECOR_TYPES)[number], [number, number]>;

// Hand-placed furnishings for an untouched room, so pieces sit against the walls in groups —
// bed and desk in the back corners, a lamp beside the bed, the painting hung on the back
// wall, the rug in the open middle — instead of scattered tiles. Pieces at gy 1 sit on the
// back wall's second row the way the bookshelf does. Rooms start small (13x10, shelf at
// x 3-8), whose doorways are all on the side and bottom walls, so every arrangement leaves
// at least six of those free and keeps each note-holder's front tile free and reachable.
const ARRANGEMENTS: Arrangement[] = [
  { desk: [10, 1], bed: [1, 1], plant: [11, 5], lamp: [1, 3], chest: [1, 7], painting: [9, 1], rug: [5, 5] },
  { desk: [1, 1], bed: [10, 1], plant: [11, 5], lamp: [1, 3], chest: [10, 3], painting: [9, 1], rug: [5, 5] },
];

export function shelfGxFor(w: number): number {
  return Math.floor((w - SHELF_W) / 2);
}

// The deterministic hash-derived layout for one room — the fallback when nothing is saved,
// and the editor's first draft for an untouched room. Every room starts small: the bigger
// sizes are bought with coins in the editor. The entrance seeds from the house, so an
// untouched house looks exactly as it did with one room; other rooms seed from themselves.
export function computeDefaultLayout(house: House, room: Room): InteriorLayout {
  const entrance = room.id === house.id;
  const roomSize: RoomSize = 'small';
  const seedId = entrance ? house.id : room.id;
  const seedName = entrance ? house.name : room.name;
  const [w] = ROOM_SIZES[roomSize];
  const shelfGx = shelfGxFor(w);
  const shelfGy = SHELF_GY;
  // Both stored as indices into FLOOR_FRAMES/WALL_TRIPLES, not raw sheet frame
  // numbers — the editor UI picks a swatch by index, and InteriorScene looks the
  // actual frame number up from the same index, so both sides must agree on that.
  const floorFrame = hash(seedId) % FLOOR_FRAMES.length;
  const wallTriple = hash(seedName) % WALL_TRIPLES.length;

  const arrangement = ARRANGEMENTS[hash(`${seedId}:arrangement`) % ARRANGEMENTS.length];
  const pending = [...room.notes];
  const placements: FurniturePlacement[] = DECOR_TYPES.map((type) => {
    const [gx, gy] = arrangement[type];
    const note = type === 'rug' ? undefined : pending.shift();
    return { item: type, gx, gy, rotation: 0, noteId: note?.id };
  });

  return { floorFrame, wallTriple, roomSize, shelf: { gx: shelfGx, gy: shelfGy }, placements };
}

function cellsOf(p: { gx: number; gy: number }, entry: { footprint: [number, number] }): string[] {
  return footprintCells(p.gx, p.gy, entry.footprint[0], entry.footprint[1]);
}

// A surface's back row is where tabletop pieces stand.
function surfaceTop(p: FurniturePlacement, entry: Lookup[string]): string[] {
  if (SURFACES[entry.category] === undefined) return [];
  return footprintCells(p.gx, p.gy, entry.footprint[0], 1);
}

// The surface whose back row holds (gx, gy), if any — what a tabletop piece there stands on.
export function surfaceUnder(
  layout: InteriorLayout,
  catalogById: Lookup,
  gx: number,
  gy: number,
  skip: ReadonlySet<number> = new Set(),
): number | null {
  for (let i = 0; i < layout.placements.length; i++) {
    if (skip.has(i)) continue;
    const p = layout.placements[i];
    const entry = catalogById[p.item];
    if (entry && surfaceTop(p, entry).includes(`${gx},${gy}`)) return i;
  }
  return null;
}

// The tabletop pieces standing on placement `index`. They move and go away with it.
export function ridersOf(layout: InteriorLayout, catalogById: Lookup, index: number): number[] {
  const p = layout.placements[index];
  const entry = p && catalogById[p.item];
  if (!entry) return [];
  const top = new Set(surfaceTop(p, entry));
  if (top.size === 0) return [];
  const out: number[] = [];
  layout.placements.forEach((r, i) => {
    const re = catalogById[r.item];
    if (i !== index && re?.layer === 'tabletop' && cellsOf(r, re).every((c) => top.has(c))) out.push(i);
  });
  return out;
}

// Can `item` be placed at (gx, gy) in `layout`? `structural` is the perimeter and the doorways
// (the shelf is checked here, wherever it stands). `skip` excludes placements being moved.
// Like Stardew: rugs only avoid other rugs, so furniture stands on them; wall pieces hang on
// the back wall's two rows; tabletop pieces stand on a surface's back row, or on the floor.
export function canPlace(
  layout: InteriorLayout,
  catalogById: Lookup,
  structural: Set<string>,
  w: number,
  h: number,
  item: CatalogItemId,
  gx: number,
  gy: number,
  skip?: number | ReadonlySet<number>,
): boolean {
  const entry = catalogById[item];
  if (!entry) return false;
  const [fw, fh] = entry.footprint;
  const skipped = typeof skip === 'number' ? new Set([skip]) : (skip ?? new Set<number>());
  const cells = footprintCells(gx, gy, fw, fh);
  const others: Array<{ layer: string; cells: string[] }> = [];
  layout.placements.forEach((p, i) => {
    const pe = catalogById[p.item];
    if (pe && !skipped.has(i)) others.push({ layer: pe.layer, cells: cellsOf(p, pe) });
  });
  const hits = (layers: (layer: string) => boolean) =>
    others.some((o) => layers(o.layer) && o.cells.some((c) => cells.includes(c)));

  if (entry.layer === 'wall') {
    if (gx < 1 || gx + fw > w - 1 || gy < 0 || gy + fh > 2) return false;
    // Row 0 is the wall itself, so only a doorway below it rules a cell out.
    if (cells.some((c) => {
      const [x, y] = c.split(',').map(Number);
      return structural.has(y === 0 ? `${x},1` : c);
    })) return false;
    const [sw, sh] = shelfSize(layout.shelf, catalogById);
    const shelf = footprintCells(layout.shelf.gx, layout.shelf.gy, sw, sh);
    if (cells.some((c) => shelf.includes(c))) return false;
    return !hits((l) => l !== 'rug');
  }

  if (gx < 1 || gy < 1 || gx + fw > w - 1 || gy + fh > h - 1) return false;
  if (cells.some((c) => structural.has(c))) return false;
  if (entry.layer === 'rug') return !hits((l) => l === 'rug');

  if (entry.layer === 'tabletop' && cells.every((c) => {
    const [x, y] = c.split(',').map(Number);
    return surfaceUnder(layout, catalogById, x, y, skipped) !== null;
  })) {
    return !hits((l) => l === 'tabletop');
  }

  const shelf = shelfOccupied(layout.shelf, catalogById);
  if (cells.some((c) => shelf.has(c))) return false;
  return !hits((l) => l !== 'rug');
}

// Where a click at (gx, gy) puts `item`: that cell as its top-left corner, or — for a wall
// piece too tall to start there — hung so its bottom row is the clicked one. Null if neither fits.
export function placementSpot(
  layout: InteriorLayout,
  catalogById: Lookup,
  structural: Set<string>,
  w: number,
  h: number,
  item: CatalogItemId,
  gx: number,
  gy: number,
  skip?: number | ReadonlySet<number>,
): [number, number] | null {
  if (canPlace(layout, catalogById, structural, w, h, item, gx, gy, skip)) return [gx, gy];
  const entry = catalogById[item];
  if (entry?.layer !== 'wall') return null;
  const up = gy - entry.footprint[1] + 1;
  return up !== gy && canPlace(layout, catalogById, structural, w, h, item, gx, up, skip) ? [gx, up] : null;
}

// Can the shelf, looking like `item`, move to (gx, gy)? `structural` here
// is `structuralOccupied()` only (the perimeter) — deliberately NOT unioned
// with the shelf's own current position, since we're choosing where it
// moves TO and it shouldn't collide with itself. Checked against every
// furniture placement's real footprint via `catalogById`.
export function canPlaceShelf(
  layout: InteriorLayout,
  catalogById: Lookup,
  structural: Set<string>,
  w: number,
  h: number,
  gx: number,
  gy: number,
  item: CatalogItemId | undefined,
): boolean {
  const [sw, sh] = shelfSize({ gx, gy, item }, catalogById);
  if (gx < 1 || gy < 1 || gx + sw > w - 1 || gy + sh > h - 1) return false;
  const cells = footprintCells(gx, gy, sw, sh);
  if (cells.some((c) => structural.has(c))) return false;
  for (const p of layout.placements) {
    const pe = catalogById[p.item];
    if (!pe || pe.layer === 'rug') continue;
    const pCells = footprintCells(p.gx, p.gy, pe.footprint[0], pe.footprint[1]);
    if (cells.some((c) => pCells.includes(c))) return false;
  }
  return true;
}

// The shelf restyled as `item` (undefined = the bookshelf), centred on where it stood so a
// fridge takes the middle of the old bookshelf and a bookshelf grows out from the fridge —
// or, if that doesn't fit, kept at the same left edge. Null when neither fits.
export function restyleShelf(
  layout: InteriorLayout,
  catalogById: Lookup,
  structural: Set<string>,
  w: number,
  h: number,
  item: CatalogItemId | undefined,
): Shelf | null {
  const [oldW] = shelfSize(layout.shelf, catalogById);
  const [newW] = shelfSize({ ...layout.shelf, item }, catalogById);
  const { gx, gy } = layout.shelf;
  for (const x of [gx + Math.trunc((oldW - newW) / 2), gx]) {
    if (canPlaceShelf(layout, catalogById, structural, w, h, x, gy, item)) return item ? { gx: x, gy, item } : { gx: x, gy };
  }
  return null;
}

// Would every existing placement and the shelf still fit inside the room at `size`, with
// room for `doorsNeeded` doorways? Blocks a shrink that would strand furniture outside the
// new walls or leave a room without its door. Nothing moves relative to the room's
// top-left corner, so pieces can't newly overlap each other.
export function canResize(
  layout: InteriorLayout,
  catalogById: Lookup,
  size: RoomSize,
  doorsNeeded = 0,
): boolean {
  const [newW, newH] = ROOM_SIZES[size];
  const structural = structuralOccupied(newW, newH);

  const [sw, sh] = shelfSize(layout.shelf, catalogById);
  const shelfCells = footprintCells(layout.shelf.gx, layout.shelf.gy, sw, sh);
  if (
    layout.shelf.gx < 1 || layout.shelf.gy < 1 ||
    layout.shelf.gx + sw > newW - 1 || layout.shelf.gy + sh > newH - 1 ||
    shelfCells.some((c) => structural.has(c))
  ) {
    return false;
  }

  for (const p of layout.placements) {
    const entry = catalogById[p.item];
    if (!entry) continue;
    const [fw, fh] = entry.footprint;
    if (entry.layer === 'wall') {
      if (p.gx + fw > newW - 1) return false;
      continue;
    }
    if (p.gx < 1 || p.gy < 1 || p.gx + fw > newW - 1 || p.gy + fh > newH - 1) return false;
    const cells = footprintCells(p.gx, p.gy, fw, fh);
    if (cells.some((c) => structural.has(c))) return false;
  }
  return doorSlots({ ...layout, roomSize: size }, catalogById, doorsNeeded).length >= doorsNeeded;
}

// The layout at `size`, for the editor's size buttons. The shelf goes back to its usual spot
// if it no longer fits, and each piece left outside the new walls moves to the nearest free
// spot, or is put away (back to the inventory) when there is none. Null when the room can't
// keep `doorsNeeded` doorways at that size.
export function resizeLayout(
  layout: InteriorLayout,
  catalogById: Lookup,
  size: RoomSize,
  doorsNeeded = 0,
): { layout: InteriorLayout; putAway: number } | null {
  const [w, h] = ROOM_SIZES[size];
  const structural = structuralOccupied(w, h);
  const inside = (gx: number, gy: number, fw: number, fh: number) =>
    gx >= 1 && gy >= 1 && gx + fw <= w - 1 && gy + fh <= h - 1 &&
    footprintCells(gx, gy, fw, fh).every((c) => !structural.has(c));

  let shelf = layout.shelf;
  if (!inside(shelf.gx, shelf.gy, SHELF_W, 2)) shelf = { gx: shelfGxFor(w), gy: SHELF_GY };
  const shelfCells = new Set(footprintCells(shelf.gx, shelf.gy, SHELF_W, 2));

  // Nothing moves relative to the room's top-left corner, so a piece still inside the new walls
  // can't newly overlap another one. Wall pieces hang where they are or are put away.
  const placed: (FurniturePlacement | null)[] = layout.placements.map(() => null);
  const misfits: number[] = [];
  let putAway = 0;
  const strands = new Set<number>();
  layout.placements.forEach((p, i) => {
    const entry = catalogById[p.item];
    if (!entry) return;
    const [fw, fh] = entry.footprint;
    if (entry.layer === 'wall') {
      if (p.gx + fw <= w - 1) placed[i] = p;
      else putAway++;
      return;
    }
    const clear = entry.layer === 'rug' || footprintCells(p.gx, p.gy, fw, fh).every((c) => !shelfCells.has(c));
    if (inside(p.gx, p.gy, fw, fh) && clear) placed[i] = p;
    else {
      misfits.push(i);
      for (const r of ridersOf(layout, catalogById, i)) strands.add(r);
    }
  });
  // A tabletop piece whose table is leaving goes with it.
  for (const r of strands) {
    if (placed[r]) {
      placed[r] = null;
      misfits.push(r);
    }
  }

  const resized = (): InteriorLayout => ({ ...layout, roomSize: size, shelf, placements: placed.filter((p): p is FurniturePlacement => p !== null) });
  for (const i of misfits.sort((a, b) => a - b)) {
    const p = layout.placements[i];
    const [fw, fh] = catalogById[p.item].footprint;
    const tx = Math.min(p.gx, w - 1 - fw), ty = Math.min(p.gy, h - 1 - fh);
    const now = resized();
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (let y = 1; y + fh <= h - 1; y++) {
      for (let x = 1; x + fw <= w - 1; x++) {
        const d = Math.abs(x - tx) + Math.abs(y - ty);
        if (d < bestD && canPlace(now, catalogById, structural, w, h, p.item, x, y)) [best, bestD] = [[x, y], d];
      }
    }
    if (!best) {
      putAway++;
      continue;
    }
    placed[i] = { ...p, gx: best[0], gy: best[1] };
  }

  const next = resized();
  if (doorSlots(next, catalogById, doorsNeeded).length < doorsNeeded) return null;
  return { layout: next, putAway };
}

export type DoorSide = 'top' | 'left' | 'right' | 'bottom';

// A doorway on the room's perimeter, plus the tiles in front of it that must stay clear so
// it can be walked through (two on the top wall: row 1 is the back wall's second row when
// the shelf leans on it).
export type DoorSlot = { gx: number; gy: number; side: DoorSide; inside: [number, number][] };

// Top-wall tiles kept at the right-hand end for the name and CUSTOMIZE labels, which share the
// top wall's row so they never cover the bookshelf (InteriorScene cuts the name to fit).
export const HEADER_TILES = 12;
// Top-wall doors start here: the coin purse overlay covers the room's top-left corner.
export const TOP_FIRST_GX = 4;

function doorCandidates(w: number, h: number): DoorSlot[] {
  const [exitGx] = doorPositionFor(w, h);
  const out: DoorSlot[] = [];
  for (let gx = TOP_FIRST_GX; gx < w - 1 - HEADER_TILES; gx += 2) {
    out.push({ gx, gy: 0, side: 'top', inside: [[gx, 1], [gx, 2]] });
  }
  for (let gy = 2; gy <= h - 3; gy += 2) out.push({ gx: 0, gy, side: 'left', inside: [[1, gy]] });
  for (let gy = 2; gy <= h - 3; gy += 2) out.push({ gx: w - 1, gy, side: 'right', inside: [[w - 2, gy]] });
  for (let gx = 2; gx <= w - 3; gx += 2) {
    if (Math.abs(gx - exitGx) <= 1) continue;
    out.push({ gx, gy: h - 1, side: 'bottom', inside: [[gx, h - 2]] });
  }
  return out;
}

// Up to `max` doorways, top wall first, then left, right, bottom — skipping any whose inside
// tiles the shelf (or its approach row) or a piece of furniture covers. Nothing is saved:
// the scene and the editor both derive doors from the layout, so they always agree.
export function doorSlots(
  layout: InteriorLayout,
  catalogById: Lookup,
  max: number,
): DoorSlot[] {
  const [w, h] = ROOM_SIZES[layout.roomSize];
  const occupied = shelfOccupied(layout.shelf, catalogById);
  for (const p of layout.placements) {
    const entry = catalogById[p.item];
    if (!entry) continue;
    for (const cell of footprintCells(p.gx, p.gy, entry.footprint[0], entry.footprint[1])) occupied.add(cell);
  }
  const out: DoorSlot[] = [];
  for (const slot of doorCandidates(w, h)) {
    if (out.length >= max) break;
    // The doorway's own tile counts too: a wall piece can hang where a top-wall door would go.
    if ([...slot.inside, [slot.gx, slot.gy]].some(([x, y]) => occupied.has(`${x},${y}`))) continue;
    out.push(slot);
  }
  return out;
}

export function doorCells(slots: DoorSlot[]): Set<string> {
  const cells = new Set<string>();
  for (const slot of slots) {
    cells.add(`${slot.gx},${slot.gy}`);
    for (const [x, y] of slot.inside) cells.add(`${x},${y}`);
  }
  return cells;
}
