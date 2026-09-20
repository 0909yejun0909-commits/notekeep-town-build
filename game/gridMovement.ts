import Phaser from 'phaser';

export const TILE = 16;

export type Direction = 'down' | 'right' | 'up' | 'left';

export type Walkable = (gx: number, gy: number) => boolean;

// Recommended sprite position: the bottom-centre of its tile, so with
// setOrigin(0.5, 0.64) the feet stand on the tile. GridMovement itself keeps
// whatever pixel offset the sprite was spawned with, so a sprite placed at
// (gx*16, gy*16) keeps moving in exact multiples of 16 too.
export function tileToWorld(gx: number, gy: number): { x: number; y: number } {
  return { x: gx * TILE + TILE / 2, y: gy * TILE + TILE };
}

export function worldToTile(x: number, y: number): { gx: number; gy: number } {
  return { gx: Math.round((x - TILE / 2) / TILE), gy: Math.round((y - TILE) / TILE) };
}

const DELTA: Record<Direction, [number, number]> = {
  down: [0, 1], right: [1, 0], up: [0, -1], left: [-1, 0],
};

export class GridMovement {
  enabled = true;

  private scene: Phaser.Scene;
  private sprite: Phaser.GameObjects.Sprite;
  private isWalkable: Walkable;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd: { W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key };
  private moving = false;
  private facing: Direction = 'down';
  private offX: number;
  private offY: number;

  constructor(scene: Phaser.Scene, sprite: Phaser.GameObjects.Sprite, isWalkable: Walkable) {
    this.scene = scene;
    this.sprite = sprite;
    this.isWalkable = isWalkable;
    this.offX = ((sprite.x % TILE) + TILE) % TILE;
    this.offY = ((sprite.y % TILE) + TILE) % TILE;

    this.cursors = scene.input.keyboard!.createCursorKeys();
    this.wasd = scene.input.keyboard!.addKeys('W,A,S,D') as any;

    sprite.play('idle-down');
  }

  private toWorld(gx: number, gy: number) {
    return { x: gx * TILE + this.offX, y: gy * TILE + this.offY };
  }

  snapTo(gx: number, gy: number) {
    const { x, y } = this.toWorld(gx, gy);
    this.sprite.setPosition(x, y);
  }

  getTile(): { gx: number; gy: number } {
    return {
      gx: Math.round((this.sprite.x - this.offX) / TILE),
      gy: Math.round((this.sprite.y - this.offY) / TILE),
    };
  }

  getFacing(): Direction {
    return this.facing;
  }

  facingTile(): { gx: number; gy: number } {
    const { gx, gy } = this.getTile();
    const [dx, dy] = DELTA[this.facing];
    return { gx: gx + dx, gy: gy + dy };
  }

  isMoving(): boolean {
    return this.moving;
  }

  update() {
    if (this.moving || !this.enabled) return;

    let dir: Direction | null = null;
    if (this.cursors.left.isDown || this.wasd.A.isDown) dir = 'left';
    else if (this.cursors.right.isDown || this.wasd.D.isDown) dir = 'right';
    else if (this.cursors.up.isDown || this.wasd.W.isDown) dir = 'up';
    else if (this.cursors.down.isDown || this.wasd.S.isDown) dir = 'down';

    if (!dir) return;

    this.facing = dir;
    const [dx, dy] = DELTA[dir];
    const { gx, gy } = this.getTile();
    const targetGx = gx + dx;
    const targetGy = gy + dy;

    const animDir = dir === 'left' ? 'right' : dir;
    this.sprite.setFlipX(dir === 'left');

    if (!this.isWalkable(targetGx, targetGy)) {
      this.sprite.play(`idle-${animDir}`, true);
      return;
    }

    this.moving = true;
    this.sprite.play(`walk-${animDir}`, true);

    const target = this.toWorld(targetGx, targetGy);
    this.scene.tweens.add({
      targets: this.sprite,
      x: target.x,
      y: target.y,
      duration: 150,
      onComplete: () => {
        this.moving = false;
        const idleDir = this.facing === 'left' ? 'right' : this.facing;
        this.sprite.play(`idle-${idleDir}`, true);
      },
    });
  }
}
