import Phaser from 'phaser';
import type { BiomeId } from '@/lib/types';
import { fbm, mix, rand01 } from '@/game/noise';
import { areaAt, dropSmall, edgeFrame, frames3, key, openMask, ringDistance, type EdgeFrames, type WorldGrid } from '@/game/worldGrid';

// Tileset firstgids inside the one ground tilemap.
const GID_G1 = 0;
const GID_G = { 2: 200, 3: 400, 4: 600 } as const;
const GID_FILL = { 2: 800, 3: 801, 4: 802 } as const;
const GID_PEBBLE = 900;
const GID_COBBLE = 910;
export const GID_WATER = 1000;

type Tone = 2 | 3 | 4;

// Grass_Tiles_N drawn over the base meadow: tone grass on transparent.
const TONE_EDGES = (tone: Tone): EdgeFrames => {
  const g = GID_G[tone];
  return {
    nw: g + 48, ne: g + 49, sw: g + 64, se: g + 65,
    n: g + 33, s: g + 1, w: g + 18, e: g + 16,
    inSE: g + 0, inSW: g + 2, inNE: g + 32, inNW: g + 34,
    centre: GID_FILL[tone],
  };
};

// Grass around sand, from grass_meadow.png (the same frames roadFrame always used).
export const ROAD_EDGES: EdgeFrames = {
  nw: 80, n: 81, ne: 82, w: 96, centre: 97, e: 98, sw: 112, s: 113, se: 114,
  inSE: 128, inSW: 129, inNE: 144, inNW: 145,
};

const COBBLE_EDGES = frames3(3, GID_COBBLE);
const TUFTS = [149, 150, 151];

// Each biome gets a main patch tone and a sparser accent tone.
const TONES: Record<BiomeId, [Tone, Tone]> = {
  meadow: [2, 3],
  forest: [2, 4],
  desert: [3, 2],
  volcano: [3, 2],
  snow: [4, 2],
};

export type Ground = { map: Phaser.Tilemaps.Tilemap; toneAt: (x: number, y: number) => Tone | 1 };

export function buildGround(scene: Phaser.Scene, g: WorldGrid): Ground {
  const map = scene.make.tilemap({ tileWidth: 16, tileHeight: 16, width: g.w, height: g.h });
  const ts = [
    map.addTilesetImage('g1', g.skin('grass-edges'), 16, 16, 0, 0, GID_G1),
    map.addTilesetImage('g2', g.skin('grass-2'), 16, 16, 0, 0, GID_G[2]),
    map.addTilesetImage('g3', g.skin('grass-3'), 16, 16, 0, 0, GID_G[3]),
    map.addTilesetImage('g4', g.skin('grass-4'), 16, 16, 0, 0, GID_G[4]),
    map.addTilesetImage('f2', g.skin('fill-grass-2'), 16, 16, 0, 0, GID_FILL[2]),
    map.addTilesetImage('f3', g.skin('fill-grass-3'), 16, 16, 0, 0, GID_FILL[3]),
    map.addTilesetImage('f4', g.skin('fill-grass-4'), 16, 16, 0, 0, GID_FILL[4]),
  ].filter((t): t is Phaser.Tilemaps.Tileset => t !== null);
  const pebbles = map.addTilesetImage('pebbles', g.skin('path-decor'), 16, 16, 0, 0, GID_PEBBLE)!;
  const cobble = map.addTilesetImage('cobble', g.skin('cobble-edges'), 16, 16, 0, 0, GID_COBBLE)!;

  const patchLayer = map.createBlankLayer('patches', ts)!.setDepth(-980);
  const roadLayer = map.createBlankLayer('roads', [ts[0], pebbles, cobble])!.setDepth(-950);

  // Tone patches stay a tile clear of roads and water: those tiles' baked grass fringe is
  // the base meadow colour and would show a seam against a different tone.
  const nearWet = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const k = key(x + dx, y + dy);
        if (g.road.has(k) || g.water.has(k)) return true;
      }
    }
    return false;
  };

  const biomeAt = (x: number, y: number): BiomeId => areaAt(g, x, y)?.region.biome ?? 'meadow';
  const masks: Record<Tone, Set<string>> = { 2: new Set(), 3: new Set(), 4: new Set() };
  // The ring runs one tile past the map edge so edge tiles autotile as interior.
  for (let y = -1; y <= g.h; y++) {
    for (let x = -1; x <= g.w; x++) {
      if (nearWet(x, y)) continue;
      // The forest floor spills a ragged few tiles past the ring so the edge isn't a ruler line.
      if (ringDistance(g, x, y) < fbm(g.seed ^ 0x13, x, y, 5) * 5 - 1.5) {
        masks[4].add(key(x, y));
        continue;
      }
      const [main, accent] = TONES[biomeAt(x, y)];
      if (fbm(g.seed ^ 0x51, x, y, 11) > 0.55) masks[main].add(key(x, y));
      else if (fbm(g.seed ^ 0x77, x, y, 6) > 0.7) masks[accent].add(key(x, y));
    }
  }

  const tone = new Map<string, Tone>();
  const interior = new Set<string>();
  for (const t of [2, 3, 4] as Tone[]) {
    const region = dropSmall(openMask(masks[t]), 16);
    const frames = TONE_EDGES(t);
    for (const k of region) {
      const [x, y] = k.split(',').map(Number);
      if (x < 0 || y < 0 || x >= g.w || y >= g.h) continue;
      const frame = edgeFrame(region, x, y, frames);
      patchLayer.putTileAt(frame, x, y);
      tone.set(k, t);
      if (frame === frames.centre) interior.add(k);
    }
  }

  // Tufts cluster where a second noise field is high; each one matches the grass under it.
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const k = key(x, y);
      if (g.road.has(k) || g.water.has(k)) continue;
      const t = tone.get(k);
      if (t && !interior.has(k)) continue;
      const density = 0.015 + 0.12 * Math.max(0, fbm(g.seed ^ 0x2a, x, y, 5) - 0.45);
      if (rand01(g.seed ^ 0x3b, x, y) >= density) continue;
      const frame = TUFTS[mix(g.seed ^ 0x4c, x, y) % 3];
      patchLayer.putTileAt((t ? GID_G[t] : GID_G1) + frame, x, y);
    }
  }

  const cobbleRegion = openMask(new Set([...g.plaza].filter((k) => {
    const [x, y] = k.split(',').map(Number);
    return edgeFrame(g.road, x, y, ROAD_EDGES) === ROAD_EDGES.centre;
  })));
  for (const k of g.road) {
    const [x, y] = k.split(',').map(Number);
    let frame = edgeFrame(g.road, x, y, ROAD_EDGES);
    if (cobbleRegion.has(k)) frame = edgeFrame(cobbleRegion, x, y, COBBLE_EDGES);
    else if (frame === ROAD_EDGES.centre && rand01(g.seed ^ 0x5d, x, y) < 0.14) {
      frame = GID_PEBBLE + (mix(g.seed ^ 0x6e, x, y) % 3);
    }
    roadLayer.putTileAt(frame, x, y);
  }

  return { map, toneAt: (x, y) => tone.get(key(x, y)) ?? 1 };
}
