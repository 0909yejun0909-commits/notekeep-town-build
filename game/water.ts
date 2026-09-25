import Phaser from 'phaser';
import { mix, noise2, rand01 } from '@/game/noise';
import { edgeFrame, frames3, key, nearHouse, openMask, TILE, type WorldGrid } from '@/game/worldGrid';

const MIN_W = 7;
const MIN_H = 6;
const MAX_W = 13;
const MAX_H = 10;

// A few ponds, each carved into the biggest open rectangle left in the town that stays clear
// of houses, doors, the plaza and other ponds. Water is blocked, so roads route around it.
export function placePonds(g: WorldGrid) {
  const want = Math.min(4, Math.ceil(g.areas.length / 2) + 1);
  for (let i = 0; i < want; i++) if (!placePond(g, i)) break;
}

function placePond(g: WorldGrid, index: number): boolean {
  const x0 = g.border + 1;
  const y0 = g.border + 1;
  const W = g.w - 2 * (g.border + 1);
  const H = g.h - 2 * (g.border + 1);
  if (W < MIN_W || H < MIN_H) return false;
  const free = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const gx = x0 + x, gy = y0 + y;
      if (nearHouse(g, gx, gy, 1, 1, 3)) continue;
      let ok = true;
      for (let dy = -2; dy <= 2 && ok; dy++) {
        for (let dx = -2; dx <= 2 && ok; dx++) {
          const k = key(gx + dx, gy + dy);
          if (g.blocked.has(k) || g.keepClear.has(k) || g.plaza.has(k) || g.used.has(k) || g.water.has(k)) ok = false;
        }
      }
      if (ok) free[y * W + x] = 1;
    }
  }

  // Every maximal free rectangle big enough for a pond (histogram method). Scores are capped
  // at the pond's maximum size so a long thin strip never beats a roomy square.
  const heights = new Array<number>(W).fill(0);
  const candidates: { score: number; x: number; y: number; w: number; h: number }[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) heights[x] = free[y * W + x] ? heights[x] + 1 : 0;
    const stack: number[] = [];
    for (let x = 0; x <= W; x++) {
      const hx = x === W ? 0 : heights[x];
      while (stack.length && heights[stack[stack.length - 1]] >= hx) {
        const top = stack.pop()!;
        const hh = heights[top];
        const left = stack.length ? stack[stack.length - 1] + 1 : 0;
        const ww = x - left;
        if (ww >= MIN_W && hh >= MIN_H) {
          candidates.push({ score: Math.min(ww, MAX_W) * Math.min(hh, MAX_H), x: left, y: y - hh + 1, w: ww, h: hh });
        }
      }
      stack.push(x);
    }
  }
  if (candidates.length === 0) return false;

  // Among the roomy sites, prefer ones far from the ponds already dug, with a seeded nudge so
  // ties don't always resolve to the top of the map.
  const top = Math.max(...candidates.map((c) => c.score));
  const ponds = [...g.water].map((k) => k.split(',').map(Number));
  const rate = (c: (typeof candidates)[number]) => {
    const cx = x0 + c.x + c.w / 2, cy = y0 + c.y + c.h / 2;
    let near = 40;
    for (let i = 0; i < ponds.length; i += 7) near = Math.min(near, Math.hypot(ponds[i][0] - cx, ponds[i][1] - cy));
    return c.score / top + near / 20 + rand01(g.seed ^ 0x6b, c.x, c.y) * 0.6;
  };
  const best = candidates.filter((c) => c.score >= top * 0.75).reduce((a, b) => (rate(b) > rate(a) ? b : a));

  const seed = g.seed ^ mix(0x7a11, index, 0);
  const cw = Math.min(best.w, MAX_W);
  const ch = Math.min(best.h, MAX_H);
  // Within a roomy rectangle, slide the pond off-centre so ponds don't all sit dead centre.
  const cx = best.x + cw / 2 + ((mix(seed, 1, 0) % 100) / 100) * (best.w - cw);
  const cy = best.y + ch / 2 + ((mix(seed, 2, 0) % 100) / 100) * (best.h - ch);
  const rx = cw / 2 - 0.8;
  const ry = ch / 2 - 0.8;
  const mask = new Set<string>();
  for (let y = best.y; y < best.y + best.h; y++) {
    for (let x = best.x; x < best.x + best.w; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      const wobble = (noise2(seed, x, y, 3) - 0.5) * 0.7;
      if (dx * dx + dy * dy < 1 + wobble) mask.add(key(x0 + x, y0 + y));
    }
  }
  const pond = openMask(mask);
  if (pond.size < 12) return false;
  for (const k of pond) {
    g.water.add(k);
    g.blocked.add(k);
  }
  return true;
}

const WATER_BASE = frames3(24);

export function renderWater(scene: Phaser.Scene, g: WorldGrid, map: Phaser.Tilemaps.Tilemap, gid: number) {
  if (g.water.size === 0) return;
  const ts = map.addTilesetImage('water', 'water-anim', 16, 16, 0, 0, gid)!;
  const layer = map.createBlankLayer('water', ts)!.setDepth(-930);

  const tiles: { tile: Phaser.Tilemaps.Tile; base: number }[] = [];
  for (const k of g.water) {
    const [x, y] = k.split(',').map(Number);
    const base = edgeFrame(g.water, x, y, WATER_BASE);
    const tile = layer.putTileAt(gid + base, x, y);
    tiles.push({ tile, base });

    const interior = base === WATER_BASE.centre;
    if (!interior) continue;
    const roll = rand01(g.seed ^ 0x1d, x, y);
    const nearShore = [[0, -2], [0, 2], [-2, 0], [2, 0]].some(([dx, dy]) => !g.water.has(key(x + dx, y + dy)));
    let texture: string | null = null;
    if (nearShore && roll < 0.22) texture = `cattail-${1 + (mix(g.seed, x, y) % 2)}`;
    else if (roll < 0.14) texture = `lily-${1 + (mix(g.seed ^ 0x2e, x, y) % 4)}`;
    else if (roll < 0.17) texture = `water-rock-${1 + (mix(g.seed ^ 0x3f, x, y) % 2)}`;
    if (!texture) continue;
    scene.add
      .sprite(x * TILE + TILE / 2, y * TILE + TILE / 2, texture)
      .setDepth(-920)
      .play({ key: texture, startFrame: mix(g.seed ^ 0x40, x, y) % 8 });
  }

  let frame = 0;
  scene.time.addEvent({
    delay: 180,
    loop: true,
    callback: () => {
      frame = (frame + 1) % 8;
      for (const t of tiles) t.tile.index = gid + t.base + frame * 3;
    },
  });
}
