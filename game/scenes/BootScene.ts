import Phaser from 'phaser';
import type { FurnitureId } from '@/lib/types';
import { CATALOG } from '@/lib/catalog';

// Pixel rects from the asset manifest, added as a frame named by FurnitureId:
//   this.add.image(px, py, 'furn_bed', 'bed')
const FURNITURE_RECT: Record<FurnitureId, [number, number, number, number]> = {
  // docs/ASSETS.md's [72,8,32,48] included 16px of transparent padding above the
  // sprite (verified pixel-by-pixel), rendering a visible gap above the desk —
  // this rect is the tight crop, footprint unchanged at 2x3.
  desk: [72, 24, 32, 32],
  shelf: [16, 0, 32, 32],
  bed: [0, 0, 32, 32],
  chest: [0, 0, 16, 16],
  plant: [32, 0, 16, 32],
  painting: [48, 32, 16, 16],
  lamp: [0, 0, 16, 32],
  rug: [0, 0, 48, 48],
};

// Colour/species variants beyond the base 8 FurnitureId frames above — rects come
// straight from docs/ASSETS.md's documented deltas, never guessed.
const VARIANT_RECT: Record<string, [number, number, number, number]> = {
  bed_blue: [0, 32, 32, 32],
  bed_green: [0, 64, 32, 32],
  bed_pink: [0, 96, 32, 32],
  bed_yellow: [0, 128, 32, 32],
  bed_red: [0, 160, 32, 32],
  rug_cyan: [0, 80, 48, 48],
  lamp_blue: [32, 0, 16, 32],
  lamp_green: [64, 0, 16, 32],
  lamp_pink: [96, 0, 16, 32],
  lamp_yellow: [128, 0, 16, 32],
  plant_a: [0, 0, 16, 32],
  plant_b: [16, 0, 16, 32],
  plant_c: [48, 0, 16, 32],
  plant_d: [64, 0, 16, 32],
  plant_e: [80, 0, 16, 32],
  plant_f: [96, 0, 16, 32],
};

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    this.load.spritesheet('player', 'assets/character/base.png', { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('farmer_bob', 'assets/npc/farmer_bob.png', { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('bartender_katy', 'assets/npc/bartender_katy.png', { frameWidth: 64, frameHeight: 64 });

    this.load.image('terrain-grass', 'assets/terrain/fill_grass_meadow.png');
    this.load.image('terrain-path', 'assets/terrain/fill_path.png');
    this.load.image('terrain-water', 'assets/terrain/fill_water.png');

    for (let n = 0; n <= 4; n++) {
      this.load.image(`house-${n}`, `assets/buildings/house_${n}.png`);
    }

    this.load.spritesheet('interior-floor', 'assets/interior/floor.png', { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('interior-walls', 'assets/interior/walls.png', { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('interior-doors', 'assets/interior/doors.png', { frameWidth: 16, frameHeight: 16 });

    this.load.image('furn_desk', 'assets/furniture/tables.png');
    this.load.image('furn_shelf', 'assets/furniture/bookshelves.png');
    this.load.image('furn_bed', 'assets/furniture/beds.png');
    this.load.image('furn_chest', 'assets/furniture/chest.png');
    this.load.image('furn_plant', 'assets/furniture/plants.png');
    this.load.image('furn_lamp', 'assets/furniture/lamps.png');
    this.load.image('furn_painting', 'assets/furniture/decor.png');
    this.load.image('furn_rug', 'assets/furniture/carpets.png');

    this.load.spritesheet('tree-oak', 'assets/terrain/tree_oak.png', { frameWidth: 32, frameHeight: 48 });
    this.load.spritesheet('tree-spruce', 'assets/terrain/tree_spruce.png', { frameWidth: 32, frameHeight: 48 });
    this.load.spritesheet('flowers', 'assets/terrain/flowers.png', { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('grass-edges', 'assets/terrain/grass_meadow.png', { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('water-edges', 'assets/terrain/water.png', { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('cobble-edges', 'assets/terrain/cobble.png', { frameWidth: 16, frameHeight: 16 });

    this.load.spritesheet('player-shoes', 'assets/character/shoes/black.png', { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('player-pants', 'assets/character/pants/brown.png', { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('player-shirt', 'assets/character/shirt/red.png', { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('player-hair', 'assets/character/hair/1_brown.png', { frameWidth: 64, frameHeight: 64 });

    this.load.image('ui-book', 'assets/ui/book.png');
    this.load.image('ui-frames', 'assets/ui/frames.png');
  }

  create() {
    for (const [id, [x, y, w, h]] of Object.entries(FURNITURE_RECT)) {
      const key = `furn_${id}`;
      if (this.textures.exists(key)) this.textures.get(key).add(id, 0, x, y, w, h);
    }
    for (const entry of CATALOG) {
      if (entry.frameKey in FURNITURE_RECT) continue; // already carved above
      const rect = VARIANT_RECT[entry.frameKey];
      if (!rect) continue;
      const [x, y, w, h] = rect;
      if (this.textures.exists(entry.textureKey)) {
        this.textures.get(entry.textureKey).add(entry.frameKey, 0, x, y, w, h);
      }
    }

    const facings: Array<['down' | 'right' | 'up', number]> = [
      ['down', 0],
      ['right', 1],
      ['up', 2],
    ];

    for (const [dir, row] of facings) {
      this.anims.create({
        key: `idle-${dir}`,
        frames: this.anims.generateFrameNumbers('player', { start: row * 9, end: row * 9 + 5 }),
        frameRate: 10,
        repeat: -1,
      });
    }

    for (const [dir, row] of facings) {
      const walkRow = row + 3;
      this.anims.create({
        key: `walk-${dir}`,
        frames: this.anims.generateFrameNumbers('player', { start: walkRow * 9, end: walkRow * 9 + 5 }),
        frameRate: 10,
        repeat: -1,
      });
    }

    this.scene.start('TitleScene');
  }
}
