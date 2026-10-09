import Phaser from 'phaser';
import type { GridMovement } from '@/game/gridMovement';
import { track } from '@/lib/achievementStore';

const STILL_MS = 60_000;

// Wraps the movement's existing onStep, so call it AFTER the scene assigns its own. onStep also
// fires for a turn on the same tile, so only a changed tile counts as a step walked.
export function trackMovement(scene: Phaser.Scene, movement: GridMovement) {
  const inner = movement.onStep;
  let lastMoved = scene.time.now;
  let lastTile = '';
  movement.onStep = (gx, gy, facing) => {
    inner?.(gx, gy, facing);
    const tile = `${gx},${gy}`;
    if (tile === lastTile) return;
    lastTile = tile;
    lastMoved = scene.time.now;
    track('tilesWalked');
  };
  const timer = scene.time.addEvent({
    delay: 1000,
    loop: true,
    callback: () => {
      if (scene.time.now - lastMoved < STILL_MS) return;
      lastMoved = scene.time.now;
      track('stillMinute');
    },
  });
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => timer.remove());
}
