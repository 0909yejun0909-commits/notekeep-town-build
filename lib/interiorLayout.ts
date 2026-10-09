import { FOOTPRINT, hash } from './types';
import type { CatalogItemId, FurnitureId, FurniturePlacement, House, InteriorLayout, Room, RoomSize } from './types';

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

export const DECOR_TYPES: FurnitureId[] = ['rug', 'desk', 'bed', 'plant', 'lamp', 'chest', 'painting'];

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

// The deterministic hash-derived layout for one room — the fallback when nothing is saved,
// and the editor's first draft for an untouched room. The entrance seeds from the house, so
// an untouched house looks exactly as it did with one room, and starts large; other rooms
// seed from themselves and start medium.
export function computeDefaultLayout(house: House, room: Room): InteriorLayout {
  const entrance = room.id === house.id;
  const roomSize: RoomSize = entrance ? 'large' : 'medium';
  const seedId = entrance ? house.id : room.id;
  const seedName = entrance ? house.name : room.name;
  const [w, h] = ROOM_SIZES[roomSize];
  const shelfGx = shelfGxFor(w);
  const shelfGy = SHELF_GY;
  // Both stored as indices into FLOOR_FRAMES/WALL_TRIPLES, not raw sheet frame
  // numbers — the editor UI picks a swatch by index, and InteriorScene looks the
  // actual frame number up from the same index, so both sides must agree on that.
  const floorFrame = hash(seedId) % FLOOR_FRAMES.length;
  const wallTriple = hash(seedName) % WALL_TRIPLES.length;

  const occupied = structuralOccupied(w, h);
  for (const cell of shelfOccupied(shelfGx, shelfGy)) occupied.add(cell);
  // A new room's decor stays inside the small footprint, so it can be shrunk straight away.
  const [fitW, fitH] = entrance ? [w, h] : ROOM_SIZES.small;
  const pending = [...room.notes];
  const placements: FurniturePlacement[] = [];

  for (const type of DECOR_TYPES) {
    const [fw, fh] = FOOTPRINT[type];
    const seed = hash(`${seedId}:${type}`);
    const spot = pickSpot(fitW, fw, fh, occupied, seed, SHELF_GY + 2, fitH - 3);
    if (!spot) continue;
    const [dx, dy] = spot;
    const note = type === 'rug' ? undefined : pending.shift();
    for (const cell of footprintCells(dx, dy, fw, fh)) occupied.add(cell);
    if (note) occupied.add(`${dx + Math.floor(fw / 2)},${dy + fh}`);
    placements.push({ item: type, gx: dx, gy: dy, rotation: 0, noteId: note?.id });
  }

  return { floorFrame, wallTriple, roomSize, shelf: { gx: shelfGx, gy: shelfGy }, placements };
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
// is `structuralOccupied()` only (the perimeter) — deliberately NOT unioned
// with the shelf's own current position, since we're choosing where it
// moves TO and it shouldn't collide with itself. Checked against every
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

// Would every existing placement and the shelf still fit inside the room at `size`, with
// room for `doorsNeeded` doorways? Blocks a shrink that would strand furniture outside the
// new walls or leave a room without its door. Nothing moves relative to the room's
// top-left corner, so pieces can't newly overlap each other.
export function canResize(
  layout: InteriorLayout,
  catalogById: Record<CatalogItemId, { footprint: [number, number] }>,
  size: RoomSize,
  doorsNeeded = 0,
): boolean {
  const [newW, newH] = ROOM_SIZES[size];
  const structural = structuralOccupied(newW, newH);

  const shelfCells = footprintCells(layout.shelf.gx, layout.shelf.gy, SHELF_W, 2);
  if (
    layout.shelf.gx < 1 || layout.shelf.gy < 1 ||
    layout.shelf.gx + SHELF_W > newW - 1 || layout.shelf.gy + 2 > newH - 1 ||
    shelfCells.some((c) => structural.has(c))
  ) {
    return false;
  }

  for (const p of layout.placements) {
    const entry = catalogById[p.item];
    if (!entry) continue;
    const [fw, fh] = entry.footprint;
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
  catalogById: Record<CatalogItemId, { footprint: [number, number] }>,
  size: RoomSize,
  doorsNeeded = 0,
): { layout: InteriorLayout; putAway: number } | null {
  const [w, h] = ROOM_SIZES[size];
  const blocked = structuralOccupied(w, h);
  const fits = (gx: number, gy: number, fw: number, fh: number) =>
    gx >= 1 && gy >= 1 && gx + fw <= w - 1 && gy + fh <= h - 1 &&
    footprintCells(gx, gy, fw, fh).every((c) => !blocked.has(c));

  let shelf = layout.shelf;
  if (!fits(shelf.gx, shelf.gy, SHELF_W, 2)) shelf = { gx: shelfGxFor(w), gy: SHELF_GY };
  for (const c of footprintCells(shelf.gx, shelf.gy, SHELF_W, 2)) blocked.add(c);

  const placed: (FurniturePlacement | null)[] = layout.placements.map(() => null);
  const misfits: number[] = [];
  layout.placements.forEach((p, i) => {
    const entry = catalogById[p.item];
    if (!entry) return;
    const [fw, fh] = entry.footprint;
    if (!fits(p.gx, p.gy, fw, fh)) return misfits.push(i);
    placed[i] = p;
    for (const c of footprintCells(p.gx, p.gy, fw, fh)) blocked.add(c);
  });

  let putAway = 0;
  for (const i of misfits) {
    const p = layout.placements[i];
    const [fw, fh] = catalogById[p.item].footprint;
    const tx = Math.min(p.gx, w - 1 - fw), ty = Math.min(p.gy, h - 1 - fh);
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (let y = 1; y + fh <= h - 1; y++) {
      for (let x = 1; x + fw <= w - 1; x++) {
        const d = Math.abs(x - tx) + Math.abs(y - ty);
        if (d < bestD && fits(x, y, fw, fh)) [best, bestD] = [[x, y], d];
      }
    }
    if (!best) {
      putAway++;
      continue;
    }
    placed[i] = { ...p, gx: best[0], gy: best[1] };
    for (const c of footprintCells(best[0], best[1], fw, fh)) blocked.add(c);
  }

  const next: InteriorLayout = {
    ...layout,
    roomSize: size,
    shelf,
    placements: placed.filter((p): p is FurniturePlacement => p !== null),
  };
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
  catalogById: Record<CatalogItemId, { footprint: [number, number] }>,
  max: number,
): DoorSlot[] {
  const [w, h] = ROOM_SIZES[layout.roomSize];
  const occupied = shelfOccupied(layout.shelf.gx, layout.shelf.gy);
  for (const p of layout.placements) {
    const entry = catalogById[p.item];
    if (!entry) continue;
    for (const cell of footprintCells(p.gx, p.gy, entry.footprint[0], entry.footprint[1])) occupied.add(cell);
  }
  const out: DoorSlot[] = [];
  for (const slot of doorCandidates(w, h)) {
    if (out.length >= max) break;
    if (slot.inside.some(([x, y]) => occupied.has(`${x},${y}`))) continue;
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
