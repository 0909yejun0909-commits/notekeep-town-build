import type { Region } from '@/lib/types';
import { hash } from '@/lib/types';

const TILE = 16;

export const HOUSE_DATA: Record<number, { w: number; h: number; door: [number, number] }> = {
  0: { w: 6, h: 8, door: [2, 6] },
  1: { w: 9, h: 8, door: [2, 6] },
  2: { w: 9, h: 8, door: [5, 6] },
  3: { w: 7, h: 6, door: [2, 4] },
  4: { w: 12, h: 8, door: [5, 6] },
};

export type TilemapResult = {
  blocked: Set<string>;
  doors: Map<string, string>;
};

export function buildTilemap(
  scene: Phaser.Scene,
  region: Region,
  originGx: number,
  originGy: number,
  width: number,
  height: number,
): TilemapResult {
  const blocked = new Set<string>();
  const doors = new Map<string, string>();

  scene.add
    .tileSprite(originGx * TILE, originGy * TILE, width * TILE, height * TILE, 'terrain-grass')
    .setOrigin(0, 0)
    .setDepth(-1000);

  for (const house of region.houses) {
    const data = HOUSE_DATA[house.variant] ?? HOUSE_DATA[0];
    const gx = originGx + house.gx;
    const gy = originGy + house.gy;

    scene.add
      .image(gx * TILE, gy * TILE, `house-${house.variant}`)
      .setOrigin(0, 0)
      .setDepth((gy + data.h) * TILE);

    for (let y = 0; y < data.h - 1; y++) {
      for (let x = 0; x < data.w; x++) {
        blocked.add(`${gx + x},${gy + y}`);
      }
    }

    const entryX = gx + data.door[0];
    const entryY = gy + data.door[1] + 1;
    blocked.delete(`${entryX},${entryY}`);
    doors.set(`${entryX},${entryY}`, house.id);
  }

  scatterDecoration(scene, region, originGx, originGy, width, height, blocked, doors);

  return { blocked, doors };
}

function scatterDecoration(
  scene: Phaser.Scene,
  region: Region,
  originGx: number,
  originGy: number,
  width: number,
  height: number,
  blocked: Set<string>,
  doors: Map<string, string>,
) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const gx = originGx + x;
      const gy = originGy + y;
      const key = `${gx},${gy}`;
      if (blocked.has(key) || doors.has(key)) continue;

      const flowerRoll = hash(`${region.id}:flower:${gx}:${gy}`);
      if (flowerRoll % 41 === 0) {
        const frame = hash(`${region.id}:flowerframe:${gx}:${gy}`) % 100;
        scene.add
          .image(gx * TILE + TILE / 2, gy * TILE + TILE / 2, 'flowers', frame)
          .setDepth(-500);
        continue;
      }

      const treeRoll = hash(`${region.id}:tree:${gx}:${gy}`);
      if (treeRoll % 97 === 0 && x < width - 1 && y < height - 1) {
        const otherKey = `${gx + 1},${gy}`;
        if (blocked.has(otherKey) || doors.has(otherKey)) continue;

        const species =
          hash(`${region.id}:species:${gx}:${gy}`) % 2 === 0 ? 'tree-oak' : 'tree-spruce';
        const frame = 1 + (hash(`${region.id}:treeframe:${gx}:${gy}`) % 2);

        scene.add
          .image(gx * TILE, (gy + 2) * TILE, species, frame)
          .setOrigin(0, 1)
          .setDepth((gy + 2) * TILE);

        blocked.add(key);
        blocked.add(otherKey);
      }
    }
  }
}
