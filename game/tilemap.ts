import type { Region, TownBiome } from '@/lib/types';
import { HOUSE_FOOTPRINT, HOUSE_DOOR, houseTextureKey } from '@/lib/houseCatalog';
import { skin } from '@/game/biomeArt';
import { WREATH } from '@/game/winterArt';

const TILE = 16;

export type Entry = { gx: number; gy: number; houseId: string };

export type TilemapResult = {
  blocked: Set<string>;
  doors: Map<string, string>;
  entries: Entry[];
  houseImages: Map<string, Phaser.GameObjects.Image>;
};

const key = (x: number, y: number) => `${x},${y}`;

export function buildHouses(
  scene: Phaser.Scene,
  region: Region,
  originGx: number,
  originGy: number,
  biome: TownBiome = 'forest',
): TilemapResult {
  const blocked = new Set<string>();
  const doors = new Map<string, string>();
  const entries: Entry[] = [];
  const houseImages = new Map<string, Phaser.GameObjects.Image>();

  for (const house of region.houses) {
    const [w, h] = HOUSE_FOOTPRINT[house.variant] ?? HOUSE_FOOTPRINT[0];
    const [doorX, doorY] = HOUSE_DOOR[house.variant] ?? HOUSE_DOOR[0];
    const gx = originGx + house.gx;
    const gy = originGy + house.gy;

    const texture = houseTextureKey(house.variant, house.material, house.wallColor, house.roofColor);
    const img = scene.add
      .image(gx * TILE, gy * TILE, skin(scene, biome, texture))
      .setOrigin(0, 0)
      .setDepth((gy + h) * TILE);
    houseImages.set(house.id, img);
    if (biome === 'snow') {
      // Hung on the upper of the two door tiles.
      scene.add
        .image((gx + doorX) * TILE + TILE / 2, (gy + doorY - 1) * TILE + TILE / 2, WREATH)
        .setDepth((gy + h) * TILE + 1);
    }

    for (let y = 0; y < h - 1; y++) {
      for (let x = 0; x < w; x++) {
        blocked.add(key(gx + x, gy + y));
      }
    }

    const entryX = gx + doorX;
    const entryY = gy + doorY + 1;
    blocked.delete(key(entryX, entryY));
    doors.set(key(entryX, entryY), house.id);
    entries.push({ gx: entryX, gy: entryY, houseId: house.id });
  }

  return { blocked, doors, entries, houseImages };
}

class MinHeap {
  private a: [number, number][] = [];
  get size() { return this.a.length; }
  push(cost: number, node: number) {
    const a = this.a;
    a.push([cost, node]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): [number, number] {
    const a = this.a;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

// Roads are two tiles wide: every path cell stamps a 2x2 block with itself as the top-left.
// A cell is routable only if its whole stamp is inside the world and clear of houses.
// `extraRoad` (town squares) counts as road from the start, so paths are drawn through it.
// Drawing is game/ground.ts's job; this only decides which tiles are road.
export function buildRoads(
  entries: Entry[],
  blocked: Set<string>,
  worldW: number,
  worldH: number,
  extraRoad: Set<string> = new Set(),
): Set<string> {
  const road = new Set<string>(extraRoad);
  if (entries.length === 0) return road;

  const stampOk = (x: number, y: number) =>
    x >= 0 && y >= 0 && x + 1 < worldW && y + 1 < worldH &&
    !blocked.has(key(x, y)) && !blocked.has(key(x + 1, y)) &&
    !blocked.has(key(x, y + 1)) && !blocked.has(key(x + 1, y + 1));

  const stamp = (x: number, y: number) => {
    for (let dx = 0; dx < 2; dx++) {
      for (let dy = 0; dy < 2; dy++) {
        const k = key(x + dx, y + dy);
        if (!blocked.has(k)) road.add(k);
      }
    }
  };

  // Each entry's stamp is anchored one tile left so the door sits in the road's middle.
  const anchors = entries.map((e) => ({ x: e.gx - 1, y: e.gy, id: e.houseId }));

  // Dijkstra over (tile, heading) so turns cost extra and roads run straight with clean L-bends.
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
  const route = (from: { x: number; y: number }, to: { x: number; y: number }): [number, number][] | null => {
    const N = worldW * worldH;
    const dist = new Float64Array(N * 4).fill(Infinity);
    const prev = new Int32Array(N * 4).fill(-1);
    const heap = new MinHeap();
    const startTile = from.y * worldW + from.x;
    const goalTile = to.y * worldW + to.x;
    for (let d = 0; d < 4; d++) {
      dist[startTile * 4 + d] = 0;
      heap.push(0, startTile * 4 + d);
    }
    let goalState = -1;
    while (heap.size > 0) {
      const [d, u] = heap.pop();
      if (d > dist[u]) continue;
      const tile = u >> 2, heading = u & 3;
      if (tile === goalTile) { goalState = u; break; }
      const ux = tile % worldW, uy = Math.floor(tile / worldW);
      for (let nd = 0; nd < 4; nd++) {
        const vx = ux + DIRS[nd][0], vy = uy + DIRS[nd][1];
        const isGoal = vx === to.x && vy === to.y;
        if (!isGoal && !stampOk(vx, vy)) continue;
        const onRoad = road.has(key(vx, vy)) && road.has(key(vx + 1, vy + 1));
        const cost = d + (onRoad ? 1 : 4) + (nd === heading ? 0 : 6);
        const v = (vy * worldW + vx) * 4 + nd;
        if (cost < dist[v]) {
          dist[v] = cost;
          prev[v] = u;
          heap.push(cost, v);
        }
      }
    }
    if (goalState === -1) return null;
    const path: [number, number][] = [];
    for (let u = goalState; u !== -1; u = prev[u]) {
      const tile = u >> 2;
      path.push([tile % worldW, Math.floor(tile / worldW)]);
    }
    return path;
  };

  // Prim's minimum spanning tree over door anchors, Manhattan distance.
  const inTree = new Set<number>([0]);
  stamp(anchors[0].x, anchors[0].y);
  while (inTree.size < anchors.length) {
    let best: [number, number, number] | null = null;
    for (const i of inTree) {
      for (let j = 0; j < anchors.length; j++) {
        if (inTree.has(j)) continue;
        const d = Math.abs(anchors[i].x - anchors[j].x) + Math.abs(anchors[i].y - anchors[j].y);
        if (!best || d < best[0]) best = [d, i, j];
      }
    }
    if (!best) break;
    const [, i, j] = best;
    inTree.add(j);
    const path = route(anchors[i], anchors[j]);
    if (path) for (const [x, y] of path) stamp(x, y);
    else stamp(anchors[j].x, anchors[j].y);
  }

  return road;
}
