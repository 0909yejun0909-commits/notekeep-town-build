import type Phaser from 'phaser';
import { key, TILE, type WorldGrid } from '@/game/worldGrid';
import { PLOT, PLOT_RINGS } from '@/lib/townEdits';

// The land for sale around the town: a band PLOT_RINGS square plots deep between the town
// and the forest. A plot is named by where it sits counted in plots from the town's top-left
// corner, so its name survives the town growing.
export type Plot = { id: string; i: number; j: number; x: number; y: number };

// `cols` x `rows` is the town's size in plots; (ox, oy) its top-left tile.
export function plotsAround(ox: number, oy: number, cols: number, rows: number): Plot[] {
  const out: Plot[] = [];
  for (let j = -PLOT_RINGS; j < rows + PLOT_RINGS; j++) {
    for (let i = -PLOT_RINGS; i < cols + PLOT_RINGS; i++) {
      if (i >= 0 && j >= 0 && i < cols && j < rows) continue;
      out.push({ id: `${i},${j}`, i, j, x: ox + i * PLOT, y: oy + j * PLOT });
    }
  }
  return out;
}

export const plotCells = (p: Plot) => {
  const out: string[] = [];
  for (let dy = 0; dy < PLOT; dy++) for (let dx = 0; dx < PLOT; dx++) out.push(key(p.x + dx, p.y + dy));
  return out;
};

export function plotAt(plots: Plot[], tx: number, ty: number): Plot | null {
  return plots.find((p) => tx >= p.x && ty >= p.y && tx < p.x + PLOT && ty < p.y + PLOT) ?? null;
}

// A plot can be bought once it touches the town or land already owned.
export function plotReachable(p: Plot, cols: number, rows: number, owned: Set<string>): boolean {
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([di, dj]) => {
    const i = p.i + di, j = p.j + dj;
    return (i >= 0 && j >= 0 && i < cols && j < rows) || owned.has(`${i},${j}`);
  });
}

// Owned land: walkable, buildable, and clear of the hedge that edged the town. `keep` stays
// blocked: a house the player built on the land.
export function openPlot(g: WorldGrid, p: Plot, keep: Set<string> = new Set()) {
  for (const k of plotCells(p)) {
    if (!keep.has(k)) g.blocked.delete(k);
    g.open.add(k);
    g.edgeBushes.get(k)?.destroy();
    g.edgeBushes.delete(k);
  }
}

// ---- Clouds over the land for sale ----

// Under the town's day and night tint (game/daylight.ts), over everything in town.
export const CLOUD_DEPTH = 99000;
const CLOUD_KINDS = 10;
const OUTLINE = 0x8fa1bd;
const SHADE = 0xc9d5e6;
const BODY = 0xeef3fa;
const LIGHT = 0xffffff;
const GAP = 0xc4d1e3;

// A seeded 0..1 sequence, so a plot's clouds sit the same way every time the town is drawn.
function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    return s / 0x100000000;
  };
}

// A set of small cloud sprites, each a heap of little round puffs: a row along the bottom, a
// tier or two of bigger ones above. One thin outline goes round the whole heap; inside it the
// puffs are drawn back to front, each with a shaded underside that shows as a soft crease over
// the puff behind, a pale body and, up top, a white glint where the light catches it.
function ensureCloudTextures(scene: Phaser.Scene) {
  if (scene.textures.exists('cloud-0')) return;
  for (let k = 0; k < CLOUD_KINDS; k++) {
    const rnd = seeded(9157 * (k + 1));
    const front: [number, number, number][] = [];
    const big = k % 3 === 0;
    const n = (big ? 5 : 3) + Math.floor(rnd() * 3);
    let x = 0;
    for (let i = 0; i < n; i++) {
      const r = (big ? 5 : 4) + Math.floor(rnd() * 3);
      x += i === 0 ? r : r + 2 + Math.floor(rnd() * 2);
      front.push([x, Math.round((rnd() - 0.5) * 2), r]);
    }
    const width = x + front[front.length - 1][2];
    const middle: [number, number, number][] = [];
    const m = 2 + Math.floor(rnd() * 2);
    for (let i = 0; i < m; i++) {
      const r = (big ? 7 : 6) + Math.floor(rnd() * 3);
      middle.push([Math.round(width * ((i + 0.5) / m) + (rnd() - 0.5) * 4), -Math.round(r * 0.7 + rnd() * 2), r]);
    }
    const back: [number, number, number][] = [];
    if (rnd() < 0.6) {
      const r = 5 + Math.floor(rnd() * 2);
      const [mx, my] = middle[Math.floor(rnd() * middle.length)];
      back.push([mx + Math.round((rnd() - 0.5) * 6), my - r - 1, r]);
    }
    // Glints only on the upper puffs, which face the light.
    const puffs = [...back.map((q) => [...q, true] as const), ...middle.map((q) => [...q, true] as const), ...front.map((q) => [...q, false] as const)];
    const pad = 2;
    const left = Math.min(...puffs.map(([px, , r]) => px - r)) - pad;
    const top = Math.min(...puffs.map(([, py, r]) => py - r)) - pad;
    const right = Math.max(...puffs.map(([px, , r]) => px + r)) + pad;
    const bottom = Math.max(...puffs.map(([, py, r]) => py + r)) + pad;
    const g = scene.make.graphics({}, false);
    g.fillStyle(OUTLINE, 1);
    for (const [px, py, r] of puffs) g.fillCircle(px - left, py - top, r + 1);
    for (const [px, py, r, glint] of puffs) {
      const cx = px - left;
      const cy = py - top;
      g.fillStyle(SHADE, 1).fillCircle(cx, cy, r);
      g.fillStyle(BODY, 1).fillCircle(cx, cy - 1.5, r - 1);
      if (glint) g.fillStyle(LIGHT, 1).fillCircle(cx - r * 0.35, cy - r * 0.4, Math.max(1.5, r * 0.4));
    }
    g.generateTexture(`cloud-${k}`, right - left, bottom - top);
    g.destroy();
  }
}

