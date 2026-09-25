import Phaser from 'phaser';
import { hash, type TownBiome } from '@/lib/types';
import { DEFAULT_TOWN_BIOME } from '@/lib/biome';
import { skin } from '@/game/biomeArt';
import { WINTER_DECOR, WREATH, ensureWinterTextures, startSnowfall, winterDecorFrame } from '@/game/winterArt';
import { DESERT_DECOR, desertDecorFrame, desertTree, ensureDesertTextures } from '@/game/desertArt';
import {
  HOUSE_DOOR,
  HOUSE_FOOTPRINT,
  DEFAULT_MATERIAL,
  DEFAULT_WALL_COLOR,
  DEFAULT_ROOF_COLOR,
  houseTextureKey,
} from '@/lib/houseCatalog';

const TILE = 16;
const STREET = [0, 3, 1, 2, 4];

export default class TitleScene extends Phaser.Scene {
  constructor() {
    super('TitleScene');
  }

  create() {
    const draw = () => this.drawBackdrop();
    draw();
    this.scale.on(Phaser.Scale.Events.RESIZE, draw);
    this.game.registry.events.on('changedata-townBiome', draw);
    this.events.once('shutdown', () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, draw);
      this.game.registry.events.off('changedata-townBiome', draw);
    });
  }

  // A little meadow with a street of houses, so the vault picker sits over the
  // game instead of a black void. Redrawn on resize.
  private drawBackdrop() {
    this.children.removeAll(true);
    const { width, height } = this.scale;
    const cols = Math.ceil(width / TILE);
    const rows = Math.ceil(height / TILE);
    const biome = (this.game.registry.get('townBiome') as TownBiome | undefined) ?? DEFAULT_TOWN_BIOME;
    const snow = biome === 'snow';
    if (snow) ensureWinterTextures(this);
    if (biome === 'desert') ensureDesertTextures(this);
    const tree = (x: number, y: number, key: 'tree-oak' | 'tree-spruce', frame: number) => {
      const desert = biome === 'desert' ? desertTree(this, key, (hash(`title:tree:${x}`) % 100) / 100, false) : null;
      // Desert plants are drawn at the tree's frame size, so the same origin stands them on the ground.
      (desert ? this.add.image(x, y, desert) : this.add.image(x, y, skin(this, biome, key), frame)).setOrigin(0, 1);
    };

    this.add.tileSprite(0, 0, cols * TILE, rows * TILE, skin(this, biome, 'terrain-grass')).setOrigin(0, 0);

    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        if (hash(`title:flower:${gx}:${gy}`) % 19 !== 0) continue;
        const roll = hash(`title:frame:${gx}:${gy}`);
        const [texture, frame] =
          biome === 'snow' ? [WINTER_DECOR, winterDecorFrame(roll)]
          : biome === 'desert' ? [DESERT_DECOR, desertDecorFrame(roll)]
          : ['flowers', roll % 100];
        this.add.image(gx * TILE + TILE / 2, gy * TILE + TILE / 2, texture, frame);
      }
    }

    const baseY = Math.floor(height * 0.78);
    const gap = 3 * TILE;
    const street: number[] = [];
    let total = -gap;
    for (const v of STREET) {
      const [w] = HOUSE_FOOTPRINT[v];
      if (total + w * TILE + gap > width - 4 * TILE) break;
      street.push(v);
      total += w * TILE + gap;
    }
    let x = Math.floor((width - total) / 2);
    for (const v of street) {
      const [w, h] = HOUSE_FOOTPRINT[v];
      const key = houseTextureKey(v, DEFAULT_MATERIAL[v], DEFAULT_WALL_COLOR[v], DEFAULT_ROOF_COLOR[v]);
      this.add.image(x, baseY - h * TILE, skin(this, biome, key)).setOrigin(0, 0);
      if (snow) {
        const [doorX, doorY] = HOUSE_DOOR[v];
        this.add.image(x + doorX * TILE + TILE / 2, baseY - h * TILE + (doorY - 1) * TILE + TILE / 2, WREATH);
      }
      x += w * TILE + gap;
    }

    const treeY = baseY + TILE;
    tree(TILE, treeY, 'tree-oak', 1);
    tree(width - 3 * TILE, treeY, 'tree-spruce', 2);
    tree(Math.floor(width / 2) - TILE, height - TILE, snow ? 'tree-spruce' : 'tree-oak', 2);
    if (snow) startSnowfall(this);

    this.add
      .text(Math.floor(width / 2), Math.floor(height * 0.2), 'Notekeep Town', {
        fontFamily: 'monospace',
        fontSize: '28px',
        fontStyle: 'bold',
        color: '#fff7e6',
        stroke: '#3f2832',
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    this.add
      .text(Math.floor(width / 2), Math.floor(height * 0.2) + 30, 'Your notes, as a town you can walk around', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#fff7e6',
        stroke: '#3f2832',
        strokeThickness: 4,
      })
      .setOrigin(0.5);
  }

  update() {
    if (this.game.registry.get('world')) {
      this.scene.start('OverworldScene');
    }
  }
}
