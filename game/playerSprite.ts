import Phaser from 'phaser';
import type { Appearance } from '@/lib/types';
import {
  DEFAULT_APPEARANCE,
  hairTextureKey,
  pantsTextureKey,
  shirtTextureKey,
  shoesTextureKey,
} from '@/lib/characterCatalog';

// Layers share the base's grid and frame indices, so they animate for free — never call
// .play() on them. `appearance` defaults to the original fixed outfit for callers that don't
// track a per-avatar look (e.g. remote players in game/remotePlayers.ts).
export function dressPlayer(
  scene: Phaser.Scene,
  sprite: Phaser.GameObjects.Sprite,
  appearance: Appearance = DEFAULT_APPEARANCE,
): () => void {
  const keys = [
    shoesTextureKey(appearance.shoesColor),
    pantsTextureKey(appearance.pantsColor),
    shirtTextureKey(appearance.shirtColor),
    hairTextureKey(appearance.hairStyle, appearance.hairColor),
  ];

  const layers = keys.map((key) => {
    const layer = scene.add.sprite(sprite.x, sprite.y, key, sprite.frame.name);
    layer.setOrigin(sprite.originX, sprite.originY);
    return layer;
  });

  // Position, facing, frame AND depth are copied every frame. The scene
  // re-sorts the base sprite's depth by its y each tick; if the layers kept
  // their spawn-time depth the base would draw over its own clothes as soon
  // as the player walked south.
  const tick = () => {
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      layer.x = sprite.x;
      layer.y = sprite.y;
      layer.flipX = sprite.flipX;
      layer.setFrame(sprite.frame.name);
      layer.setDepth(sprite.depth + (i + 1) * 0.01);
    }
  };
  tick();

  // POST_UPDATE, not UPDATE: UPDATE fires before the scene's own update() sets
  // the base sprite's depth for this frame (depth = y, so it changes every frame
  // while walking). Syncing on UPDATE copies last frame's stale, smaller depth
  // while walking down (y increasing) — base ends up drawn in front of its own
  // clothes for that one direction only.
  scene.events.on(Phaser.Scenes.Events.POST_UPDATE, tick);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off(Phaser.Scenes.Events.POST_UPDATE, tick);
  });

  // For avatars that leave mid-scene; everything else is torn down with the scene.
  return () => {
    scene.events.off(Phaser.Scenes.Events.POST_UPDATE, tick);
    layers.forEach((layer) => layer.destroy());
  };
}
