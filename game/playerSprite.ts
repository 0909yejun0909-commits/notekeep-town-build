import Phaser from 'phaser';
import type { Appearance } from '@/lib/types';
import {
  DEFAULT_APPEARANCE,
  hairTextureKey,
  pantsTextureKey,
  shirtTextureKey,
  shoesTextureKey,
} from '@/lib/characterCatalog';
import { outfitLayerKeys } from '@/lib/outfitLayers';
import type { SkinId } from '@/lib/rewards';

// Bottom to top, drawn over the 'player' base texture.
export function outfitTextureKeys(appearance: Appearance): string[] {
  return [
    shoesTextureKey(appearance.shoesColor),
    pantsTextureKey(appearance.pantsColor),
    shirtTextureKey(appearance.shirtColor),
    hairTextureKey(appearance.hairStyle, appearance.hairColor),
  ];
}

// What gets drawn over the base: an equipped outfit's stack, or the picked clothes. If any texture
// of an outfit failed to load (reward art not installed) the picked look is used instead, rather
// than drawing a half-dressed player.
export function layerKeys(scene: Phaser.Scene, appearance: Appearance, skin: SkinId | null): string[] {
  if (skin) {
    const keys = outfitLayerKeys(skin, appearance);
    if (keys.length > 0 && keys.every((key) => scene.textures.exists(key))) return keys;
  }
  return outfitTextureKeys(appearance);
}

// Layers share the base's grid and frame indices, so they animate for free — never call
// .play() on them. `appearance` defaults to the original fixed outfit for callers that don't
// track a per-avatar look (e.g. remote players in game/remotePlayers.ts).
export function dressPlayer(
  scene: Phaser.Scene,
  sprite: Phaser.GameObjects.Sprite,
  appearance: Appearance = DEFAULT_APPEARANCE,
  skin: SkinId | null = null,
): () => void {
  const layers = layerKeys(scene, appearance, skin).map((key) => {
    const layer = scene.add.sprite(sprite.x, sprite.y, key, sprite.frame.name);
    layer.setOrigin(sprite.originX, sprite.originY);
    return layer;
  });

  // Position, facing, frame, visibility AND depth are copied every frame. The scene
  // re-sorts the base sprite's depth by its y each tick; if the layers kept
  // their spawn-time depth the base would draw over its own clothes as soon
  // as the player walked south.
  const tick = () => {
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      layer.x = sprite.x;
      layer.y = sprite.y;
      layer.flipX = sprite.flipX;
      layer.visible = sprite.visible;
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
