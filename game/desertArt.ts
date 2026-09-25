import Phaser from 'phaser';
import { hash } from '@/lib/types';
import { addPixels, addStrip, canvas, Pixels } from '@/game/biomeArt';

// The desert biome's own props, drawn in code. Trees are replaced one for one by a desert
// plant drawn in the same frame size with its trunk at the same anchor pixel, so they stand
// exactly where (and block exactly what) the forest tree would.

const LEAF = '#3e8948', LEAF_HI = '#63c74d', LEAF_DARK = '#265c42';
const CACTUS = '#4f9a5a', CACTUS_HI = '#72bf6c', CACTUS_DARK = '#2e6b3e', SPINE = '#f2e6b8';
const CLAY = '#c8643b', CLAY_HI = '#e07b4f', CLAY_DARK = '#9c4a2b';

export const DESERT_DECOR = 'desert-decor';
// Pebbles and wildflowers are common, skulls rare.
const DESERT_DECOR_WEIGHTED = [1, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 1, 2, 0];
export function desertDecorFrame(roll: number): number {
  return DESERT_DECOR_WEIGHTED[roll % DESERT_DECOR_WEIGHTED.length];
}
export const POTTED_CACTUS = 'desert-potted-cactus';
export const AMPHORA = 'desert-amphora';
export const BARREL_CACTUS = 'desert-barrel-cactus';
export const TUMBLEWEED = 'desert-tumbleweed';
export const SAND_GRAIN = 'desert-sand-grain';

function shadow(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number) {
  ctx.fillStyle = 'rgba(63, 40, 50, 0.22)';
  for (let y = -2; y <= 1; y++) {
    const w = Math.round(rx * Math.sqrt(1 - ((y + 0.5) / 2.5) ** 2));
    ctx.fillRect(cx - w, cy + y, w * 2, 1);
  }
}

function palm(p: Pixels, bx: number, by: number, height: number, lean: number, seed: number) {
  let topX = bx, topY = by - height;
  for (let i = 0; i <= height; i++) {
    const t = i / height;
    const x = bx + lean * Math.sin((t * Math.PI) / 2);
    const w = t < 0.12 ? 4 : 3;
    const band = Math.floor(i / 3) % 2 === 0;
    for (let k = 0; k < w; k++) {
      p.set(Math.round(x - w / 2 + k), by - i, k === w - 1 ? '#6d4a2e' : band ? '#b0804f' : '#8f6238');
    }
    topX = x;
  }
  topX = Math.round(topX);
  const fronds: [number, number, number][] = [
    [-160, 12, 5], [-125, 10, 3], [-90, 7, 1], [-55, 10, 3], [-20, 12, 5], [165, 11, 8], [15, 11, 8],
  ];
  fronds.forEach(([deg, len, droop], i) => {
    const a = (deg * Math.PI) / 180;
    const L = len + (hash(`${seed}:frond:${i}`) % 3) - 1;
    for (let s = 1; s <= L; s++) {
      const x = topX + Math.cos(a) * s;
      const y = topY + Math.sin(a) * s + droop * (s / L) ** 2;
      p.set(x, y, LEAF);
      p.set(x, y - 1, s < L - 1 ? LEAF_HI : LEAF);
      if (s % 2 === 0 && s > 2) p.set(x, y + 1, LEAF_DARK);
    }
  });
  p.ball(topX - 1, topY + 2.5, 1.4, '#7a4a2a', '#9c6a3a', '#4f2f1f');
  p.ball(topX + 2, topY + 2.5, 1.4, '#7a4a2a', '#9c6a3a', '#4f2f1f');
}

function saguaro(p: Pixels, variant: number) {
  const body = (x: number, y0: number, y1: number, w: number) => {
    for (let y = y0; y <= y1; y++) {
      for (let k = 0; k < w; k++) p.set(x + k, y, k === w - 1 ? CACTUS_DARK : k === 1 ? CACTUS_HI : CACTUS);
    }
    for (let k = 0; k < w; k++) p.set(x + k, y0 - 1, k > 0 && k < w - 1 ? CACTUS : null);
  };
  body(13, 8, 34, 6);
  const arms: [number, number, number][][] = [
    [[-1, 22, 14], [1, 18, 11]],
    [[-1, 17, 10]],
    [[1, 24, 16], [-1, 19, 13]],
  ];
  for (const [side, joinY, topY] of arms[variant % arms.length]) {
    const [cx0, cx1, colX] = side < 0 ? [9, 12, 8] : [19, 21, 20];
    for (let x = cx0; x <= cx1; x++) {
      for (let y = joinY; y < joinY + 3; y++) p.set(x, y, y === joinY + 2 ? CACTUS_DARK : CACTUS);
    }
    body(colX, topY, joinY + 2, 4);
  }
  for (let i = 0; i < 14; i++) {
    const h = hash(`spine:${variant}:${i}`);
    const x = 12 + (h % 9), y = 9 + ((h >> 4) % 24);
    if (p.get(x, y) && !p.get(x + 1, y)) p.set(x + 1, y, SPINE);
  }
  if (variant === 2) p.map(['.f.', 'fYf'], { f: '#f5a0c8', Y: '#ffc825' }, 14, 5);
}

