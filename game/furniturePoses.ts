import Phaser from 'phaser';
import { TILE } from '@/game/gridMovement';
import { outfitTextureKeys } from '@/game/playerSprite';
import type { Appearance, CatalogCategory, CatalogEntry, FurniturePlacement } from '@/lib/types';

// Kenmi's character sheets have no sit or sleep animation, so both poses are put together
// from frames already loaded. Every number here was measured on mockups of each variant
// (docs/superpowers/specs/2026-09-26-furniture-actions-design.md). Each pose returns the
// function that takes it apart again.

// How far the player is lifted onto the seat, and how many rows of the piece's bottom edge
// are drawn again over their legs. A stool is one tile tall, so the body has to sit higher.
type Seat = { lift: number; front: number };
const SEATS: Partial<Record<CatalogCategory, Seat>> = { stool: { lift: 6, front: 8 } };
const DEFAULT_SEAT: Seat = { lift: 3, front: 5 };

// Frame 2 of idle-down is the one with 1px eyes, which reads as closed.
const SLEEP_FRAME = 2;
// Head and hair inside a 64px character frame: x, y, w, h.
const HEAD = [22, 15, 20, 21] as const;
// The head's top sits this far above the bed's top edge, and the bed from BLANKET_TOP down
// is drawn again over it as the blanket.
const PILLOW_RISE = 6;
const BLANKET_TOP = 13;

// Above the player (10) and its outfit layers (10.01-10.04).
const OVER_PLAYER = 11;

// A 5x5 pixel "Z" with a 1px outline, drawn once into a texture: text this small is a smudge
// at zoom 3.
const SLEEP_Z = 'sleep-z';
const Z_ROWS = ['#####', '...#.', '..#..', '.#...', '#####'];

function makeSleepZ(scene: Phaser.Scene) {
  if (scene.textures.exists(SLEEP_Z)) return;
  const g = scene.make.graphics({}, false);
  const pixels = Z_ROWS.flatMap((row, y) => [...row].flatMap((c, x) => (c === '#' ? [[x + 1, y + 1]] : [])));
  g.fillStyle(0x3f2832);
  for (const [x, y] of pixels) g.fillRect(x - 1, y - 1, 3, 3);
  g.fillStyle(0xffffff);
  for (const [x, y] of pixels) g.fillRect(x, y, 1, 1);
  g.generateTexture(SLEEP_Z, 7, 7);
  g.destroy();
}

function redrawBottom(
  scene: Phaser.Scene,
  entry: CatalogEntry,
  placement: FurniturePlacement,
  fromRow: number,
  depth: number,
) {
  const [fw, fh] = entry.footprint;
  return scene.add
    .image(placement.gx * TILE, placement.gy * TILE, entry.textureKey, entry.frameKey)
    .setOrigin(0, 0)
    .setFlipX(placement.rotation === 180)
    .setCrop(0, fromRow, fw * TILE, fh * TILE - fromRow)
    .setDepth(depth);
}

export function sit(
  scene: Phaser.Scene,
  player: Phaser.GameObjects.Sprite,
  entry: CatalogEntry,
  placement: FurniturePlacement,
): () => void {
  const [fw, fh] = entry.footprint;
  const seat = SEATS[entry.category] ?? DEFAULT_SEAT;
  player
    .setPosition((placement.gx + fw / 2) * TILE, (placement.gy + fh) * TILE - seat.lift)
    .setFlipX(false)
    .play('idle-down', true);
  const front = redrawBottom(scene, entry, placement, fh * TILE - seat.front, OVER_PLAYER);
  return () => front.destroy();
}

export function lie(
  scene: Phaser.Scene,
  player: Phaser.GameObjects.Sprite,
  entry: CatalogEntry,
  placement: FurniturePlacement,
  appearance: Appearance,
): () => void {
  const [fw] = entry.footprint;
  const [cx, cy, cw, ch] = HEAD;
  const headX = placement.gx * TILE + (fw * TILE) / 2 - cw / 2;
  const headY = placement.gy * TILE - PILLOW_RISE;

  player.setVisible(false);
  const head = ['player', ...outfitTextureKeys(appearance)].map((key, i) =>
    scene.add
      .image(headX - cx, headY - cy, key, SLEEP_FRAME)
      .setOrigin(0, 0)
      .setCrop(cx, cy, cw, ch)
      .setDepth(OVER_PLAYER + i * 0.01),
  );
  const blanket = redrawBottom(scene, entry, placement, BLANKET_TOP, OVER_PLAYER + 1);

  makeSleepZ(scene);
  const zs = [0, 900].map((delay) => {
    const z = scene.add
      .image(headX + cw - 4, headY + 4, SLEEP_Z)
      .setOrigin(0, 1)
      .setAlpha(0)
      .setDepth(OVER_PLAYER + 2);
    const drift = scene.tweens.add({
      targets: z,
      x: z.x + 4,
      y: z.y - 12,
      alpha: { from: 1, to: 0 },
      duration: 1800,
      delay,
      repeat: -1,
    });
    return { z, drift };
  });

  return () => {
    zs.forEach(({ z, drift }) => {
      drift.remove();
      z.destroy();
    });
    blanket.destroy();
    head.forEach((part) => part.destroy());
    player.setVisible(true);
  };
}
