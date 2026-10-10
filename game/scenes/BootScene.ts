import { HAIR_LAYER, PETS, SKINS, outfitAssetPath, outfitTextureKey, petAssetPath, petTextureKey } from '@/lib/rewards';
import Phaser from 'phaser';
import { CATALOG, FURNITURE_SHEETS, SHELF_RECT, SHELF_SHEET, furnitureSheetUrl, furnitureTextureKey } from '@/lib/catalog';
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
import { loadTownBiome } from '@/lib/biome';
import { bus } from '@/game/bus';

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    // Phaser text keeps whatever font was ready when it was drawn; start the pixel font now.
    void document.fonts?.load("28px 'Tiny5'");
    document.fonts?.load("9px 'CuteFantasy'").catch(() => {});

    // Phaser draws any texture that failed to load as a black box, which looks like broken
    // code; collect the failures so components/MissingArtBanner.tsx can say what's missing.
    const missing: string[] = [];
    // Reward art is optional (installed by `npm run install-rewards`); its absence just means no rewards show.
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      const url = file.url as string;
      if (!/assets\/(outfits|pets)\//.test(url)) missing.push(url);
    });
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      if (missing.length === 0) return;
      this.game.registry.set('missingAssets', missing);
      bus.emit('assets-missing', { files: missing });
    });

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
      this.load.image(furnitureTextureKey(sheet), furnitureSheetUrl(sheet).slice(1));
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

    SKINS.forEach((outfit) =>
      outfit.layers.forEach((layer, i) => {
        if (layer !== HAIR_LAYER) {
          this.load.spritesheet(outfitTextureKey(outfit.id, i), outfitAssetPath(outfit.id, i), { frameWidth: 64, frameHeight: 64 });
        }
      }),
    );
    for (const p of PETS) this.load.spritesheet(petTextureKey(p.id), petAssetPath(p.id), { frameWidth: 16, frameHeight: 16 });

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
      for (const [view, dy] of Object.entries(entry.views ?? {})) {
        this.textures.get(entry.textureKey).add(`${entry.frameKey}@${view}`, 0, x, y + dy, w, h);
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

    createSceneryAnims(this);
    // Set before any scene reads it, so the picker's later writes arrive as changedata events.
    this.game.registry.set('townBiome', loadTownBiome());

    this.scene.start('TitleScene');
  }
}
