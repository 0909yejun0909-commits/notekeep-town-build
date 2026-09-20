import Phaser from 'phaser';

const TILE = 16;

type Direction = 'down' | 'right' | 'up' | 'left';

export type Walkable = (gx: number, gy: number) => boolean;

export class GridMovement {
  private scene: Phaser.Scene;
  private sprite: Phaser.GameObjects.Sprite;
  private isWalkable: Walkable;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd: { W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key };
  private moving = false;
  private facing: Direction = 'down';

  constructor(scene: Phaser.Scene, sprite: Phaser.GameObjects.Sprite, isWalkable: Walkable) {
    this.scene = scene;
    this.sprite = sprite;
    this.isWalkable = isWalkable;

    this.cursors = scene.input.keyboard!.createCursorKeys();
    this.wasd = scene.input.keyboard!.addKeys('W,A,S,D') as any;

    sprite.play('idle-down');
  }

  update() {
    if (this.moving) return;

    let dx = 0, dy = 0;
    let dir: Direction | null = null;

    if (this.cursors.left.isDown || this.wasd.A.isDown) { dx = -1; dir = 'left'; }
    else if (this.cursors.right.isDown || this.wasd.D.isDown) { dx = 1; dir = 'right'; }
    else if (this.cursors.up.isDown || this.wasd.W.isDown) { dy = -1; dir = 'up'; }
    else if (this.cursors.down.isDown || this.wasd.S.isDown) { dy = 1; dir = 'down'; }

    if (!dir) return;

    this.facing = dir;

    const gx = Math.round(this.sprite.x / TILE);
    const gy = Math.round(this.sprite.y / TILE);
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

    this.scene.tweens.add({
      targets: this.sprite,
      x: targetGx * TILE,
      y: targetGy * TILE,
      duration: 150,
      onComplete: () => {
        this.moving = false;
        const idleDir = this.facing === 'left' ? 'right' : this.facing;
        this.sprite.play(`idle-${idleDir}`, true);
      },
    });
  }
}
