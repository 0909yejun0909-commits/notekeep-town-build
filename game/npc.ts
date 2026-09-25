import Phaser from 'phaser';
import type { Region } from '@/lib/types';
import { bus } from './bus';
import { tileToWorld } from './gridMovement';

// Hardcoded dialogue — no AI, no network call.
const DIALOGUE: Record<string, string> = {
  farmer_bob: "Heard you've been buried in your notes again.",
  bartender_katy: 'The usual? Or are we celebrating something today?',
};

const WINTER_DIALOGUE: Record<string, string> = {
  farmer_bob: 'Fields are asleep under the snow. Good season for catching up on your notes.',
  bartender_katy: "Hot cocoa's on the house tonight. Come warm up by the fire!",
};

const DESERT_DIALOGUE: Record<string, string> = {
  farmer_bob: "Hot one today. Keep your notes in the shade or the ink'll run.",
  bartender_katy: 'Cactus lemonade, fresh from the oasis. Best cure for a long day of reading.',
};

const NPC_IDS = ['farmer_bob', 'bartender_katy'] as const;
const TILE = 16;
const TALK_RANGE = TILE * 1.5;
type Dir = 'down' | 'right' | 'up' | 'left';
const DIRS: Dir[] = ['down', 'right', 'up', 'left'];
const DELTA: Record<Dir, [number, number]> = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };

/** The rectangle of world tiles a region occupies. NPCs spawn inside it and never leave it. */
export type NpcSpawnArea = { originGx: number; originGy: number; width: number; height: number };

type LiveNpc = { npcId: string; sprite: Phaser.GameObjects.Sprite; gx: number; gy: number };

// One list of live NPCs per scene, so a single Space handler can pick the nearest one.
// Per-NPC listeners each calling JustDown() on the shared Space key meant the first
// listener consumed the press and no other NPC could ever talk.
const liveNpcs = new WeakMap<Phaser.Scene, LiveNpc[]>();

function ensureNpcAnimations(scene: Phaser.Scene, npcId: string) {
  if (scene.anims.exists(`${npcId}-idle-down`)) return;
  const rows: [string, number][] = [
    ['idle-down', 0], ['idle-right', 1], ['idle-up', 2],
    ['walk-down', 3], ['walk-right', 4], ['walk-up', 5],
  ];
  for (const [name, row] of rows) {
    scene.anims.create({
      key: `${npcId}-${name}`,
      frames: scene.anims.generateFrameNumbers(npcId, { start: row * 6, end: row * 6 + 5 }),
      frameRate: 10,
      repeat: -1,
    });
  }
}

// Read the registry at call time, not spawn time: Overworld publishes isWalkable
// in create() and the order of those two calls must not matter.
function isWalkable(scene: Phaser.Scene, gx: number, gy: number): boolean {
  const fn = scene.game.registry.get('isWalkable') as ((gx: number, gy: number) => boolean) | undefined;
  return fn ? fn(gx, gy) : true;
}

function ensureTalkHandler(scene: Phaser.Scene): LiveNpc[] {
  const existing = liveNpcs.get(scene);
  if (existing) return existing;

  const list: LiveNpc[] = [];
  liveNpcs.set(scene, list);

  const keyboard = scene.input.keyboard;
  const onSpace = () => {
    const player = scene.game.registry.get('player') as Phaser.GameObjects.Sprite | undefined;
    if (!player) return;
    let nearest: LiveNpc | null = null;
    let best = TALK_RANGE;
    for (const npc of list) {
      const d = Phaser.Math.Distance.Between(player.x, player.y, npc.sprite.x, npc.sprite.y);
      if (d < best) {
        best = d;
        nearest = npc;
      }
    }
    if (!nearest) return;
    const biome = scene.game.registry.get('townBiome');
    const lines = biome === 'snow' ? WINTER_DIALOGUE : biome === 'desert' ? DESERT_DIALOGUE : DIALOGUE;
    bus.emit('talk-npc', { npcId: nearest.npcId, line: lines[nearest.npcId] });
  };
  keyboard?.on('keydown-SPACE', onSpace);

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    keyboard?.off('keydown-SPACE', onSpace);
    liveNpcs.delete(scene);
  });
  return list;
}

