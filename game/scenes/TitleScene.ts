import Phaser from 'phaser';
import { hash, type TownBiome } from '@/lib/types';
import { DEFAULT_TOWN_BIOME } from '@/lib/biome';
import {
  SNOW_BACKGROUND,
  SNOW_DECOR,
  SNOW_GROUND,
  WREATH,
  ensureWinterTextures,
  snowDecorFrame,
  snowyHouse,
  snowyTree,
  startSnowfall,
} from '@/game/winterArt';
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
    const snow = ((this.game.registry.get('townBiome') as TownBiome | undefined) ?? DEFAULT_TOWN_BIOME) === 'snow';
    if (snow) ensureWinterTextures(this);
    this.cameras.main.setBackgroundColor(snow ? SNOW_BACKGROUND : '#000000');
    const tree = (key: 'tree-oak' | 'tree-spruce') => (snow ? snowyTree(this, key) : key);

    this.add.tileSprite(0, 0, cols * TILE, rows * TILE, snow ? SNOW_GROUND : 'terrain-grass').setOrigin(0, 0);

    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        if (hash(`title:flower:${gx}:${gy}`) % 19 !== 0) continue;
        const roll = hash(`title:frame:${gx}:${gy}`);
        this.add.image(
          gx * TILE + TILE / 2,
          gy * TILE + TILE / 2,
          snow ? SNOW_DECOR : 'flowers',
          snow ? snowDecorFrame(roll) : roll % 100,
        );
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
      this.add.image(x, baseY - h * TILE, snow ? snowyHouse(this, key) : key).setOrigin(0, 0);
      if (snow) {
        const [doorX, doorY] = HOUSE_DOOR[v];
        this.add.image(x + doorX * TILE + TILE / 2, baseY - h * TILE + (doorY - 1) * TILE + TILE / 2, WREATH);
      }
      x += w * TILE + gap;
    }

    const treeY = baseY + TILE;
    this.add.image(TILE, treeY, tree('tree-oak'), 1).setOrigin(0, 1);
    this.add.image(width - 3 * TILE, treeY, tree('tree-spruce'), 2).setOrigin(0, 1);
    this.add.image(Math.floor(width / 2) - TILE, height - TILE, tree(snow ? 'tree-spruce' : 'tree-oak'), 2).setOrigin(0, 1);
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
