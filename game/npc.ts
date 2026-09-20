import Phaser from 'phaser';
import type { Region } from '@/lib/types';
import { bus } from './bus';

// Hardcoded dialogue — no AI, no network call.
const DIALOGUE: Record<string, string> = {
  farmer_bob: "Heard you've been buried in your notes again.",
  bartender_katy: 'The usual? Or are we celebrating something today?',
};

const NPC_IDS = ['farmer_bob', 'bartender_katy'] as const;
const TILE = 16;
type Dir = 'down' | 'right' | 'up' | 'left';
const DIRS: Dir[] = ['down', 'right', 'up', 'left'];

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

export function spawnNpcs(scene: Phaser.Scene, region: Region) {
  const isWalkable: (gx: number, gy: number) => boolean =
    scene.game.registry.get('isWalkable') ?? (() => true);

  NPC_IDS.forEach((npcId, i) => {
    ensureNpcAnimations(scene, npcId);

    let gx = 3 + i * 3;
    let gy = 3;
    const sprite = scene.add.sprite(gx * TILE + TILE / 2, gy * TILE + TILE / 2, npcId);
    sprite.setOrigin(0.5, 0.64);
    sprite.play(`${npcId}-idle-down`);

    let moving = false;

    scene.time.addEvent({
      delay: 1500,
      loop: true,
      callback: () => {
        if (moving) return;
        const dir = DIRS[Phaser.Math.Between(0, 3)];
        const [dx, dy] =
          dir === 'down' ? [0, 1] : dir === 'up' ? [0, -1] : dir === 'left' ? [-1, 0] : [1, 0];
        const nx = gx + dx;
        const ny = gy + dy;
        if (!isWalkable(nx, ny)) return;

        moving = true;
        sprite.flipX = dir === 'left';
        const animDir = dir === 'left' ? 'right' : dir;
        sprite.play(`${npcId}-walk-${animDir}`);

        scene.tweens.add({
          targets: sprite,
          x: nx * TILE + TILE / 2,
          y: ny * TILE + TILE / 2,
          duration: 400,
          onComplete: () => {
            gx = nx;
            gy = ny;
            moving = false;
            sprite.play(`${npcId}-idle-${animDir}`);
          },
        });
      },
    });

    const spaceKey = scene.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    scene.events.on('update', () => {
      if (!spaceKey || !Phaser.Input.Keyboard.JustDown(spaceKey)) return;
      const player: Phaser.GameObjects.Sprite | undefined = scene.game.registry.get('player');
      if (!player) return;
      const dist = Phaser.Math.Distance.Between(player.x, player.y, sprite.x, sprite.y);
      if (dist < TILE * 1.5) {
        bus.emit('talk-npc', { npcId, line: DIALOGUE[npcId] });
      }
    });
  });
}