// Stacked sandstone blocks, banded in strata, darker on the shaded right.
function mesa(p: Pixels) {
  const blocks: [number, number, number, number][] = [[6, 44, 52, 23], [13, 26, 36, 19], [22, 14, 18, 13]];
  const bands = ['#e4b67c', '#d9a066', '#c98a55'];
  for (const [x0, y0, w, h] of blocks) {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        const cornerX = Math.min(x - x0, x0 + w - 1 - x), cornerY = Math.min(y - y0, y0 + h - 1 - y);
        if (cornerX + cornerY < 2) continue;
        const band = bands[Math.floor((y + (hash(`mesa:${x >> 2}`) % 2)) / 4) % 3];
        const shaded = x > x0 + w * 0.68;
        p.set(x, y, y < y0 + 2 ? '#f0cf98' : shaded ? (band === '#e4b67c' ? '#c98a55' : '#a86c45') : band);
      }
    }
  }
  for (let i = 0; i < 6; i++) {
    const h = hash(`crack:${i}`);
    const x = 10 + (h % 44), y = 30 + ((h >> 5) % 30);
    for (let k = 0; k < 4; k++) if (p.get(x, y + k)) p.set(x + (k === 2 ? 1 : 0), y + k, '#8a5a38');
  }
  p.ball(10, 65, 3, '#d9a066', '#f0cf98', '#a86c45', 2.4);
  p.ball(55, 64.5, 3.5, '#c98a55', '#e4b67c', '#a86c45', 2.6);
}

type Kind = 'palms' | 'mesa' | 'palm-tall' | 'palm' | 'saguaro';
const SIZE: Record<Kind, [number, number, number, number]> = {
  palms: [64, 80, 32, 66],
  mesa: [64, 80, 32, 66],
  'palm-tall': [32, 80, 16, 64],
  palm: [32, 64, 16, 50],
  saguaro: [32, 48, 16, 34],
};

function desertPlant(scene: Phaser.Scene, kind: Kind, variant: number): string {
  const key = `desert-${kind}-${variant}`;
  if (scene.textures.exists(key)) return key;
  const [fw, fh, ox, oy] = SIZE[kind];
  const p = new Pixels(fw, fh);
  if (kind === 'palms') {
    palm(p, ox - 7, oy, 44 + variant * 3, -5, variant * 2 + 1);
    palm(p, ox + 7, oy, 36 - variant * 2, 6, variant * 2 + 2);
  } else if (kind === 'mesa') mesa(p);
  else if (kind === 'palm-tall') palm(p, ox, oy, 50, variant ? 5 : -5, variant + 7);
  else if (kind === 'palm') palm(p, ox, oy, 36, variant ? 4 : -4, variant + 11);
  else saguaro(p, variant);
  p.outline();
  const { c, ctx } = canvas(fw, fh);
  shadow(ctx, ox, oy, kind === 'palms' || kind === 'mesa' ? 20 : kind === 'saguaro' ? 7 : 5);
  p.draw(ctx);
  scene.textures.addCanvas(key, c);
  return key;
}

/**
 * The desert plant standing in for a forest tree sheet, drawn at the same frame size and
 * anchor, or null for a key that isn't a tree. `roll` in [0, 1) picks the variant.
 */
export function desertTree(scene: Phaser.Scene, treeKey: string, roll: number, border: boolean): string | null {
  const pick = (n: number) => Math.floor(roll * 997) % n;
  switch (treeKey) {
    case 'tree-big-oak':
    case 'tree-big-spruce':
      return roll < (border ? 0.65 : 0.3) ? desertPlant(scene, 'mesa', 0) : desertPlant(scene, 'palms', pick(2));
    case 'tree-big-birch':
      return desertPlant(scene, 'palm-tall', pick(2));
    case 'tree-big-fruit':
    case 'tree-fruit':
      return desertPlant(scene, 'palm', pick(2));
    case 'tree-oak':
    case 'tree-spruce':
    case 'tree-birch':
      return desertPlant(scene, 'saguaro', pick(3));
    default:
      return null;
  }
}

