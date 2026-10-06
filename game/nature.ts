import Phaser from 'phaser';
import type { BiomeId } from '@/lib/types';
import { fbm, mix, pick, rand01 } from '@/game/noise';
import { areaAt, isFree, key, nearHouse, ringDistance, TILE, type WorldGrid } from '@/game/worldGrid';
import { desertTree, BARREL_CACTUS, DESERT_DECOR, desertDecorFrame } from '@/game/desertArt';
import { SNOWMAN, WINTER_DECOR, winterDecorFrame } from '@/game/winterArt';

// (ox, oy) is the pixel in the frame where the trunk meets the ground. Wide trees have a
// two-tile trunk and are anchored on the line between their two trunk tiles.
type TreeSpec = { key: string; fw: number; fh: number; ox: number; oy: number; wide: boolean };

const TREES = {
  bigOak: { key: 'tree-big-oak', fw: 64, fh: 80, ox: 32, oy: 66, wide: true },
  bigSpruce: { key: 'tree-big-spruce', fw: 64, fh: 80, ox: 32, oy: 66, wide: true },
  bigBirch: { key: 'tree-big-birch', fw: 32, fh: 80, ox: 16, oy: 64, wide: false },
  bigFruit: { key: 'tree-big-fruit', fw: 32, fh: 64, ox: 16, oy: 50, wide: false },
  oak: { key: 'tree-oak', fw: 32, fh: 48, ox: 16, oy: 34, wide: false },
  spruce: { key: 'tree-spruce', fw: 32, fh: 48, ox: 16, oy: 34, wide: false },
  birch: { key: 'tree-birch', fw: 32, fh: 48, ox: 16, oy: 34, wide: false },
  fruit: { key: 'tree-fruit', fw: 32, fh: 64, ox: 16, oy: 50, wide: false },
} satisfies Record<string, TreeSpec>;

type Mix = [TreeSpec, number][];

const SPECIES: Record<BiomeId, Mix> = {
  meadow: [[TREES.bigOak, 35], [TREES.oak, 25], [TREES.fruit, 20], [TREES.bigFruit, 20]],
  forest: [[TREES.bigSpruce, 35], [TREES.spruce, 30], [TREES.bigOak, 20], [TREES.oak, 15]],
  desert: [[TREES.bigBirch, 40], [TREES.birch, 30], [TREES.bigOak, 15], [TREES.oak, 15]],
  volcano: [[TREES.bigBirch, 30], [TREES.birch, 20], [TREES.bigSpruce, 30], [TREES.spruce, 20]],
  snow: [[TREES.bigSpruce, 45], [TREES.spruce, 35], [TREES.bigBirch, 20]],
};
const BORDER_MIX: Mix = [[TREES.bigOak, 40], [TREES.bigSpruce, 35], [TREES.oak, 10], [TREES.spruce, 10], [TREES.bigBirch, 5]];

// Outdoor_Decor frames (9 columns of 16x16).
const DECOR = {
  bushes: [50, 84, 86, 87, 88],
  rocks: [45, 46, 48, 58, 60, 61, 85],
  stumps: [55, 83],
  mushrooms: [15, 16, 17, 25, 26, 27, 28, 29, 36, 37, 38, 47, 56],
  logs: [63, 65, 67, 72, 74, 76],
  clusters: [0, 1, 2, 3, 4, 5, 9, 10, 11, 12, 13, 14, 21, 22, 23],
};

function choose(mixList: Mix, roll: number): TreeSpec {
  const total = mixList.reduce((s, [, w]) => s + w, 0);
  let r = roll * total;
  for (const [spec, w] of mixList) {
    if ((r -= w) < 0) return spec;
  }
  return mixList[0][0];
}

function addTree(scene: Phaser.Scene, g: WorldGrid, spec: TreeSpec, gx: number, gy: number, border = false) {
  const x = spec.wide ? (gx + 1) * TILE : gx * TILE + TILE / 2;
  const y = (gy + 1) * TILE - 2;
  // Desert plants are drawn at the tree's frame size and anchor, so they stand on the same tiles.
  const desert = g.biome === 'desert' ? desertTree(scene, spec.key, rand01(g.seed ^ 0xde, gx, gy), border) : null;
  (desert ? scene.add.image(x, y, desert) : scene.add.image(x, y, g.skin(spec.key), 1))
    .setOrigin(spec.ox / spec.fw, spec.oy / spec.fh)
    .setDepth((gy + 1) * TILE - 1);
}

export function inRing(g: WorldGrid, x: number, y: number) {
  return x < g.border || y < g.border || x >= g.w - g.border || y >= g.h - g.border;
}

