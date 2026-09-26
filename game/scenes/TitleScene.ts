import Phaser from 'phaser';
import { hash } from '@/lib/types';
import {
  HOUSE_FOOTPRINT,
  DEFAULT_MATERIAL,
  DEFAULT_WALL_COLOR,
  DEFAULT_ROOF_COLOR,
  houseTextureKey,
} from '@/lib/houseCatalog';
import { loadAppearance } from '@/lib/appearance';
import { dressPlayer } from '@/game/playerSprite';
import { bus } from '@/game/bus';

const TILE = 16;
// Tiles kept free of houses either side of centre, where the React title menu sits.
const CLEAR = 6;
const GAP = 2;
const LEFT_STREET = [3, 0, 2];
const RIGHT_STREET = [1, 4, 0];
const MS_PER_TILE = 220;

export default class TitleScene extends Phaser.Scene {
  constructor() {
    super('TitleScene');
  }

  // A meadow street behind the title menu, with the player's hero strolling along it.
  // Rebuilt from scratch on resize and when the hero's outfit changes.
  create() {
    const restart = () => this.scene.restart();
    this.scale.on(Phaser.Scale.Events.RESIZE, restart);
    bus.on('appearance-changed', restart);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, restart);
      bus.off('appearance-changed', restart);
    });

    const { width, height } = this.scale;
    const cols = Math.ceil(width / TILE);
    const rows = Math.ceil(height / TILE);
    const roadGy = Math.floor(height / TILE) - 3;
    const roadTop = roadGy * TILE;
    const centre = Math.floor(cols / 2);

    this.add.tileSprite(0, 0, cols * TILE, rows * TILE, 'terrain-grass').setOrigin(0, 0);

    for (let gx = 0; gx < cols; gx++) {
      this.add.image(gx * TILE, roadTop, 'grass-edges', 81).setOrigin(0, 0);
      this.add.image(gx * TILE, roadTop + TILE, 'grass-edges', 113).setOrigin(0, 0);
    }

    // A house sprite's bottom row is its doorstep, so it overlaps the road's grassy top row.
    const houses: Array<[number, number, number, number]> = [];
    const place = (variant: number, gx: number) => {
      const [w, h] = HOUSE_FOOTPRINT[variant];
      const key = houseTextureKey(variant, DEFAULT_MATERIAL[variant], DEFAULT_WALL_COLOR[variant], DEFAULT_ROOF_COLOR[variant]);
      this.add.image(gx * TILE, roadTop + TILE, key).setOrigin(0, 1).setDepth(roadTop + TILE);
      houses.push([gx, roadGy + 1 - h, w, h]);
    };
    const tree = (gx: number, bottom: number, i: number) => {
      const [key, frame] = i % 2 ? ['tree-spruce', 2] : ['tree-oak', 1];
      this.add.image(gx * TILE, bottom, key, frame).setOrigin(0, 1).setDepth(bottom);
    };

    let edge = centre - CLEAR;
    LEFT_STREET.forEach((variant, i) => {
      if (edge <= 0) return;
      const gx = edge - HOUSE_FOOTPRINT[variant][0];
      place(variant, gx);
      tree(gx - GAP, roadTop + 8, i);
      edge = gx - GAP;
    });
    edge = centre + CLEAR;
    RIGHT_STREET.forEach((variant, i) => {
      if (edge >= cols) return;
      place(variant, edge);
      edge += HOUSE_FOOTPRINT[variant][0];
      tree(edge, roadTop + 8, i + 1);
      edge += GAP;
    });

    // A loose tree line along the top edge, as if the town sits at the edge of a wood.
    for (let gx = -1; gx < cols; gx += 2) {
      if (hash(`title:wood:${gx}`) % 3 === 0) continue;
      tree(gx, 2 * TILE + (hash(`title:wood-y:${gx}`) % 2) * 8, hash(`title:wood-kind:${gx}`));
    }

    const underHouse = (gx: number, gy: number) =>
      houses.some(([hx, hy, w, h]) => gx >= hx && gx < hx + w && gy >= hy && gy < hy + h);
    for (let gy = 3; gy < rows; gy++) {
      if (gy === roadGy || gy === roadGy + 1) continue;
      for (let gx = 0; gx < cols; gx++) {
        if (hash(`title:flower:${gx}:${gy}`) % 17 !== 0 || underHouse(gx, gy)) continue;
        const frame = hash(`title:frame:${gx}:${gy}`) % 100;
        this.add.image(gx * TILE + TILE / 2, gy * TILE + TILE / 2, 'flowers', frame);
      }
    }

    const feetY = roadTop + TILE + 6;
    const hero = this.add.sprite(centre * TILE - 3 * TILE, feetY, 'player');
    hero.setOrigin(0.5, 0.64).setDepth(feetY);
    dressPlayer(this, hero, loadAppearance());
    hero.play('idle-down');
    this.time.delayedCall(1200, () => this.stroll(hero));
  }

  private stroll(hero: Phaser.GameObjects.Sprite) {
    const target = Phaser.Math.Between(TILE, this.scale.width - TILE);
    const dx = target - hero.x;
    if (Math.abs(dx) < 3 * TILE) {
      this.time.delayedCall(300, () => this.stroll(hero));
      return;
    }
    hero.setFlipX(dx < 0);
    hero.play('walk-right', true);
    this.tweens.add({
      targets: hero,
      x: target,
      duration: (Math.abs(dx) / TILE) * MS_PER_TILE,
      onComplete: () => {
        hero.setFlipX(false);
        hero.play('idle-down', true);
        this.time.delayedCall(Phaser.Math.Between(1500, 3500), () => this.stroll(hero));
      },
    });
  }

  update() {
    if (this.game.registry.get('world')) {
      this.scene.start('OverworldScene');
    }
  }
}
