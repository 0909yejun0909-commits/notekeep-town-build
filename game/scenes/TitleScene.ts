import Phaser from 'phaser';
import { hash } from '@/lib/types';
import { HOUSE_FOOTPRINT, DEFAULT_WALL_COLOR, DEFAULT_ROOF_COLOR, houseTextureKey } from '@/lib/houseCatalog';

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
    this.events.once('shutdown', () => this.scale.off(Phaser.Scale.Events.RESIZE, draw));
  }

  // A little meadow with a street of houses, so the vault picker sits over the
  // game instead of a black void. Redrawn on resize.
  private drawBackdrop() {
    this.children.removeAll(true);
    const { width, height } = this.scale;
    const cols = Math.ceil(width / TILE);
    const rows = Math.ceil(height / TILE);

    this.add.tileSprite(0, 0, cols * TILE, rows * TILE, 'terrain-grass').setOrigin(0, 0);

    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        if (hash(`title:flower:${gx}:${gy}`) % 19 !== 0) continue;
        const frame = hash(`title:frame:${gx}:${gy}`) % 100;
        this.add.image(gx * TILE + TILE / 2, gy * TILE + TILE / 2, 'flowers', frame);
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
      const key = houseTextureKey(v, DEFAULT_WALL_COLOR[v], DEFAULT_ROOF_COLOR[v]);
      this.add.image(x, baseY - h * TILE, key).setOrigin(0, 0);
      x += w * TILE + gap;
    }

    const treeY = baseY + TILE;
    this.add.image(TILE, treeY, 'tree-oak', 1).setOrigin(0, 1);
    this.add.image(width - 3 * TILE, treeY, 'tree-spruce', 2).setOrigin(0, 1);
    this.add.image(Math.floor(width / 2) - TILE, height - TILE, 'tree-oak', 2).setOrigin(0, 1);

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
