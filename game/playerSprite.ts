import Phaser from 'phaser';

// One fixed outfit, no customiser. Layers share the base's grid and frame
// indices, so they animate for free — never call .play() on them.
export function dressPlayer(scene: Phaser.Scene, sprite: Phaser.GameObjects.Sprite) {
  const keys = ['player-shoes', 'player-pants', 'player-shirt', 'player-hair'];

  const layers = keys.map((key, i) => {
    const layer = scene.add.sprite(sprite.x, sprite.y, key, sprite.frame.name);
    layer.setOrigin(sprite.originX, sprite.originY);
    layer.setDepth(sprite.depth + (i + 1) * 0.01);
    return layer;
  });

  // Scenes that y-sort the player change its depth every frame; the layers must track it
  // or the base body renders over its own clothes as soon as the player walks down.
  const follow = () => {
    if (!sprite.active) return;
    layers.forEach((layer, i) => {
      layer.x = sprite.x;
      layer.y = sprite.y;
      layer.flipX = sprite.flipX;
      layer.setFrame(sprite.frame.name);
      layer.setDepth(sprite.depth + (i + 1) * 0.01);
    });
  };

  scene.events.on('update', follow);
  scene.events.once('shutdown', () => scene.events.off('update', follow));
}
