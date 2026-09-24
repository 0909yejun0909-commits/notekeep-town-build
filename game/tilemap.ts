import type { Region } from '@/lib/types';
import { hash } from '@/lib/types';
import { HOUSE_FOOTPRINT, HOUSE_DOOR, houseTextureKey } from '@/lib/houseCatalog';

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

    const img = scene.add
      .image(gx * TILE, gy * TILE, houseTextureKey(house.variant, house.wallColor, house.roofColor))
      .setOrigin(0, 0)
      .setDepth((gy + h) * TILE);
    houseImages.set(house.id, img);

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

// grass_meadow.png, read off the sheet: 3x3 sand-on-grass block at 80, inner corners at 128.
//   80 81 82      128: grass in SE corner   129: grass in SW corner
//   96 97 98      144: grass in NE corner   145: grass in NW corner
//  112 113 114
function roadFrame(road: Set<string>, x: number, y: number): number {
  const r = (dx: number, dy: number) => road.has(key(x + dx, y + dy));
  const n = r(0, -1), s = r(0, 1), w = r(-1, 0), e = r(1, 0);
  if (!n && !w) return 80;
  if (!n && !e) return 82;
  if (!s && !w) return 112;
  if (!s && !e) return 114;
  if (!n) return 81;
  if (!s) return 113;
  if (!w) return 96;
  if (!e) return 98;
  if (!r(1, 1)) return 128;
  if (!r(-1, 1)) return 129;
  if (!r(1, -1)) return 144;
  if (!r(-1, -1)) return 145;
  return 97;
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
export function buildRoads(
  scene: Phaser.Scene,
  entries: Entry[],
  blocked: Set<string>,
  worldW: number,
  worldH: number,
): Set<string> {
  const road = new Set<string>();
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

  for (const k of road) {
    const [x, y] = k.split(',').map(Number);
    scene.add
      .image(x * TILE, y * TILE, 'grass-edges', roadFrame(road, x, y))
      .setOrigin(0, 0)
      .setDepth(-900);
  }

  return road;
}

export function scatterDecoration(
  scene: Phaser.Scene,
  region: Region,
  originGx: number,
  originGy: number,
  width: number,
  height: number,
  blocked: Set<string>,
  doors: Map<string, string>,
  road: Set<string>,
) {
  const clear = (k: string) => !blocked.has(k) && !doors.has(k) && !road.has(k);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const gx = originGx + x;
      const gy = originGy + y;
      const k = key(gx, gy);
      if (!clear(k)) continue;

      const flowerRoll = hash(`${region.id}:flower:${gx}:${gy}`);
      if (flowerRoll % 23 === 0) {
        const frame = hash(`${region.id}:flowerframe:${gx}:${gy}`) % 100;
        scene.add
          .image(gx * TILE + TILE / 2, gy * TILE + TILE / 2, 'flowers', frame)
          .setDepth(-500);
        continue;
      }

      const treeRoll = hash(`${region.id}:tree:${gx}:${gy}`);
      if (treeRoll % 61 === 0 && x < width - 1 && y < height - 1) {
        const otherKey = key(gx + 1, gy);
        const below = key(gx, gy + 1);
        const belowOther = key(gx + 1, gy + 1);
        if (!clear(otherKey) || !clear(below) || !clear(belowOther)) continue;

        const species =
          hash(`${region.id}:species:${gx}:${gy}`) % 2 === 0 ? 'tree-oak' : 'tree-spruce';
        const frame = 1 + (hash(`${region.id}:treeframe:${gx}:${gy}`) % 2);

        scene.add
          .image(gx * TILE, (gy + 2) * TILE, species, frame)
          .setOrigin(0, 1)
          .setDepth((gy + 2) * TILE);

        blocked.add(k);
        blocked.add(otherKey);
        blocked.add(below);
        blocked.add(belowOther);
      }
    }
  }
}
