import Phaser from 'phaser';

// One fixed outfit, no customiser. Layers share the base's grid and frame
// indices, so they animate for free — never call .play() on them.
export function dressPlayer(scene: Phaser.Scene, sprite: Phaser.GameObjects.Sprite) {
  const keys = ['player-shoes', 'player-pants', 'player-shirt', 'player-hair'];

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

  scene.events.on(Phaser.Scenes.Events.UPDATE, tick);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off(Phaser.Scenes.Events.UPDATE, tick);
  });
}
