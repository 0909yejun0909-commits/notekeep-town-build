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
const CLOUD_KINDS = 12;
// Lightest to darkest: the tones the clouds are shaded in, then their outline.
const TONES = [0xffffff, 0xf1f5fb, 0xe0e8f3, 0xc9d5e6, 0xadbdd4];
const OUTLINE = 0x93a4c0;
// 4 x 4 ordered dither: shading steps from one tone to the next in a fine pixel checker, the way
// pixel art shades a curve, instead of in flat bands.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
// Light from above and to the left, a little in front.
const LIGHT = (() => {
  const v = [-0.45, -0.75, 0.5];
  const n = Math.hypot(...v);
  return v.map((c) => c / n);
})();

// A seeded 0..1 sequence, so a plot's clouds sit the same way every time the town is drawn.
function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    return s / 0x100000000;
  };
}

const hash01 = (x: number, y: number, k: number) => ((((x * 374761393) ^ (y * 668265263) ^ (k * 2147483647)) >>> 0) % 1000) / 1000;

function putPixel(data: Uint8ClampedArray, w: number, x: number, y: number, rgb: number) {
  const i = (y * w + x) * 4;
  data[i] = (rgb >> 16) & 255;
  data[i + 1] = (rgb >> 8) & 255;
  data[i + 2] = rgb & 255;
  data[i + 3] = 255;
}

// A tone for a lighting level, dithered at (x, y) between the two tones it falls between.
function tone(level: number, x: number, y: number): number {
  const t = Math.max(0, Math.min(TONES.length - 1.001, level));
  const lo = Math.floor(t);
  return TONES[t - lo > BAYER[(y % 4) * 4 + (x % 4)] ? lo + 1 : lo];
}

