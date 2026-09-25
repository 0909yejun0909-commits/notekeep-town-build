import Phaser from 'phaser';

// Overworld scenery art, installed into public/assets/scenery by scripts/install-assets.sh.
// Frame layouts were read off the Kenmi sheets:
//   grass-N        Grass_Tiles_N, same 16-col layout as grass-edges (Grass_Tiles_1)
//   water-anim     8 frames of the 3x5 water autotile side by side: tile (c, r) of frame f
//                  is r * 24 + f * 3 + c
//   decor          Outdoor_Decor, 9 cols of 16x16 (see DECOR in nature.ts)
//   flower-anim-N  6 sway frames per row, one colour per row, 10 rows
//   lamp-posts     16x48, a 6-frame flicker along each row
const S = 'assets/scenery';

const STRIPS_8 = [
  'lily-1', 'lily-2', 'lily-3', 'lily-4', 'cattail-1', 'cattail-2', 'water-rock-1', 'water-rock-2',
  'grass-anim-1', 'grass-anim-2', 'grass-anim-3',
  'flower-grass-1', 'flower-grass-2', 'flower-grass-3', 'flower-grass-4', 'flower-grass-5', 'flower-grass-6',
] as const;

const fileOf = (key: string) => key.replace(/-/g, '_');

export function preloadScenery(scene: Phaser.Scene) {
  const load = scene.load;
  for (const n of [2, 3, 4]) {
    load.spritesheet(`grass-${n}`, `${S}/grass${n}.png`, { frameWidth: 16, frameHeight: 16 });
    load.image(`fill-grass-${n}`, `${S}/fill_grass${n}.png`);
  }
  load.image('path-decor', 'assets/terrain/path_decor.png');
  load.spritesheet('water-anim', `${S}/water_anim.png`, { frameWidth: 16, frameHeight: 16 });
  load.spritesheet('decor', `${S}/decor.png`, { frameWidth: 16, frameHeight: 16 });
  for (const key of STRIPS_8) {
    load.spritesheet(key, `${S}/${fileOf(key)}.png`, { frameWidth: 16, frameHeight: 16 });
  }
  for (let n = 1; n <= 5; n++) {
    load.spritesheet(`flower-anim-${n}`, `${S}/flower_anim_${n}.png`, { frameWidth: 16, frameHeight: 16 });
  }
  load.spritesheet('tree-big-oak', `${S}/tree_big_oak.png`, { frameWidth: 64, frameHeight: 80 });
  load.spritesheet('tree-big-spruce', `${S}/tree_big_spruce.png`, { frameWidth: 64, frameHeight: 80 });
  load.spritesheet('tree-big-birch', `${S}/tree_big_birch.png`, { frameWidth: 32, frameHeight: 80 });
  load.spritesheet('tree-big-fruit', `${S}/tree_big_fruit.png`, { frameWidth: 32, frameHeight: 64 });
  load.spritesheet('tree-birch', `${S}/tree_birch.png`, { frameWidth: 32, frameHeight: 48 });
  load.spritesheet('tree-fruit', `${S}/tree_fruit.png`, { frameWidth: 32, frameHeight: 64 });
  load.spritesheet('lamp-posts', `${S}/lamp_posts.png`, { frameWidth: 16, frameHeight: 48 });
  load.spritesheet('fountain', `${S}/fountain.png`, { frameWidth: 32, frameHeight: 48 });
  load.spritesheet('bunting', `${S}/bunting.png`, { frameWidth: 64, frameHeight: 32 });
  load.spritesheet('benches', `${S}/benches.png`, { frameWidth: 32, frameHeight: 32 });
  load.spritesheet('barrels', `${S}/barrels.png`, { frameWidth: 16, frameHeight: 32 });
  load.image('well', `${S}/well.png`);
  load.spritesheet('clouds', `${S}/clouds.png`, { frameWidth: 64, frameHeight: 64 });
  load.spritesheet('wind', `${S}/wind.png`, { frameWidth: 16, frameHeight: 16 });
  load.spritesheet('butterfly', `${S}/butterfly.png`, { frameWidth: 8, frameHeight: 8 });
  load.image('leaf-oak', `${S}/leaf_oak.png`);
  load.image('leaf-birch', `${S}/leaf_birch.png`);
}

export function createSceneryAnims(scene: Phaser.Scene) {
  const anims = scene.anims;
  const strip = (key: string, texture: string, start: number, end: number, frameRate: number, repeat = -1) => {
    if (anims.exists(key)) return;
    anims.create({ key, frames: anims.generateFrameNumbers(texture, { start, end }), frameRate, repeat });
  };
  for (const key of STRIPS_8) strip(key, key, 0, 7, key.startsWith('water-rock') ? 5 : 6);
  for (let n = 1; n <= 5; n++) {
    for (let row = 0; row < 10; row++) strip(`flower-anim-${n}-${row}`, `flower-anim-${n}`, row * 6, row * 6 + 5, 5);
  }
  strip('lamp-flicker', 'lamp-posts', 0, 5, 8);
  strip('fountain-flow', 'fountain', 0, 7, 8);
  strip('bunting-wave', 'bunting', 0, 3, 4);
  strip('wind-swirl', 'wind', 0, 13, 14, 0);
  for (let row = 0; row < 8; row++) strip(`butterfly-${row}`, 'butterfly', row * 2, row * 2 + 1, 8);
}
