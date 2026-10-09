import Phaser from 'phaser';
import type { Appearance } from '@/lib/types';
import {
  DEFAULT_APPEARANCE,
  hairTextureKey,
  pantsTextureKey,
  shirtTextureKey,
  shoesTextureKey,
} from '@/lib/characterCatalog';
import { skinTextureKey, type SkinId } from '@/lib/rewards';

// Bottom to top, drawn over the 'player' base texture.
export function outfitTextureKeys(appearance: Appearance): string[] {
  return [
    shoesTextureKey(appearance.shoesColor),
    pantsTextureKey(appearance.pantsColor),
    shirtTextureKey(appearance.shirtColor),
    hairTextureKey(appearance.hairStyle, appearance.hairColor),
  ];
}

// A skin is a whole 16x16 character sheet that replaces the base + layers. Columns are the
// facings (down, up, left, right) and rows 0-3 the walk cycle, so the base sprite's animation
// state maps straight onto a skin frame: base walk frames (6) onto 4 rows.
const BASE_WALK_FRAMES = 6;
const SKIN_WALK_ROWS = 4;
// The base sprite's origin sits a little above its feet; skins are drawn feet-aligned to it.
const SKIN_FEET_OFFSET = 2;

function skinFrame(sprite: Phaser.GameObjects.Sprite): number {
  const [mode, dir] = (sprite.anims.currentAnim?.key ?? 'idle-down').split('-');
  const col = dir === 'right' ? (sprite.flipX ? 2 : 3) : dir === 'up' ? 1 : 0;
  if (mode !== 'walk') return col;
  const index = sprite.anims.currentFrame?.index ?? 1;
  const row = Math.min(SKIN_WALK_ROWS - 1, Math.floor(((index - 1) / BASE_WALK_FRAMES) * SKIN_WALK_ROWS));
  return row * 4 + col;
}

function wearSkin(scene: Phaser.Scene, sprite: Phaser.GameObjects.Sprite, skin: SkinId): () => void {
  const view = scene.add.sprite(sprite.x, sprite.y, skinTextureKey(skin), 0).setOrigin(0.5, 15 / 16);
  sprite.setAlpha(0);
  const tick = () => {
    view.x = sprite.x;
    view.y = sprite.y + SKIN_FEET_OFFSET;
    view.visible = sprite.visible;
    view.setFrame(skinFrame(sprite));
    view.setDepth(sprite.depth + 0.01);
  };
  tick();
  scene.events.on(Phaser.Scenes.Events.POST_UPDATE, tick);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.POST_UPDATE, tick));
  return () => {
    scene.events.off(Phaser.Scenes.Events.POST_UPDATE, tick);
    view.destroy();
    sprite.setAlpha(1);
  };
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
  if (skin && scene.textures.exists(skinTextureKey(skin))) return wearSkin(scene, sprite, skin);
  const layers = outfitTextureKeys(appearance).map((key) => {
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