// The cloud sprites, drawn a pixel at a time. Each is a heap of round puffs, back ones first.
// Every pixel is lit as if the puff it's on were a ball, the level dithered between five tones,
// with a little grain so no two puffs are shaded quite alike. A thin outline goes round the heap,
// and where a puff sits in front of another a soft crease of shade shows along its edge.
// All the sprites go on one sheet, a frame each, so a whole bank draws in one batch.
function ensureCloudTextures(scene: Phaser.Scene) {
  if (scene.textures.exists('plot-clouds')) return;
  const drawn: { w: number; h: number; img: ImageData }[] = [];
  const scratch = document.createElement('canvas').getContext('2d')!;
  for (let k = 0; k < CLOUD_KINDS; k++) {
    const rnd = seeded(9157 * (k + 1));
    const puffs: [number, number, number][] = [];
    const n = 3 + Math.floor(rnd() * 3);
    let x = 0;
    const rows: [number, number, number][] = [];
    for (let i = 0; i < n; i++) {
      const r = 8 + Math.floor(rnd() * 4);
      x += i === 0 ? r : Math.round(r * 1.1);
      rows.push([x, Math.round((rnd() - 0.5) * 3), r]);
    }
    const width = x + rows[rows.length - 1][2];
    const m = 1 + Math.floor(rnd() * 3);
    for (let i = 0; i < m; i++) {
      const r = 10 + Math.floor(rnd() * 5);
      puffs.push([Math.round(width * ((i + 0.5) / m) + (rnd() - 0.5) * 6), -Math.round(r * 0.6 + rnd() * 3), r]);
    }
    puffs.push(...rows);
    const left = Math.floor(Math.min(...puffs.map(([px, , r]) => px - r))) - 2;
    const top = Math.floor(Math.min(...puffs.map(([, py, r]) => py - r))) - 2;
    const w = Math.ceil(Math.max(...puffs.map(([px, , r]) => px + r))) - left + 3;
    const h = Math.ceil(Math.max(...puffs.map(([, py, r]) => py + r))) - top + 3;
    const img = scratch.createImageData(w, h);
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const X = px + left + 0.5;
        const Y = py + top + 0.5;
        // The frontmost puff this pixel is on, and whether one behind it is there too.
        let hit = -1;
        let behind = false;
        let near = -1;
        puffs.forEach(([cx, cy, r], i) => {
          const d = Math.hypot(X - cx, Y - cy);
          if (d <= r) {
            if (hit >= 0) behind = true;
            hit = i;
          } else if (d <= r + 1.2) near = i;
        });
        if (hit < 0) {
          // Outlined along the underside only; the sides are a soft shade and the top a pale
          // rim that melts into the clouds behind, so a bank doesn't read as rows of scales.
          if (near >= 0) {
            const below = (Y - puffs[near][1]) / puffs[near][2];
            putPixel(img.data, w, px, py, below > 0.4 ? OUTLINE : below > -0.3 ? TONES[3] : TONES[2]);
          }
          continue;
        }
        const [cx, cy, r] = puffs[hit];
        const nx = (X - cx) / r;
        const ny = (Y - cy) / r;
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        const lit = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2];
        const edge = Math.hypot(X - cx, Y - cy) > r - 1.3;
        // A crease where the lower rim of this puff lies over the puff behind.
        const crease = edge && behind && ny > 0.2;
        let level = (1 - lit) * 2.2 + (hash01(px, py, k) - 0.5) * 0.5;
        if (crease) level = Math.max(level, 3.1);
        putPixel(img.data, w, px, py, tone(level, px, py));
      }
    }
    drawn.push({ w, h, img });
  }
  const sheet = scene.textures.createCanvas('plot-clouds', drawn.reduce((n, d) => n + d.w + 1, 0), Math.max(...drawn.map((d) => d.h)))!;
  let at = 0;
  drawn.forEach(({ w, h, img }, k) => {
    sheet.getContext().putImageData(img, at, 0);
    sheet.add(`${k}`, 0, at, 0, w, h);
    at += w + 1;
  });
  sheet.refresh();
  // The cloud floor under them all: the shaded undersides of clouds further down, dithered and
  // grained the same way, so wherever the clouds part a little there's still cloud.
  const size = 32;
  const floor = scene.textures.createCanvas('plot-cloud-floor', size, size)!;
  const fctx = floor.getContext();
  const fimg = fctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const wave = Math.sin((x / size) * Math.PI * 2) * 0.25 + Math.sin((y / size) * Math.PI * 4 + x * 0.2) * 0.25;
      putPixel(fimg.data, size, x, y, tone(2.7 + wave + (hash01(x, y, 99) - 0.5) * 0.6, x, y));
    }
  }
  fctx.putImageData(fimg, 0, 0);
  floor.refresh();
}

export type PlotCloud = { base: Phaser.GameObjects.TileSprite; puffs: Phaser.GameObjects.Image[]; cx: number; cy: number };

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
  const base = scene.add.tileSprite(fx0, fy0, fx1 - fx0, fy1 - fy0, 'plot-cloud-floor').setOrigin(0, 0).setDepth(CLOUD_DEPTH);
  const rnd = seeded(((p.i + 97) * 7919) ^ ((p.j + 97) * 104729));
  const puffs: Phaser.GameObjects.Image[] = [];
  // Two layers of clouds, packed so they overlap: a back one, and a front one set between it.
  const stepX = 36;
  const stepY = 22;
  for (const layer of [0, 1]) {
    for (let y = y0 + 4 + layer * (stepY / 2), row = 0; y < y1 + 10; y += stepY, row++) {
      for (let x = x0 + ((row + layer) % 2 ? stepX / 2 : 0); x < x1 + 10; x += stepX) {
        const img = scene.add
          .image(Math.round(x + (rnd() - 0.5) * 12), Math.round(y + (rnd() - 0.5) * 6), 'plot-clouds', `${Math.floor(rnd() * CLOUD_KINDS)}`)
          .setDepth(CLOUD_DEPTH + 1);
        puffs.push(img);
      }
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
