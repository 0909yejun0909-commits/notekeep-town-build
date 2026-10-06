import type { Region, TownBiome } from '@/lib/types';

export const TILE = 16;

export const key = (x: number, y: number) => `${x},${y}`;

export type RegionArea = { region: Region; originGx: number; originGy: number; width: number; height: number };

export type HouseRect = { houseId: string; gx: number; gy: number; w: number; h: number; entryGx: number; entryGy: number };

// Everything the overworld generators share while laying out the town. Each generator
// reads what earlier ones claimed and marks what it claims, so nothing overlaps.
export type WorldGrid = {
  w: number;
  h: number;
  seed: number;
  // Width of the solid forest ring around the town, in tiles.
  border: number;
  blocked: Set<string>;
  road: Set<string>;
  water: Set<string>;
  plaza: Set<string>;
  // Door entries and the tile below them: never covered by anything.
  keepClear: Set<string>;
  // Tiles already holding a tree, prop or flower, walkable or not.
  used: Set<string>;
  areas: RegionArea[];
  houses: HouseRect[];
  // World-pixel points that glow at night (lamp heads, doors).
  lights: { x: number; y: number; scale: number }[];
  // The player's town look. Biomes only reskin: they never change what is placed where.
  biome: TownBiome;
  // A texture or animation key's version for `biome` (game/biomeArt.ts); identity in forest.
  skin: (key: string) => string;
  skinAnim: (key: string) => string;
};

export function inBounds(g: WorldGrid, x: number, y: number) {
  return x >= 0 && y >= 0 && x < g.w && y < g.h;
}

export function isFree(g: WorldGrid, x: number, y: number) {
  if (!inBounds(g, x, y)) return false;
  const k = key(x, y);
  return !g.blocked.has(k) && !g.road.has(k) && !g.water.has(k) && !g.plaza.has(k) && !g.keepClear.has(k) && !g.used.has(k);
}

// Tiles from the forest ring's inner edge (0 = first tile inside the town; negative in the ring).
export function ringDistance(g: WorldGrid, x: number, y: number) {
  return Math.min(x - g.border, y - g.border, g.w - g.border - 1 - x, g.h - g.border - 1 - y);
}

export function areaAt(g: WorldGrid, x: number, y: number): RegionArea | null {
  for (const a of g.areas) {
    if (x >= a.originGx && y >= a.originGy && x < a.originGx + a.width && y < a.originGy + a.height) return a;
  }
  return null;
}

// True if (x, y) lies within `pad` tiles of a house sprite's rectangle.
export function nearHouse(g: WorldGrid, x: number, y: number, padX: number, padTop: number, padBottom: number) {
  for (const h of g.houses) {
    if (x >= h.gx - padX && x < h.gx + h.w + padX && y >= h.gy - padTop && y < h.gy + h.h + padBottom) return true;
  }
  return false;
}

// Keeps only cells that sit inside a full 2x2 block of the mask, the smallest shape the
// 13-tile autotile sets can draw without gaps.
export function openMask(mask: Set<string>): Set<string> {
  const has = (x: number, y: number) => mask.has(key(x, y));
  const out = new Set<string>();
  for (const k of mask) {
    const [x, y] = k.split(',').map(Number);
    for (const [ox, oy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
      const bx = x + ox, by = y + oy;
      if (has(bx, by) && has(bx + 1, by) && has(bx, by + 1) && has(bx + 1, by + 1)) {
        out.add(k);
        break;
      }
    }
  }
  return out;
}

// Drops 4-connected blobs smaller than `min` cells: tiny autotiled patches read as mats.
export function dropSmall(mask: Set<string>, min: number): Set<string> {
  const out = new Set<string>();
  const seen = new Set<string>();
  for (const start of mask) {
    if (seen.has(start)) continue;
    const blob = [start];
    seen.add(start);
    for (let i = 0; i < blob.length; i++) {
      const [x, y] = blob[i].split(',').map(Number);
      for (const k of [key(x + 1, y), key(x - 1, y), key(x, y + 1), key(x, y - 1)]) {
        if (mask.has(k) && !seen.has(k)) {
          seen.add(k);
          blob.push(k);
        }
      }
    }
    if (blob.length >= min) blob.forEach((k) => out.add(k));
  }
  return out;
}

// The 13-tile convention every Kenmi terrain sheet here shares, for a cell inside `region`:
// outer corners, edges, then inner corners, else the full centre. Frame numbers are for the
// sheet's own layout; see edgeFrameGrass / edgeFrame3.
export type EdgeFrames = {
  nw: number; ne: number; sw: number; se: number;
  n: number; s: number; w: number; e: number;
  inSE: number; inSW: number; inNE: number; inNW: number;
  centre: number;
};

export function edgeFrame(region: Set<string>, x: number, y: number, f: EdgeFrames): number {
  const r = (dx: number, dy: number) => region.has(key(x + dx, y + dy));
  const n = r(0, -1), s = r(0, 1), w = r(-1, 0), e = r(1, 0);
  if (!n && !w) return f.nw;
  if (!n && !e) return f.ne;
  if (!s && !w) return f.sw;
  if (!s && !e) return f.se;
  if (!n) return f.n;
  if (!s) return f.s;
  if (!w) return f.w;
  if (!e) return f.e;
  if (!r(1, 1)) return f.inSE;
  if (!r(-1, 1)) return f.inSW;
  if (!r(1, -1)) return f.inNE;
  if (!r(-1, -1)) return f.inNW;
  return f.centre;
}

// A 3-column sheet: 3x3 block at rows 0-2, inner corners at rows 3-4 cols 0-1
// (water, cobble).
export function frames3(stride: number, offset = 0): EdgeFrames {
  const at = (r: number, c: number) => r * stride + c + offset;
  return {
    nw: at(0, 0), n: at(0, 1), ne: at(0, 2),
    w: at(1, 0), centre: at(1, 1), e: at(1, 2),
    sw: at(2, 0), s: at(2, 1), se: at(2, 2),
    inSE: at(3, 0), inSW: at(3, 1), inNE: at(4, 0), inNW: at(4, 1),
  };
}