function inArea(area: NpcSpawnArea, gx: number, gy: number): boolean {
  return (
    gx >= area.originGx && gx < area.originGx + area.width &&
    gy >= area.originGy && gy < area.originGy + area.height
  );
}

/** First free, walkable tile in the area, scanning row-major from a preferred tile. */
function findSpawnTile(
  scene: Phaser.Scene, area: NpcSpawnArea, taken: LiveNpc[], preferGx: number, preferGy: number,
): { gx: number; gy: number } | null {
  const total = area.width * area.height;
  const startIdx =
    (Phaser.Math.Clamp(preferGy, area.originGy, area.originGy + area.height - 1) - area.originGy) * area.width +
    (Phaser.Math.Clamp(preferGx, area.originGx, area.originGx + area.width - 1) - area.originGx);
  for (let n = 0; n < total; n++) {
    const idx = (startIdx + n) % total;
    const gx = area.originGx + (idx % area.width);
    const gy = area.originGy + Math.floor(idx / area.width);
    if (!isWalkable(scene, gx, gy)) continue;
    if (taken.some((t) => t.gx === gx && t.gy === gy)) continue;
    return { gx, gy };
  }
  return null;
}

/**
 * Spawn the demo pair inside `area` (the region's tile rectangle in world grid coordinates).
 * Call after OverworldScene has published `isWalkable` to the registry so NPCs neither spawn
 * inside a house nor walk through one. Without an area, the region is assumed to start at 0,0.
 */
export function spawnNpcs(scene: Phaser.Scene, _region: Region, area?: NpcSpawnArea) {
  const rect: NpcSpawnArea = area ?? { originGx: 0, originGy: 0, width: 10, height: 10 };
  const list = ensureTalkHandler(scene);

  NPC_IDS.forEach((npcId, i) => {
    ensureNpcAnimations(scene, npcId);

    const tile = findSpawnTile(scene, rect, list, rect.originGx + 3 + i * 3, rect.originGy + 3);
    if (!tile) return; // region is solid; nowhere to stand

    const spawnPos = tileToWorld(tile.gx, tile.gy);
    const sprite = scene.add.sprite(spawnPos.x, spawnPos.y, npcId);
    sprite.setOrigin(0.5, 0.64);
    sprite.setDepth(sprite.y);
    sprite.play(`${npcId}-idle-down`);

    const npc: LiveNpc = { npcId, sprite, gx: tile.gx, gy: tile.gy };
    list.push(npc);

    let moving = false;

    scene.time.addEvent({
      delay: 1500,
      loop: true,
      callback: () => {
        if (moving) return;
        const dir = DIRS[Phaser.Math.Between(0, 3)];
        const [dx, dy] = DELTA[dir];
        const nx = npc.gx + dx;
        const ny = npc.gy + dy;
        if (!inArea(rect, nx, ny) || !isWalkable(scene, nx, ny)) return;
        if (list.some((o) => o !== npc && o.gx === nx && o.gy === ny)) return;

        moving = true;
        npc.gx = nx; // claim the tile immediately so two NPCs never target the same one
        npc.gy = ny;
        sprite.flipX = dir === 'left';
        const animDir = dir === 'left' ? 'right' : dir;
        sprite.play(`${npcId}-walk-${animDir}`);

        const target = tileToWorld(nx, ny);
        scene.tweens.add({
          targets: sprite,
          x: target.x,
          y: target.y,
          duration: 400,
          onUpdate: () => sprite.setDepth(sprite.y),
          onComplete: () => {
            moving = false;
            sprite.setDepth(sprite.y);
            sprite.play(`${npcId}-idle-${animDir}`);
          },
        });
      },
    });
  });
}
