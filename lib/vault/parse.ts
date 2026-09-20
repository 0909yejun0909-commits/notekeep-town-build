import type { House, NoteRef, Region, Room, WorldModel } from '@/lib/types';
import { BIOMES, FOOTPRINT, FURNITURE, hash } from '@/lib/types';

// Building sprite size in tiles per variant, and the lower door tile, from the manifest.
export const HOUSE_FOOTPRINT: Record<number, [number, number]> = {
  0: [6, 8], 1: [9, 8], 2: [9, 8], 3: [7, 6], 4: [12, 8],
};
export const HOUSE_DOOR: Record<number, [number, number]> = {
  0: [2, 6], 1: [2, 6], 2: [5, 6], 3: [2, 4], 4: [5, 6],
};

const ROOT_ID = '.';
const MAIN = 'Main';
const ROOM_CLEAR_ROWS = 3;
const REGION_MARGIN = 2;
const HOUSE_GAP = 3;

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function baseName(path: string) {
  return path.slice(path.lastIndexOf('/') + 1);
}

function titleOf(path: string) {
  return baseName(path).replace(/\.md$/i, '');
}

export function plainPreview(md: string): string {
  let s = md.replace(/^﻿/, '');
  s = s.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  s = s.replace(/```[\s\S]*?(```|$)/g, ' ');
  s = s.replace(/!\[\[[^\]]*\]\]/g, ' ');
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');
  s = s.replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2');
  s = s.replace(/\[\[([^\]]*)\]\]/g, '$1');
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  s = s.replace(/<[^>]+>/g, ' ');
  s = s.replace(/^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+(\[[ xX]\]\s*)?|\d+[.)]\s+|[-*_]{3,}\s*$)/gm, '');
  s = s.replace(/[*_~`]+/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s.slice(0, 200).replace(/�+$/, '');
}

// Layout contract shared with Track C:
//   roomSize(room) = [cols, rows] of walkable floor tiles.
//   note.gx/gy = 0-indexed top-left of the piece's FOOTPRINT on that floor.
//   The bottom ROOM_CLEAR_ROWS rows never hold furniture (door + spawn space).
function layoutRoom(notes: NoteRef[]): { cols: number; rows: number; pos: [number, number][] } {
  let area = 0;
  for (const n of notes) {
    const [w, h] = FOOTPRINT[n.furniture];
    area += (w + 1) * (h + 1);
  }
  const cols = clamp(Math.ceil(Math.sqrt(area * 1.6)), 8, 22);
  const pos: [number, number][] = [];
  let x = 0, y = 0, rowH = 0;
  for (const n of notes) {
    const [w, h] = FOOTPRINT[n.furniture];
    if (x + w > cols && x > 0) {
      x = 0;
      y += rowH + 1;
      rowH = 0;
    }
    pos.push([x, y]);
    x += w + 1;
    rowH = Math.max(rowH, h);
  }
  const rows = Math.max(6, y + rowH + ROOM_CLEAR_ROWS);
  return { cols, rows, pos };
}

export function roomSize(room: Room): [number, number] {
  const l = layoutRoom(room.notes);
  let cols = l.cols, rows = l.rows;
  for (const n of room.notes) {
    const [w, h] = FOOTPRINT[n.furniture];
    cols = Math.max(cols, n.gx + w);
    rows = Math.max(rows, n.gy + h + ROOM_CLEAR_ROWS);
  }
  return [cols, rows];
}

// Layout contract shared with Track B:
//   regionSize(region) = [cols, rows] of the region in tiles.
//   house.gx/gy = 0-indexed top-left of the house sprite (HOUSE_FOOTPRINT[variant]).
//   Houses are separated by HOUSE_GAP walkable tiles and REGION_MARGIN tiles from the edge.
function layoutRegion(houses: House[]): { cols: number; rows: number; pos: [number, number][] } {
  let area = 0;
  for (const h of houses) {
    const [w, hh] = HOUSE_FOOTPRINT[h.variant];
    area += (w + HOUSE_GAP) * (hh + HOUSE_GAP);
  }
  const cols = clamp(Math.ceil(Math.sqrt(area * 1.5)) + REGION_MARGIN * 2, 24, 64);
  const pos: [number, number][] = [];
  let x = REGION_MARGIN, y = REGION_MARGIN, rowH = 0;
  for (const h of houses) {
    const [w, hh] = HOUSE_FOOTPRINT[h.variant];
    if (x + w > cols - REGION_MARGIN && x > REGION_MARGIN) {
      x = REGION_MARGIN;
      y += rowH + HOUSE_GAP;
      rowH = 0;
    }
    pos.push([x, y]);
    x += w + HOUSE_GAP;
    rowH = Math.max(rowH, hh);
  }
  const rows = Math.max(16, y + rowH + REGION_MARGIN + 1);
  return { cols, rows, pos };
}

export function regionSize(region: Region): [number, number] {
  const l = layoutRegion(region.houses);
  let cols = l.cols, rows = l.rows;
  for (const h of region.houses) {
    const [w, hh] = HOUSE_FOOTPRINT[h.variant];
    cols = Math.max(cols, h.gx + w + REGION_MARGIN);
    rows = Math.max(rows, h.gy + hh + REGION_MARGIN + 1);
  }
  return [cols, rows];
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

export function isNotePath(path: string): boolean {
  if (!/\.md$/i.test(path)) return false;
  return !path.split('/').some((seg) => seg.startsWith('.'));
}

// Folder → world mapping:
//   depth 1 folder -> Region, depth 2 -> House, depth 3+ -> Room (deeper flattens),
//   loose .md at depth 2 -> room "Main"; loose .md above that -> house/region "Main".
export async function parseVault(
  name: string,
  paths: string[],
  readHead: (path: string) => Promise<string>,
): Promise<WorldModel> {
  const notePaths = paths.filter(isNotePath).sort((a, b) => a.localeCompare(b));
  const heads = await mapLimit(notePaths, 16, async (p) => {
    try { return await readHead(p); } catch { return ''; }
  });

  type RoomAcc = { id: string; name: string; notes: NoteRef[] };
  type HouseAcc = { id: string; name: string; rooms: Map<string, RoomAcc> };
  type RegionAcc = { id: string; name: string; houses: Map<string, HouseAcc> };
  const regions = new Map<string, RegionAcc>();

  notePaths.forEach((path, i) => {
    const segs = path.split('/');
    const regionId = segs.length >= 2 ? segs[0] : ROOT_ID;
    const regionName = segs.length >= 2 ? segs[0] : name;
    const houseId = segs.length >= 3 ? segs.slice(0, 2).join('/') : regionId;
    const houseName = segs.length >= 3 ? segs[1] : MAIN;
    const roomId = segs.length >= 4 ? segs.slice(0, 3).join('/') : houseId;
    const roomName = segs.length >= 4 ? segs[2] : MAIN;

    let region = regions.get(regionId);
    if (!region) regions.set(regionId, (region = { id: regionId, name: regionName, houses: new Map() }));
    let house = region.houses.get(houseId);
    if (!house) region.houses.set(houseId, (house = { id: houseId, name: houseName, rooms: new Map() }));
    let room = house.rooms.get(roomId);
    if (!room) house.rooms.set(roomId, (room = { id: roomId, name: roomName, notes: [] }));

    room.notes.push({
      id: path,
      title: titleOf(path),
      furniture: FURNITURE[hash(path) % FURNITURE.length],
      gx: 0, gy: 0,
      preview: plainPreview(heads[i]),
    });
  });

  const world: WorldModel = { name, regions: [] };
  for (const r of regions.values()) {
    const houses: House[] = [];
    for (const h of r.houses.values()) {
      const rooms: Room[] = [];
      for (const rm of h.rooms.values()) {
        const { pos } = layoutRoom(rm.notes);
        rm.notes.forEach((n, i) => { n.gx = pos[i][0]; n.gy = pos[i][1]; });
        rooms.push({ id: rm.id, name: rm.name, notes: rm.notes });
      }
      houses.push({ id: h.id, name: h.name, gx: 0, gy: 0, variant: hash(h.name) % 5, rooms });
    }
    const { pos } = layoutRegion(houses);
    houses.forEach((h, i) => { h.gx = pos[i][0]; h.gy = pos[i][1]; });
    world.regions.push({ id: r.id, name: r.name, biome: BIOMES[hash(r.name) % BIOMES.length], houses });
  }
  return world;
}
