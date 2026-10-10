import Phaser from 'phaser';
import { key, nearHouse, inBounds, TILE, type TreeRecord, type WorldGrid } from '@/game/worldGrid';
import { TOWN_PROP_BY_ID, type TownEdits, type TownProp } from '@/lib/townEdits';

// Draws the player's village edits (lib/townEdits.ts) into a generated town. The town is
// built in a fixed order, and each kind of edit slots in where it can't move anything else:
//   cutTrees(border)  right after the roads, so the roads never route through a clearing
//   paintRoads        before the ground is drawn, so painted paths get the roads' edge tiles
//   placeProps        before trees and ground cover, which then grow around them
//   renderTallGrass   likewise
//   cutTrees(groves)  last, so a felled tree leaves a clear patch of grass

const cellsOf = (gx: number, gy: number, w: number, h: number) => {
  const out: string[] = [];
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) out.push(key(gx + dx, gy + dy));
  return out;
};

export function propCells(p: TownProp): string[] {
  const spec = TOWN_PROP_BY_ID[p.item];
  return cellsOf(p.gx, p.gy, spec.w, spec.h);
}

const xy = (k: string) => k.split(',').map(Number) as [number, number];

// A tile the player may build on: inside the town, not a house, water, the square or a
// doorstep, and not taken by anything solid (trees, the forest ring, other pieces).
export function buildable(g: WorldGrid, k: string): boolean {
  const [x, y] = xy(k);
  if (!inBounds(g, x, y) || nearHouse(g, x, y, 0, 0, 0)) return false;
  return !g.water.has(k) && !g.plaza.has(k) && !g.keepClear.has(k) && !g.blocked.has(k);
}

// Ground can also be painted over a doorstep (it stays walkable) but nothing else blocked.
export function paintable(g: WorldGrid, k: string): boolean {
  const [x, y] = xy(k);
  if (!inBounds(g, x, y) || nearHouse(g, x, y, 0, 0, 0)) return false;
  return !g.water.has(k) && !g.plaza.has(k) && (!g.blocked.has(k) || g.keepClear.has(k));
}

export function paintRoads(g: WorldGrid, edits: TownEdits) {
  for (const [k, paint] of Object.entries(edits.ground)) {
    if (paint === 'grass' || paint === 'tall') {
      if (!g.plaza.has(k)) g.road.delete(k);
    } else if (paint === 'path' && paintable(g, k)) {
      g.road.add(k);
    }
  }
}

// Tall grass: the forest floor's lush green with grass swaying on it. You walk through it.
export function drawTallGrass(scene: Phaser.Scene, g: WorldGrid, k: string): Phaser.GameObjects.GameObject[] {
  const [x, y] = xy(k);
  const cx = x * TILE + TILE / 2, cy = y * TILE + TILE / 2;
  const out: Phaser.GameObjects.GameObject[] = [scene.add.image(cx, cy, g.skin('fill-grass-4')).setDepth(-940)];
  const sway = `grass-anim-${1 + ((x * 7 + y * 3) % 3)}`;
  if (scene.textures.exists(sway)) {
    out.push(scene.add.sprite(cx, cy, g.skin(sway)).setDepth(-590).play({ key: g.skinAnim(sway), startFrame: (x + y) % 8 }));
  }
  return out;
}

export function renderTallGrass(scene: Phaser.Scene, g: WorldGrid, edits: TownEdits): Map<string, Phaser.GameObjects.GameObject[]> {
  const drawn = new Map<string, Phaser.GameObjects.GameObject[]>();
  for (const [k, paint] of Object.entries(edits.ground)) {
    if (paint !== 'tall' || !paintable(g, k) || g.road.has(k)) continue;
    drawn.set(k, drawTallGrass(scene, g, k));
    g.used.add(k);
  }
  return drawn;
}