export type PlotCloud = { base: Phaser.GameObjects.Rectangle; puffs: Phaser.GameObjects.Image[]; cx: number; cy: number };

// The tiles a plot's cloud covers: the plot, and on the outer ring the forest behind it too,
// out to the edge of the world.
export function cloudArea(p: Plot, cols: number, rows: number, w: number, h: number) {
  const outer = PLOT_RINGS;
  return {
    x0: p.i === -outer ? 0 : p.x,
    y0: p.j === -outer ? 0 : p.y,
    x1: p.i === cols + outer - 1 ? w : p.x + PLOT,
    y1: p.j === rows + outer - 1 ? h : p.y + PLOT,
  };
}

// A bank of cloud over one plot: a shaded floor so nothing shows between the clouds, and the
// clouds themselves, overlapping, the nearer ones over the farther, the edge ones puffing out
// over the land next to it.
// `clear` says which sides face land that isn't under cloud: there the floor stops short, so the
// bank's edge is clouds, not a straight line.
export type ClearSides = { left: boolean; right: boolean; top: boolean; bottom: boolean };
const EDGE_INSET = 6;

export function drawPlotCloud(scene: Phaser.Scene, p: Plot, area: ReturnType<typeof cloudArea>, clear: ClearSides): PlotCloud {
  ensureCloudTextures(scene);
  const [x0, y0, x1, y1] = [area.x0 * TILE, area.y0 * TILE, area.x1 * TILE, area.y1 * TILE];
  const fx0 = x0 + (clear.left ? EDGE_INSET : 0);
  const fy0 = y0 + (clear.top ? EDGE_INSET : 0);
  const fx1 = x1 - (clear.right ? EDGE_INSET : 0);
  const fy1 = y1 - (clear.bottom ? EDGE_INSET : 0);
  const base = scene.add.rectangle(fx0, fy0, fx1 - fx0, fy1 - fy0, GAP).setOrigin(0, 0).setDepth(CLOUD_DEPTH);
  const rnd = seeded(((p.i + 97) * 7919) ^ ((p.j + 97) * 104729));
  const puffs: Phaser.GameObjects.Image[] = [];
  const stepX = 42;
  const stepY = 24;
  for (let y = y0 + 8, row = 0; y < y1 + 12; y += stepY, row++) {
    for (let x = x0 + (row % 2 ? stepX / 2 : 4); x < x1 + 12; x += stepX) {
      const img = scene.add
        .image(Math.round(x + (rnd() - 0.5) * 20), Math.round(y + (rnd() - 0.5) * 10), `cloud-${Math.floor(rnd() * CLOUD_KINDS)}`)
        .setFlipX(rnd() < 0.5)
        .setDepth(CLOUD_DEPTH + 1);
      puffs.push(img);
    }
  }
  // Nearer (lower) clouds over farther ones.
  puffs.sort((a, b) => a.y - b.y).forEach((img, i) => img.setDepth(CLOUD_DEPTH + 1 + i * 0.001));
  return { base, puffs, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

// Bought: the plot's clouds drift apart from its middle and thin away, gently at first and
// each a moment after the last, then `done`.
export function partClouds(scene: Phaser.Scene, cloud: PlotCloud, done: () => void) {
  scene.tweens.add({ targets: cloud.base, alpha: 0, duration: 700, ease: 'Sine.easeInOut' });
  cloud.puffs.forEach((img, i) => {
    let dx = img.x - cloud.cx;
    let dy = img.y - cloud.cy;
    if (Math.hypot(dx, dy) < 4) [dx, dy] = [Math.cos(i), Math.sin(i)];
    const len = Math.hypot(dx, dy);
    const push = 90 + (i % 5) * 12;
    img.setDepth(img.depth + 1);
    scene.tweens.add({
      targets: img,
      x: img.x + (dx / len) * push,
      y: img.y + (dy / len) * push,
      alpha: 0,
      scale: 1.12,
      duration: 1500,
      delay: (i % 6) * 45,
      ease: 'Sine.easeInOut',
    });
  });
  scene.time.delayedCall(1800, () => {
    cloud.base.destroy();
    cloud.puffs.forEach((img) => img.destroy());
    done();
  });
}