function drawDecor(scene: Phaser.Scene) {
  const { c, ctx } = canvas(16 * 5, 16);

  const skull = new Pixels(16, 16);
  skull.map(
    ['h..........h', 'hh........hh', '.hhwwwwwwhh.', '...wwwwww...', '...wkwwkw...', '...wwwwww...', '....wwww....', '....w..w....'],
    { h: '#e8dcc0', w: '#f4efe2', k: '#3f2832' },
    2,
    6,
  );
  skull.outline('#8a6a4a');
  skull.draw(ctx, 0, 0);

  const pebbles = new Pixels(16, 16);
  pebbles.ball(5, 11, 2, '#b08a64', '#d4b08a', '#7e5c3e', 1.5);
  pebbles.ball(10.5, 12.5, 1.6, '#9c8a7a', '#c4b4a4', '#6e5e50', 1.2);
  pebbles.ball(8, 9, 1.2, '#c49a6c', '#e0bc90', '#8e6a48', 1);
  pebbles.draw(ctx, 16, 0);

  const twigs = new Pixels(16, 16);
  twigs.line(3, 12, 12, 9, '#7e5a3a');
  twigs.line(6, 11, 8, 7, '#7e5a3a');
  twigs.line(10, 10, 13, 12, '#9c7048');
  twigs.draw(ctx, 32, 0);

  const flowers = (color: string, dark: string, ox: number) => {
    const f = new Pixels(16, 16);
    for (const [x, y] of [[5, 7], [9, 5], [11, 9]]) {
      f.line(x, y + 1, x, 13, '#7c963c');
      f.map(['.c.', 'cyc', '.d.'], { c: color, y: '#ffc825', d: dark }, x - 1, y - 1);
    }
    f.draw(ctx, ox, 0);
  };
  flowers('#fb6b1d', '#c2461a', 48);
  flowers('#a86bd6', '#6e3f9c', 64);

  addStrip(scene, DESERT_DECOR, c, 16, 16);
}

function drawPottedCactus(scene: Phaser.Scene) {
  const p = new Pixels(16, 24);
  for (let y = 5; y <= 15; y++) for (let x = 6; x <= 9; x++) p.set(x, y, x === 9 ? CACTUS_DARK : x === 7 ? CACTUS_HI : CACTUS);
  for (let y = 8; y <= 11; y++) p.set(4, y, CACTUS);
  p.set(5, 11, CACTUS);
  for (let y = 7; y <= 10; y++) p.set(11, y, CACTUS_DARK);
  p.set(10, 10, CACTUS);
  p.map(['.f.', 'fYf'], { f: '#f5a0c8', Y: '#ffc825' }, 6, 3);
  p.rect(3, 15, 10, 2, CLAY_HI);
  for (let y = 17; y <= 23; y++) {
    const inset = Math.floor((y - 17) / 3);
    for (let x = 4 + inset; x <= 11 - inset; x++) p.set(x, y, x >= 10 - inset ? CLAY_DARK : CLAY);
  }
  p.outline();
  addPixels(scene, POTTED_CACTUS, p);
}

function drawAmphora(scene: Phaser.Scene) {
  const p = new Pixels(16, 32);
  p.ball(8, 23, 6, CLAY, CLAY_HI, CLAY_DARK, 7.5);
  p.rect(6, 11, 4, 6, CLAY);
  p.rect(9, 11, 1, 6, CLAY_DARK);
  p.rect(5, 9, 6, 2, CLAY_HI);
  for (const [x, y] of [[5, 12], [4, 13], [4, 14], [4, 15], [5, 16], [10, 12], [11, 13], [11, 14], [11, 15], [10, 16]]) {
    p.set(x, y, CLAY_DARK);
  }
  p.rect(3, 21, 11, 1, '#3e6fb0');
  p.rect(3, 24, 11, 1, '#3e6fb0');
  p.outline();
  addPixels(scene, AMPHORA, p);
}

function drawBarrelCactus(scene: Phaser.Scene) {
  const p = new Pixels(16, 20);
  p.ball(8, 13.5, 5.5, CACTUS, CACTUS_HI, CACTUS_DARK, 6);
  for (let x = 4; x <= 12; x += 2) for (let y = 9; y <= 18; y++) if (p.get(x, y) === CACTUS) p.set(x, y, CACTUS_DARK);
  p.outline();
  p.map(['.r.y.', 'rYrYr'], { r: '#e83b3b', y: '#ffc825', Y: '#fff4a8' }, 6, 6);
  for (let i = 0; i < 6; i++) {
    const h = hash(`bspine:${i}`);
    p.set(3 + (h % 11), 10 + ((h >> 4) % 8), SPINE);
  }
  addPixels(scene, BARREL_CACTUS, p);
}

function drawTumbleweed(scene: Phaser.Scene) {
  const p = new Pixels(16, 16);
  for (let i = 0; i < 26; i++) {
    const a = hash(`tw:a:${i}`) / 4294967296 * Math.PI * 2;
    const b = a + 1.2 + (hash(`tw:b:${i}`) % 100) / 60;
    const r = 5 + (i % 3) * 0.7;
    p.line(8 + Math.cos(a) * r, 8 + Math.sin(a) * r, 8 + Math.cos(b) * r, 8 + Math.sin(b) * r, i % 3 ? '#a37a4a' : '#7e5a3a');
  }
  addPixels(scene, TUMBLEWEED, p);
}

/** Create every procedural desert texture once per game. */
export function ensureDesertTextures(scene: Phaser.Scene) {
  if (scene.textures.exists(DESERT_DECOR)) return;
  drawDecor(scene);
  drawPottedCactus(scene);
  drawAmphora(scene);
  drawBarrelCactus(scene);
  drawTumbleweed(scene);
  const grain = canvas(2, 1);
  grain.ctx.fillStyle = '#f0d49a';
  grain.ctx.fillRect(0, 0, 2, 1);
  scene.textures.addCanvas(SAND_GRAIN, grain.c);
}

