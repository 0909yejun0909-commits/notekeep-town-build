import { FOOTPRINT, hash } from './types';
import type { CatalogItemId, FurnitureId, FurniturePlacement, House, InteriorLayout } from './types';

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

export const DECOR_TYPES: FurnitureId[] = ['rug', 'desk', 'bed', 'plant', 'lamp', 'chest', 'painting'];

export function footprintCells(gx: number, gy: number, fw: number, fh: number): string[] {
  const cells: string[] = [];
  for (let i = 0; i < fw; i++) {
    for (let j = 0; j < fh; j++) cells.push(`${gx + i},${gy + j}`);
  }
  return cells;
}

// Tiles no placement may ever occupy: perimeter walls, and the clear lane
// from the door towards the back of the room. Shared by the default-layout
// generator and the editor's placement validation so they can never disagree
// about what's free. Does NOT include the shelf's own footprint — the shelf
// can move now, so its occupied cells are computed separately by
// `shelfOccupied()` and unioned in by the caller, wherever it currently is.
export function structuralOccupied(w: number, h: number, doorGx: number): Set<string> {
  const occupied = new Set<string>();
  for (let x = 0; x < w; x++) {
    occupied.add(`${x},0`);
    occupied.add(`${x},${h - 1}`);
  }
  for (let y = 0; y < h; y++) {
    occupied.add(`0,${y}`);
    occupied.add(`${w - 1},${y}`);
  }
  for (let y = SHELF_GY + 2; y < h; y++) {
    occupied.add(`${doorGx},${y}`);
    occupied.add(`${doorGx - 1},${y}`);
    occupied.add(`${doorGx + 1},${y}`);
  }
  return occupied;
}

// The shelf's own footprint (SHELF_W x 2 tiles) plus its approach row
// immediately below it — wherever it currently sits. Union this with
// `structuralOccupied()` to get "everything furniture must avoid."
export function shelfOccupied(shelfGx: number, shelfGy: number): Set<string> {
  const occupied = new Set<string>();
  for (const cell of footprintCells(shelfGx, shelfGy, SHELF_W, 2)) occupied.add(cell);
  for (let x = shelfGx; x < shelfGx + SHELF_W; x++) occupied.add(`${x},${shelfGy + 2}`);
  return occupied;
}

function pickSpot(
  roomW: number,
  fw: number,
  fh: number,
  occupied: Set<string>,
  seed: number,
  minY: number,
  maxY: number,
): [number, number] | null {
  const positions: [number, number][] = [];
  for (let y = minY; y <= maxY - fh; y++) {
    for (let x = 1; x <= roomW - 1 - fw; x++) positions.push([x, y]);
  }
  if (positions.length === 0) return null;
  const start = seed % positions.length;
  for (let i = 0; i < positions.length; i++) {
    const [x, y] = positions[(start + i) % positions.length];
    let free = true;
    for (let dx = 0; dx < fw && free; dx++) {
      for (let dy = 0; dy < fh && free; dy++) {
        if (occupied.has(`${x + dx},${y + dy}`)) free = false;
      }
    }
    if (free) return [x, y];
  }
  return null;
}

export function shelfGxFor(w: number): number {
  return Math.floor((w - SHELF_W) / 2);
}

// Today's deterministic hash-derived layout — used both as the fallback when no
// saved layout exists, and to seed the editor's first draft for an untouched house.
export function computeDefaultLayout(house: House, w: number, h: number, doorGx: number, doorGy: number): InteriorLayout {
  const shelfGx = shelfGxFor(w);
  const shelfGy = SHELF_GY;
  // Both stored as indices into FLOOR_FRAMES/WALL_TRIPLES, not raw sheet frame
  // numbers — the editor UI picks a swatch by index, and InteriorScene looks the
  // actual frame number up from the same index, so both sides must agree on that.
  const floorFrame = hash(house.id) % FLOOR_FRAMES.length;
  const wallTriple = hash(house.name) % WALL_TRIPLES.length;

  const occupied = structuralOccupied(w, h, doorGx);
  for (const cell of shelfOccupied(shelfGx, shelfGy)) occupied.add(cell);
  const pending = house.rooms.flatMap((r) => r.notes);
  const placements: FurniturePlacement[] = [];

  for (const type of DECOR_TYPES) {
    const [fw, fh] = FOOTPRINT[type];
    const seed = hash(`${house.id}:${type}`);
    const spot = pickSpot(w, fw, fh, occupied, seed, SHELF_GY + 2, h - 3);
    if (!spot) continue;
    const [dx, dy] = spot;
    const note = type === 'rug' ? undefined : pending.shift();
    for (const cell of footprintCells(dx, dy, fw, fh)) occupied.add(cell);
    if (note) occupied.add(`${dx + Math.floor(fw / 2)},${dy + fh}`);
    placements.push({ item: type, gx: dx, gy: dy, rotation: 0, noteId: note?.id });
  }

  return { floorFrame, wallTriple, shelf: { gx: shelfGx, gy: shelfGy }, placements };
}

// Can `item` be placed at (gx, gy) in `layout`, given the room's structural tiles?
// `skipIndex` excludes one existing placement from the overlap check (moving it).
export function canPlace(
  layout: InteriorLayout,
  catalogById: Record<CatalogItemId, { footprint: [number, number] }>,
  structural: Set<string>,
  w: number,
  h: number,
  item: CatalogItemId,
  gx: number,
  gy: number,
  skipIndex?: number,
): boolean {
  const entry = catalogById[item];
  if (!entry) return false;
  const [fw, fh] = entry.footprint;
  if (gx < 1 || gy < 1 || gx + fw > w - 1 || gy + fh > h - 1) return false;
  const cells = footprintCells(gx, gy, fw, fh);
  if (cells.some((c) => structural.has(c))) return false;
  for (let i = 0; i < layout.placements.length; i++) {
    if (i === skipIndex) continue;
    const p = layout.placements[i];
    const pe = catalogById[p.item];
    if (!pe) continue;
    const pCells = footprintCells(p.gx, p.gy, pe.footprint[0], pe.footprint[1]);
    if (cells.some((c) => pCells.includes(c))) return false;
  }
  return true;
}

// Can the shelf (always SHELF_W x 2 tiles) move to (gx, gy)? `structural` here
// is `structuralOccupied()` only (perimeter + door lane) — deliberately NOT
// unioned with the shelf's own current position, since we're choosing where
// it moves TO and it shouldn't collide with itself. Checked against every
// furniture placement's real footprint via `catalogById`.
export function canPlaceShelf(
  layout: InteriorLayout,
  catalogById: Record<CatalogItemId, { footprint: [number, number] }>,
  structural: Set<string>,
  w: number,
  h: number,
  gx: number,
  gy: number,
): boolean {
  if (gx < 1 || gy < 1 || gx + SHELF_W > w - 1 || gy + 2 > h - 1) return false;
  const cells = footprintCells(gx, gy, SHELF_W, 2);
  if (cells.some((c) => structural.has(c))) return false;
  for (const p of layout.placements) {
    const pe = catalogById[p.item];
    if (!pe) continue;
    const pCells = footprintCells(p.gx, p.gy, pe.footprint[0], pe.footprint[1]);
    if (cells.some((c) => pCells.includes(c))) return false;
  }
  return true;
}