// A wall of overlapping trees around the whole town, so the map ends in forest instead of
// flat grass. The ring is solid; only its inner edge gets bushes.
export function buildForestBorder(scene: Phaser.Scene, g: WorldGrid) {
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      if (inRing(g, x, y)) g.blocked.add(key(x, y));
    }
  }

  const seed = g.seed ^ 0xb0;
  for (let j = -1; j * 2 < g.h + 2; j++) {
    for (let i = -1; i * 3 < g.w + 2; i++) {
      const x = i * 3 + (j % 2 === 0 ? 0 : 1) + (mix(seed, i, j) % 2);
      const y = j * 2 + (mix(seed ^ 1, i, j) % 2);
      if (x < 0 || y < 0 || x >= g.w - 1 || y >= g.h || !inRing(g, x, y) || !inRing(g, x + 1, y)) continue;
      addTree(scene, g, choose(BORDER_MIX, rand01(seed ^ 2, i, j)), x, y, true);
    }
  }

  for (let y = g.border - 1; y <= g.h - g.border; y++) {
    for (let x = g.border - 1; x <= g.w - g.border; x++) {
      if (!inRing(g, x, y)) continue;
      const edge = x === g.border - 1 || y === g.border - 1 || x === g.w - g.border || y === g.h - g.border;
      if (!edge || rand01(seed ^ 3, x, y) > 0.45) continue;
      scene.add
        .image(x * TILE + TILE / 2, (y + 1) * TILE, g.skin('decor'), pick(DECOR.bushes, seed ^ 4, x, y))
        .setOrigin(0.5, 1)
        .setDepth((y + 1) * TILE - 1);
    }
  }
}

// Trees gather in noise-shaped groves with a few loners in the open. Species follow the
// region's biome. Only trunks block, so you can walk under canopies.
export function buildGroves(scene: Phaser.Scene, g: WorldGrid) {
  const seed = g.seed ^ 0xc1;
  const crowd = new Set<string>();
  const clearAround = (x: number, y: number, r: number, check: (k: string) => boolean) => {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) if (check(key(x + dx, y + dy))) return false;
    }
    return true;
  };

  for (let y = g.border; y < g.h - g.border; y++) {
    for (let x = g.border; x < g.w - g.border; x++) {
      const density = fbm(seed, x, y, 8);
      const area = areaAt(g, x, y);
      let p = density > 0.6 ? 0.24 : density > 0.5 ? 0.035 : 0.006;
      if (!area) p *= 1.6;
      // Thicken the woods just inside the ring so the forest edge frays into the meadow.
      const edge = ringDistance(g, x, y);
      if (edge < 3) p = Math.max(p, [0.3, 0.16, 0.07][edge]);
      if (rand01(seed ^ 1, x, y) >= p) continue;

      const biome: BiomeId = area?.region.biome ?? (fbm(seed ^ 2, x, y, 20) > 0.5 ? 'forest' : 'meadow');
      const spec = choose(SPECIES[biome], rand01(seed ^ 3, x, y));
      const cells = spec.wide ? [[x, y], [x + 1, y]] : [[x, y]];
      if (!cells.every(([cx, cy]) => isFree(g, cx, cy) && !crowd.has(key(cx, cy)))) continue;
      if (nearHouse(g, x, y, 2, 1, 3)) continue;
      if (!clearAround(x, y, 1, (k) => g.water.has(k) || g.keepClear.has(k))) continue;
      if (!clearAround(x, y, 2, (k) => g.plaza.has(k))) continue;
      if (!clearAround(x, y, 0, (k) => g.road.has(k))) continue;

      addTree(scene, g, spec, x, y);
      for (const [cx, cy] of cells) {
        g.blocked.add(key(cx, cy));
        g.used.add(key(cx, cy));
      }
      const r = spec.wide ? 2 : 1;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -r; dx <= r + (spec.wide ? 1 : 0); dx++) crowd.add(key(x + dx, y + dy));
      }
    }
  }
}