// One decoration, on the tiles its footprint covers; the same art the town's own square
// and yards use.
export function drawProp(scene: Phaser.Scene, g: WorldGrid, p: TownProp): Phaser.GameObjects.GameObject[] {
  const { gx, gy } = p;
  const bottom = (gy + 1) * TILE;
  switch (p.item) {
    case 'fountain': {
      const y = (gy + 2) * TILE;
      const s = scene.add.sprite((gx + 1) * TILE, y - 2, g.skin('fountain')).setOrigin(0.5, 46 / 48).setDepth(y - 1);
      if (scene.anims.exists(g.skinAnim('fountain-flow'))) s.play(g.skinAnim('fountain-flow'));
      return [s];
    }
    case 'well': {
      const y = (gy + 2) * TILE;
      return [scene.add.image((gx + 1) * TILE, y - 1, g.skin('well')).setOrigin(0.5, 47 / 48).setDepth(y - 1)];
    }
    case 'bench':
      return [scene.add.image(gx * TILE, bottom, g.skin('benches'), 1).setOrigin(0, 28 / 32).setDepth(bottom - 1)];
    case 'lamp': {
      const s = scene.add.sprite(gx * TILE + TILE / 2, bottom, g.skin('lamp-posts')).setOrigin(0.5, 1).setDepth(bottom - 1);
      if (scene.anims.exists(g.skinAnim('lamp-flicker'))) s.play({ key: g.skinAnim('lamp-flicker'), startFrame: (gx + gy) % 6 });
      g.lights.push({ x: gx * TILE + TILE / 2 + 1, y: bottom - 38, scale: 1 });
      return [s];
    }
    case 'barrel':
      return [scene.add.image(gx * TILE + TILE / 2, bottom, g.skin('barrels'), 7).setOrigin(0.5, 1).setDepth(bottom - 1)];
    case 'pot':
      return [scene.add.image(gx * TILE + TILE / 2, bottom - 6, 'flowers', 5).setOrigin(0.5, 1).setDepth(bottom - 1)];
    case 'bush':
      return [scene.add.image(gx * TILE, bottom, g.skin('decor'), 50).setOrigin(0, 1).setDepth(bottom - 1)];
    case 'rock':
      return [scene.add.image(gx * TILE, bottom, g.skin('decor'), 45).setOrigin(0, 1).setDepth(bottom - 1)];
    case 'flowers': {
      const s = scene.add.sprite(gx * TILE + TILE / 2, gy * TILE + TILE / 2, g.skin('flower-anim-1')).setDepth(-590);
      if (scene.anims.exists(g.skinAnim('flower-anim-1-0'))) s.play(g.skinAnim('flower-anim-1-0'));
      return [s];
    }
  }
}

export function claimProp(g: WorldGrid, p: TownProp) {
  const blocks = TOWN_PROP_BY_ID[p.item].blocks;
  for (const k of propCells(p)) {
    g.used.add(k);
    if (blocks) g.blocked.add(k);
  }
}

export function releaseProp(g: WorldGrid, p: TownProp) {
  for (const k of propCells(p)) {
    g.used.delete(k);
    g.blocked.delete(k);
  }
}

// Pieces whose tiles are no longer free (the vault grew a house there) are skipped, not lost:
// they stay saved and come back if the space frees up.
export function placeProps(scene: Phaser.Scene, g: WorldGrid, edits: TownEdits): Map<TownProp, Phaser.GameObjects.GameObject[]> {
  const drawn = new Map<TownProp, Phaser.GameObjects.GameObject[]>();
  for (const p of edits.props) {
    if (!propCells(p).every((k) => buildable(g, k))) continue;
    drawn.set(p, drawProp(scene, g, p));
    claimProp(g, p);
  }
  return drawn;
}

export function cutTree(g: WorldGrid, t: TreeRecord) {
  t.cut = true;
  for (const o of t.objects) o.destroy();
  for (const k of t.cells) {
    g.blocked.delete(k);
    g.used.delete(k);
    g.edgeBushes.get(k)?.destroy();
    g.edgeBushes.delete(k);
  }
}

export function cutTrees(g: WorldGrid, ids: Set<string>, border: boolean) {
  for (const t of g.trees) if (t.border === border && !t.cut && ids.has(t.id)) cutTree(g, t);
}

// The standing tree on tile k, if any; on the forest ring, the nearest ring tree within a
// tile or two, since its trees overlap and there's no one trunk per tile.
export function treeAt(g: WorldGrid, k: string): TreeRecord | null {
  const standing = g.trees.filter((t) => !t.cut);
  const direct = standing.find((t) => t.cells.includes(k));
  if (direct) return direct;
  const [x, y] = xy(k);
  let best: TreeRecord | null = null;
  let bestD = 2.5;
  for (const t of standing) {
    if (!t.border) continue;
    const [tx, ty] = xy(t.id);
    const d = Math.hypot(tx + 0.5 - x, ty - y);
    if (d < bestD) [best, bestD] = [t, d];
  }
  return best;
}
