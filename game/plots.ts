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
