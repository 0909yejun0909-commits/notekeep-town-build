import type Phaser from 'phaser';
import { TILE } from '@/game/worldGrid';

// Collision read off the art itself. A sprite's frame is a rectangle, but the drawing inside
// it often isn't: a roof's top corners, a pot nudged up onto a wall, a pebble in the middle of
// a 16x16 cell. Blocking the whole rectangle leaves walls you can't see, so a tile only
// blocks when enough of it is actually painted.

// Below this share of opaque pixels a tile reads as open ground.
export const SOLID_SHARE = 0.25;

const alphas = new Map<string, { w: number; h: number; a: Uint8ClampedArray } | null>();

function alphaOf(scene: Phaser.Scene, key: string) {
  if (alphas.has(key)) return alphas.get(key)!;
  let out: { w: number; h: number; a: Uint8ClampedArray } | null = null;
  try {
    const img = scene.textures.get(key).getSourceImage() as CanvasImageSource & { width: number; height: number };
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    out = { w: img.width, h: img.height, a: ctx.getImageData(0, 0, img.width, img.height).data };
  } catch {
    out = null;
  }
  alphas.set(key, out);
  return out;
}

// The share of tile (tx, ty) that a frame drawn with its top-left at world (left, top) paints.
// Art that can't be read counts as fully solid, so a missing sheet never opens a wall.
export function tileCoverage(
  scene: Phaser.Scene, key: string, frame: string | number | undefined, left: number, top: number, tx: number, ty: number,
): number {
  if (!scene.textures.exists(key)) return 1;
  const f = scene.textures.getFrame(key, frame);
  const src = alphaOf(scene, key);
  if (!f || !src) return 1;
  let painted = 0;
  for (let py = 0; py < TILE; py++) {
    const ly = ty * TILE + py - top;
    if (ly < 0 || ly >= f.cutHeight) continue;
    for (let px = 0; px < TILE; px++) {
      const lx = tx * TILE + px - left;
      if (lx < 0 || lx >= f.cutWidth) continue;
      if (src.a[((f.cutY + ly) * src.w + f.cutX + lx) * 4 + 3] >= 128) painted++;
    }
  }
  return painted / (TILE * TILE);
}

export const paintsTile = (...args: Parameters<typeof tileCoverage>) => tileCoverage(...args) >= SOLID_SHARE;
