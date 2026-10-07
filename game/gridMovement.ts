import Phaser from 'phaser';
import { footstep } from '@/game/audio/sfx';

export const TILE = 16;

export type Direction = 'down' | 'right' | 'up' | 'left';

export type Walkable = (gx: number, gy: number) => boolean;

// Sprite position convention for every grid-walking sprite (player, NPCs):
// (x, y) is the bottom-centre of its tile, so with setOrigin(0.5, 0.64) the feet
// stand on the tile. Spawn with tileToWorld() and read tiles with getTile() or
// worldToTile(); never derive a tile from x / 16 directly.
export function tileToWorld(gx: number, gy: number): { x: number; y: number } {
  return { x: gx * TILE + TILE / 2, y: gy * TILE + TILE };
}

export function worldToTile(x: number, y: number): { gx: number; gy: number } {
  return { gx: Math.round((x - TILE / 2) / TILE), gy: Math.round((y - TILE) / TILE) };
}

const DELTA: Record<Direction, [number, number]> = {
  down: [0, 1], right: [1, 0], up: [0, -1], left: [-1, 0],
};

export const STEP_MS = 150;
// Two keys are never pressed in the same instant. Starting from a standstill, one key on its
// own waits this long for a partner, so a two-key press steps diagonally from the first tile.
const CHORD_MS = 50;

// A diagonal step covers sqrt(2) tiles, so it takes that much longer: same walking speed.
export function stepMs(dx: number, dy: number): number {
  return dx !== 0 && dy !== 0 ? Math.round(STEP_MS * Math.SQRT2) : STEP_MS;
}

// There's no diagonal walk in the art, so a diagonal step faces sideways.
function facingOf(dx: number, dy: number): Direction {
  if (dx !== 0) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
}

type Key = Phaser.Input.Keyboard.Key;

export class GridMovement {
  enabled = true;
  onStep: ((gx: number, gy: number, facing: Direction) => void) | null = null;

  private scene: Phaser.Scene;
  private sprite: Phaser.GameObjects.Sprite;
  private isWalkable: Walkable;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd: { W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key };
  private moving = false;
  private facing: Direction = 'down';
  private stale: Set<Phaser.Input.Keyboard.Key> | null = null;
  private lastStepEnd = -Infinity;
  // A lone key held inside the chord window. Kept so a tap shorter than the window still steps.
  private pending: { dx: number; dy: number; at: number } | null = null;

  constructor(scene: Phaser.Scene, sprite: Phaser.GameObjects.Sprite, isWalkable: Walkable) {
    this.scene = scene;
    this.sprite = sprite;
    this.isWalkable = isWalkable;

    this.cursors = scene.input.keyboard!.createCursorKeys();
    this.wasd = scene.input.keyboard!.addKeys('W,A,S,D') as any;

    sprite.play('idle-down');
  }

  snapTo(gx: number, gy: number) {
    const { x, y } = tileToWorld(gx, gy);
    this.sprite.setPosition(x, y);
  }

  getTile(): { gx: number; gy: number } {
    return worldToTile(this.sprite.x, this.sprite.y);
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

  // A key still held from before a scene restart only arrives as OS auto-repeats; ignore each
  // one until it's pressed afresh, so walking out through one doorway can't carry you on
  // through the next.
  ignoreHeldKeys() {
    const { left, right, up, down } = this.cursors;
    this.stale = new Set([left, right, up, down, this.wasd.W, this.wasd.A, this.wasd.S, this.wasd.D]);
  }

  private held(key: Phaser.Input.Keyboard.Key): boolean {
    if (this.stale?.has(key)) {
      if (!key.isDown || (key.originalEvent as KeyboardEvent | undefined)?.repeat !== false) return false;
      this.stale.delete(key);
    }
    return key.isDown;
  }

  // -1, 0 or 1 along one axis, and when that key went down. With both ways held, the newer
  // press wins.
  private axis(neg: Key[], pos: Key[]): { d: number; at: number } {
    const held = (keys: Key[]) => Math.max(-1, ...keys.filter((k) => this.held(k)).map((k) => k.timeDown));
    const n = held(neg), p = held(pos);
    if (n < 0 && p < 0) return { d: 0, at: -1 };
    return p > n ? { d: 1, at: p } : { d: -1, at: n };
  }

  update() {
    if (this.moving || !this.enabled) return;

    const now = this.scene.game.loop.time;
    let h = this.axis([this.cursors.left, this.wasd.A], [this.cursors.right, this.wasd.D]);
    let v = this.axis([this.cursors.up, this.wasd.W], [this.cursors.down, this.wasd.S]);
    if (h.d === 0 && v.d === 0) {
      // Let go inside the chord window: still take the tapped step (if it's fresh).
      const tap = this.pending;
      this.pending = null;
      if (!tap || now - tap.at > 250) return;
      h = { d: tap.dx, at: tap.at };
      v = { d: tap.dy, at: tap.at };
    } else if ((h.d === 0) !== (v.d === 0) && now - this.lastStepEnd > 100 && now - Math.max(h.at, v.at) < CHORD_MS) {
      this.pending = { dx: h.d, dy: v.d, at: this.pending?.at ?? now };
      return;
    } else {
      this.pending = null;
    }

    const { gx, gy } = this.getTile();
    const open = (dx: number, dy: number) => this.isWalkable(gx + dx, gy + dy);
    // Both keys held: step diagonally, but only when both tiles beside the diagonal are open
    // too, so you never clip a house corner or squeeze between two trees. Otherwise slide
    // along whichever axis is open, the most recently pressed one first.
    const tries: [number, number][] =
      h.d === 0 || v.d === 0 ? [[h.d, v.d]]
      : h.at >= v.at ? [[h.d, v.d], [h.d, 0], [0, v.d]]
      : [[h.d, v.d], [0, v.d], [h.d, 0]];
    const step = tries.find(([dx, dy]) => open(dx, dy) && (dx === 0 || dy === 0 || (open(dx, 0) && open(0, dy))));

    const [dx, dy] = step ?? [0, 0];
    // Blocked every way: turn toward the newer of the held directions, as one key would.
    const dir = step ? facingOf(dx, dy)
      : h.d !== 0 && (v.d === 0 || h.at >= v.at) ? facingOf(h.d, 0)
      : facingOf(0, v.d);
    const turned = dir !== this.facing;
    this.facing = dir;

    const animDir = dir === 'left' ? 'right' : dir;
    this.sprite.setFlipX(dir === 'left');

    if (!step) {
      this.sprite.play(`idle-${animDir}`, true);
      if (turned) this.onStep?.(gx, gy, dir);
      return;
    }

    const targetGx = gx + dx;
    const targetGy = gy + dy;
    this.moving = true;
    this.onStep?.(targetGx, targetGy, dir);
    footstep(targetGx, targetGy);
    this.sprite.play(`walk-${animDir}`, true);

    const target = tileToWorld(targetGx, targetGy);
    this.scene.tweens.add({
      targets: this.sprite,
      x: target.x,
      y: target.y,
      duration: stepMs(dx, dy),
      onComplete: () => {
        this.moving = false;
        this.lastStepEnd = this.scene.game.loop.time;
        const idleDir = this.facing === 'left' ? 'right' : this.facing;
        this.sprite.play(`idle-${idleDir}`, true);
      },
    });
  }
}
