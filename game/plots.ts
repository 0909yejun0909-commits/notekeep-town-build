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

// A plot for sale: the forest floor under a shade, with a faint fence line round it.
export function drawLockedPlot(scene: Phaser.Scene, p: Plot): Phaser.GameObjects.Graphics {
  const px = p.x * TILE, py = p.y * TILE, size = PLOT * TILE;
  return scene.add
    .graphics()
    .setDepth(-500)
    .fillStyle(0x0b1a12, 0.32)
    .fillRect(px, py, size, size)
    .lineStyle(1, 0x0b1a12, 0.45)
    .strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
}

// Land further out than the plots for sale next to the town lies under cloud until the land
// before it is bought. `hidden(x, y)` says which tiles. The cloud is drawn above everything in
// town, as one bank: flat cloud over the hidden tiles, puffing out over their edge, with a
// shadow under the puffs and a few lighter billows inside.
export function drawClouds(scene: Phaser.Scene, w: number, h: number, hidden: (x: number, y: number) => boolean): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(1e6 - 2);
  const noise = (x: number, y: number, n: number) => (((x * 73856093) ^ (y * 19349663) ^ (n * 83492791)) >>> 0) % 1000 / 1000;
  const edge: [number, number][] = [];
  const inner: [number, number][] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!hidden(x, y)) continue;
      const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const nx = x + dx, ny = y + dy;
        return nx >= 0 && ny >= 0 && nx < w && ny < h && !hidden(nx, ny);
      });
      (open ? edge : inner).push([x, y]);
    }
  }
  const puff = (x: number, y: number, n: number) => 9 + Math.floor(noise(x, y, n) * 5);
  g.fillStyle(0xb8c7d9, 1);
  for (const [x, y] of edge) g.fillCircle((x + 0.5) * TILE, (y + 0.5) * TILE + 3, puff(x, y, 1));
  g.fillStyle(0xe8eef6, 1);
  for (let y = 0; y < h; y++) {
    let start = -1;
    for (let x = 0; x <= w; x++) {
      const on = x < w && hidden(x, y);
      if (on && start < 0) start = x;
      if (!on && start >= 0) {
        g.fillRect(start * TILE, y * TILE, (x - start) * TILE, TILE);
        start = -1;
      }
    }
  }
  for (const [x, y] of edge) g.fillCircle((x + 0.5) * TILE, (y + 0.5) * TILE, puff(x, y, 1));
  for (const [x, y] of inner) {
    const r = noise(x, y, 2);
    if (r < 0.1) {
      g.fillStyle(0xd3deeb, 1).fillCircle((x + 0.5) * TILE, (y + 0.5) * TILE + 4, 10);
      g.fillStyle(0xe8eef6, 1).fillCircle((x + 0.5) * TILE, (y + 0.5) * TILE, 10);
    } else if (r < 0.2) {
      g.fillStyle(0xffffff, 1).fillCircle((x + 0.5) * TILE, (y + 0.5) * TILE - 2, 5 + Math.floor(noise(x, y, 3) * 4));
    }
  }
  for (const [x, y] of edge) {
    if (noise(x, y, 4) < 0.35) g.fillStyle(0xffffff, 1).fillCircle((x + 0.5) * TILE - 2, (y + 0.5) * TILE - 3, 4 + Math.floor(noise(x, y, 5) * 3));
  }
  return g;
}
