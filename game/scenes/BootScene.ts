import Phaser from 'phaser';
import type { FurnitureId } from '@/lib/types';

// Pixel rects from the asset manifest, added as a frame named by FurnitureId:
//   this.add.image(px, py, 'furn_bed', 'bed')
const FURNITURE_RECT: Record<FurnitureId, [number, number, number, number]> = {
  desk: [72, 8, 32, 48],
  shelf: [16, 0, 32, 32],
  bed: [0, 0, 32, 32],
  chest: [0, 0, 16, 16],
  plant: [32, 0, 16, 32],
  painting: [48, 32, 16, 16],
  lamp: [0, 0, 16, 32],
  rug: [0, 0, 48, 48],
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
