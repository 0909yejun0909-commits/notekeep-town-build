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
const CLOUD_KINDS = 6;
const OUTLINE = 0x93a5c0;
const SHADE = 0xcdd8e8;
const BODY = 0xf6f9fd;
const GAP = 0xc4d1e3;

// A seeded 0..1 sequence, so a plot's clouds sit the same way every time the town is drawn.
function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    return s / 0x100000000;
  };
}

// A handful of cloud sprites, each a heap of round puffs on a flat-ish base: a dark outline
// round the whole heap, a soft shade along its underside and a white body.
function ensureCloudTextures(scene: Phaser.Scene) {
  if (scene.textures.exists('cloud-0')) return;
  for (let k = 0; k < CLOUD_KINDS; k++) {
    const rnd = seeded(9157 * (k + 1));
    const puffs: [number, number, number][] = [];
    const base = 3 + Math.floor(rnd() * 2);
    const rb = 11 + Math.floor(rnd() * 4);
    for (let i = 0; i < base; i++) puffs.push([rb + 3 + i * (rb + 2), 0, rb]);
    const width = puffs[puffs.length - 1][0] + rb + 3;
    const tops = 1 + Math.floor(rnd() * 2);
    for (let i = 0; i < tops; i++) {
      const r = rb + 4 + Math.floor(rnd() * 5);
      const x = width * ((i + 1) / (tops + 1)) + (rnd() - 0.5) * 6;
      puffs.push([Math.round(x), -Math.round(r * 0.75), r]);
    }
    const top = Math.min(...puffs.map(([, y, r]) => y - r)) - 3;
    const h = rb + 3 - top;
    const at = puffs.map(([x, y, r]) => [x, y - top, r] as const);
    const g = scene.make.graphics({}, false);
    g.fillStyle(OUTLINE, 1);
    for (const [x, y, r] of at) g.fillCircle(x, y, r + 2);
    g.fillStyle(SHADE, 1);
    for (const [x, y, r] of at) g.fillCircle(x, y, r);
    g.fillStyle(BODY, 1);
    for (const [x, y, r] of at) g.fillCircle(x - 1, y - 3, r - 2);
    g.generateTexture(`cloud-${k}`, width + 1, h + 1);
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
export function drawPlotCloud(scene: Phaser.Scene, p: Plot, area: ReturnType<typeof cloudArea>): PlotCloud {
  ensureCloudTextures(scene);
  const [x0, y0, x1, y1] = [area.x0 * TILE, area.y0 * TILE, area.x1 * TILE, area.y1 * TILE];
  const base = scene.add.rectangle(x0, y0, x1 - x0, y1 - y0, GAP).setOrigin(0, 0).setDepth(CLOUD_DEPTH);
  const rnd = seeded(((p.i + 97) * 7919) ^ ((p.j + 97) * 104729));
  const puffs: Phaser.GameObjects.Image[] = [];
  const stepX = 58;
  const stepY = 36;
  for (let y = y0 + 8, row = 0; y < y1 + 12; y += stepY, row++) {
    for (let x = x0 + (row % 2 ? stepX / 2 : 4); x < x1 + 12; x += stepX) {
      const img = scene.add
        .image(Math.round(x + (rnd() - 0.5) * 22), Math.round(y + (rnd() - 0.5) * 14), `cloud-${Math.floor(rnd() * CLOUD_KINDS)}`)
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
    const push = 110 + (i % 5) * 14;
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