// Bushes, rocks, stumps, logs and mushrooms around grove edges; flower beds and swaying grass
// in the open. Flowers and grass don't block.
export function buildGroundCover(scene: Phaser.Scene, g: WorldGrid) {
  const seed = g.seed ^ 0xd2;
  const decor = g.skin('decor');
  const solid = (x: number, y: number, frame: number, wide = false) => {
    scene.add.image(x * TILE, (y + 1) * TILE, decor, frame).setOrigin(0, 1).setDepth((y + 1) * TILE - 1);
    if (wide) scene.add.image((x + 1) * TILE, (y + 1) * TILE, decor, frame + 1).setOrigin(0, 1).setDepth((y + 1) * TILE - 1);
    for (const cx of wide ? [x, x + 1] : [x]) {
      g.blocked.add(key(cx, y));
      g.used.add(key(cx, y));
    }
  };
  // A bush's tile, blocked the same in every biome, holding a snowman or barrel cactus instead.
  const standIn = (x: number, y: number, texture: string) => {
    scene.add.image(x * TILE + TILE / 2, (y + 1) * TILE, texture).setOrigin(0.5, 1).setDepth((y + 1) * TILE - 1);
    g.blocked.add(key(x, y));
    g.used.add(key(x, y));
  };
  // Non-blocking scatter is free to differ per biome: snow drifts, or desert pebbles and blooms.
  const flat = (x: number, y: number, texture: string, frame: number) => {
    const roll = mix(seed ^ 15, x, y);
    const [tex, f] =
      g.biome === 'snow' ? [WINTER_DECOR, winterDecorFrame(roll)]
      : g.biome === 'desert' && texture === 'decor' ? [DESERT_DECOR, desertDecorFrame(roll)]
      : [g.skin(texture), frame];
    scene.add.image(x * TILE + TILE / 2, y * TILE + TILE / 2, tex, f).setDepth(-600);
    g.used.add(key(x, y));
  };
  const sway = (x: number, y: number, texture: string, anim: string, frames: number) => {
    // Nothing blooms in the snow: flowers become drifts, flowering grass plain frosted grass.
    if (g.biome === 'snow' && texture.startsWith('flower-anim')) return flat(x, y, texture, 0);
    if (g.biome === 'snow' && texture.startsWith('flower-grass')) {
      texture = anim = `grass-anim-${1 + (mix(seed ^ 16, x, y) % 3)}`;
    }
    scene.add
      .sprite(x * TILE + TILE / 2, y * TILE + TILE / 2, g.skin(texture))
      .setDepth(-590)
      .play({ key: g.skinAnim(anim), startFrame: mix(seed ^ 9, x, y) % frames });
    g.used.add(key(x, y));
  };

  for (let y = g.border; y < g.h - g.border; y++) {
    for (let x = g.border; x < g.w - g.border; x++) {
      if (!isFree(g, x, y)) continue;
      const roll = rand01(seed, x, y);
      const grove = fbm(g.seed ^ 0xc1, x, y, 8);
      const nearDoor = nearHouse(g, x, y, 1, 0, 2);

      if (!nearDoor && grove > 0.5 && grove < 0.68 && roll < 0.07) {
        const kind = mix(seed ^ 1, x, y) % 10;
        const swap = g.biome !== 'forest' && mix(seed ^ 17, x, y) % 3 === 0;
        if (kind < 4 && swap) standIn(x, y, g.biome === 'snow' ? SNOWMAN : BARREL_CACTUS);
        else if (kind < 4) solid(x, y, pick(DECOR.bushes, seed ^ 2, x, y));
        else if (kind < 6) solid(x, y, pick(DECOR.rocks, seed ^ 3, x, y));
        else if (kind < 7) solid(x, y, pick(DECOR.stumps, seed ^ 4, x, y));
        else if (kind < 8 && isFree(g, x + 1, y)) solid(x, y, pick(DECOR.logs, seed ^ 5, x, y), true);
        else flat(x, y, 'decor', pick(DECOR.mushrooms, seed ^ 6, x, y));
        continue;
      }

      const bed = fbm(g.seed ^ 0x99, x, y, 7);
      if (bed > 0.63) {
        if (roll < 0.34) {
          flat(x, y, 'decor', pick(DECOR.clusters, seed ^ 7, x, y));
        } else if (roll < 0.5) {
          const n = 1 + (mix(seed ^ 8, x >> 3, y >> 3) % 5);
          const row = mix(seed ^ 10, x >> 2, y >> 2) % 10;
          sway(x, y, `flower-anim-${n}`, `flower-anim-${n}-${row}`, 6);
        }
        continue;
      }

      if (roll < 0.012) flat(x, y, 'decor', pick(DECOR.clusters, seed ^ 11, x, y));
      else if (roll < 0.018) flat(x, y, 'flowers', (mix(seed ^ 12, x, y) % 10) * 10 + (mix(seed ^ 13, x, y) % 5));
      else if (roll < 0.05) {
        const anims = ['grass-anim-1', 'grass-anim-2', 'grass-anim-3', 'flower-grass-1', 'flower-grass-2', 'flower-grass-3', 'flower-grass-4', 'flower-grass-5', 'flower-grass-6'];
        const anim = pick(anims, seed ^ 14, x, y);
        sway(x, y, anim, anim, 8);
      }
    }
  }
}
