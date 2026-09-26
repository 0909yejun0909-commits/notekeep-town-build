import Phaser from 'phaser';
import { CATALOG, FURNITURE_SHEETS, SHELF_RECT, SHELF_SHEET, furnitureTextureKey } from '@/lib/catalog';
import { HOUSE_VARIANTS, MATERIALS, ROOF_COLORS, availableWallColors, houseTextureKey } from '@/lib/houseCatalog';
import {
  CLOTH_COLORS,
  HAIR_COLORS,
  HAIR_STYLES,
  hairAssetPath,
  hairTextureKey,
  pantsAssetPath,
  pantsTextureKey,
  shirtAssetPath,
  shirtTextureKey,
  shoesAssetPath,
  shoesTextureKey,
} from '@/lib/characterCatalog';
import { createSceneryAnims, preloadScenery } from '@/game/sceneryAssets';

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

    for (const shape of HOUSE_VARIANTS) {
      for (const material of MATERIALS) {
        for (const wallColor of availableWallColors(material, shape)) {
          for (const roofColor of ROOF_COLORS) {
            this.load.image(
              houseTextureKey(shape, material, wallColor, roofColor),
              `assets/buildings/house_${shape}_${material}_${wallColor}_${roofColor}.png`,
            );
          }
        }
      }
    }

    this.load.spritesheet('interior-floor', 'assets/interior/floor.png', { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('interior-walls', 'assets/interior/walls.png', { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('interior-doors', 'assets/interior/doors.png', { frameWidth: 16, frameHeight: 16 });

    for (const sheet of FURNITURE_SHEETS) {
      this.load.image(furnitureTextureKey(sheet), `assets/furniture/${sheet}.png`);
    }

    this.load.spritesheet('tree-oak', 'assets/terrain/tree_oak.png', { frameWidth: 32, frameHeight: 48 });
    this.load.spritesheet('tree-spruce', 'assets/terrain/tree_spruce.png', { frameWidth: 32, frameHeight: 48 });
    this.load.spritesheet('flowers', 'assets/terrain/flowers.png', { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('grass-edges', 'assets/terrain/grass_meadow.png', { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('water-edges', 'assets/terrain/water.png', { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('cobble-edges', 'assets/terrain/cobble.png', { frameWidth: 16, frameHeight: 16 });

    // Every hair style/color and shirt/pants/shoes color combo is preloaded up front so the
    // in-game character picker (components/CharacterCreator.tsx) can switch textures instantly
    // with no async load step, the same tradeoff houseCatalog's shape/material/color grid makes.
    for (const style of HAIR_STYLES) {
      for (const color of HAIR_COLORS) {
        this.load.spritesheet(hairTextureKey(style, color), hairAssetPath(style, color), {
          frameWidth: 64,
          frameHeight: 64,
        });
      }
    }
    for (const color of CLOTH_COLORS) {
      this.load.spritesheet(shirtTextureKey(color), shirtAssetPath(color), { frameWidth: 64, frameHeight: 64 });
      this.load.spritesheet(pantsTextureKey(color), pantsAssetPath(color), { frameWidth: 64, frameHeight: 64 });
      this.load.spritesheet(shoesTextureKey(color), shoesAssetPath(color), { frameWidth: 64, frameHeight: 64 });
    }

    preloadScenery(this);

    this.load.image('ui-book', 'assets/ui/book.png');
    this.load.image('ui-frames', 'assets/ui/frames.png');
  }

  create() {
    const shelfKey = furnitureTextureKey(SHELF_SHEET);
    if (this.textures.exists(shelfKey)) this.textures.get(shelfKey).add('shelf', 0, ...SHELF_RECT);
    for (const entry of CATALOG) {
      if (!this.textures.exists(entry.textureKey)) continue;
      const [x, y, w, h] = entry.rect;
      this.textures.get(entry.textureKey).add(entry.frameKey, 0, x, y, w, h);
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

    createSceneryAnims(this);

    this.scene.start('TitleScene');
  }
}
