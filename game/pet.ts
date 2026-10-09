import Phaser from 'phaser';
import { TILE } from '@/game/gridMovement';
import { petTextureKey, type PetId } from '@/lib/rewards';

const FOLLOW_DISTANCE = 20;
const TELEPORT_DISTANCE = 6 * TILE;
const SPEED = 70;
const STEP_MS = 160;

// A pet just chases its owner at a fixed gap; it ignores collision on purpose (it never blocks
// the player and a 16px animal clipping a corner for a frame is not worth pathfinding). Sheets are
// two 16x16 frames: a walk step is alternating them.
export function spawnPet(
  scene: Phaser.Scene,
  player: Phaser.GameObjects.Sprite,
  pet: PetId | null,
  depthOf: (y: number) => number,
): () => void {
  if (!pet || !scene.textures.exists(petTextureKey(pet))) return () => {};

  const sprite = scene.add.sprite(player.x - FOLLOW_DISTANCE, player.y, petTextureKey(pet), 0).setOrigin(0.5, 1);
  let clock = 0;

  const tick = (_time: number, delta: number) => {
    const dx = player.x - sprite.x;
    const dy = player.y - sprite.y;
    const dist = Math.hypot(dx, dy);
    let walking = false;
    if (dist > TELEPORT_DISTANCE) {
      sprite.setPosition(player.x - FOLLOW_DISTANCE, player.y);
    } else if (dist > FOLLOW_DISTANCE) {
      const step = Math.min((SPEED * delta) / 1000, dist - FOLLOW_DISTANCE);
      sprite.x += (dx / dist) * step;
      sprite.y += (dy / dist) * step;
      walking = true;
      if (Math.abs(dx) > 1) sprite.setFlipX(dx < 0);
    }
    clock = walking ? clock + delta : 0;
    sprite.setFrame(walking ? Math.floor(clock / STEP_MS) % 2 : 0);
    sprite.setDepth(depthOf(sprite.y));
    sprite.setVisible(player.visible);
  };

  scene.events.on(Phaser.Scenes.Events.UPDATE, tick);
  const off = () => scene.events.off(Phaser.Scenes.Events.UPDATE, tick);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
  return () => {
    off();
    sprite.destroy();
  };
}
