import Phaser from 'phaser';
import type { TownBiome } from '@/lib/types';
import { hash } from '@/lib/types';

// A town biome is a reskin: every generator places the same things on the same tiles in every
// biome (study-session guests must agree on what blocks), and only the art changes. skin()
// turns any loaded texture into its biome version on first use, keeping every frame, so the
// generators keep addressing Kenmi's sheets by their usual keys and frame numbers.
//
//   ground  grass greens -> snow or sand, the sand path -> ice bricks or sandstone slabs
//   water   frozen over in snow; left alone in the desert (an oasis keeps its green fringe)
//   sprites snow caps and frost in snow; dried-out, olive vegetation in the desert
//
// Kenmi's Christmas and desert packs were never measured (docs/ASSETS.md), so nothing here
// slices them; the biome-only props are drawn in code (game/winterArt.ts, game/desertArt.ts).

export type Rgb = [number, number, number];

export function rgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext('2d', { willReadFrequently: true })! };
}

export const OUTLINE = '#3f2832';

// A small palette-indexed pixel grid: shapes are stamped in, then `outline()` rings every
// filled pixel with a 1px border, which is what makes the props sit next to Kenmi's art.
export class Pixels {
  readonly px: (string | null)[];
  constructor(readonly w: number, readonly h: number) {
    this.px = new Array(w * h).fill(null);
  }
  get(x: number, y: number) {
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? null : this.px[y * this.w + x];
  }
  set(x: number, y: number, c: string | null) {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c;
  }
  rect(x: number, y: number, w: number, h: number, c: string) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  // Lit disc: highlight up-left, shade down-right.
  ball(cx: number, cy: number, r: number, base: string, hi: string, shade: string, ry = r) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy > 1) continue;
        const lit = dx + dy;
        this.set(x, y, lit > 0.75 ? shade : lit < -0.95 ? hi : base);
      }
    }
  }
  line(x0: number, y0: number, x1: number, y1: number, c: string, width = 1) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n;
      for (let w = 0; w < width; w++) this.set(Math.floor(x) + w, Math.floor(y), c);
    }
  }
  map(rows: string[], palette: Record<string, string>, ox = 0, oy = 0) {
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const c = palette[row[x]];
        if (c) this.set(ox + x, oy + y, c);
      }
    });
  }
  outline(c = OUTLINE) {
    const edge: number[] = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y)) continue;
        if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) edge.push(y * this.w + x);
      }
    }
    for (const i of edge) this.px[i] = c;
  }
  draw(ctx: CanvasRenderingContext2D, ox = 0, oy = 0) {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const c = this.px[y * this.w + x];
        if (!c) continue;
        ctx.fillStyle = c;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  }
}

// Frames are numbered 0..n-1 left to right, top to bottom, the names a loaded spritesheet uses.
export function addStrip(scene: Phaser.Scene, key: string, c: HTMLCanvasElement, fw: number, fh: number) {
  const tex = scene.textures.addCanvas(key, c);
  if (!tex) return;
  const cols = Math.floor(c.width / fw);
  const rows = Math.floor(c.height / fh);
  for (let i = 0; i < cols * rows; i++) tex.add(i, 0, (i % cols) * fw, Math.floor(i / cols) * fh, fw, fh);
}

// Draw a single Pixels grid as a one-frame texture.
export function addPixels(scene: Phaser.Scene, key: string, p: Pixels) {
  const { c, ctx } = canvas(p.w, p.h);
  p.draw(ctx);
  scene.textures.addCanvas(key, c);
}

// ---------------------------------------------------------------- recolouring

type Ramp = Rgb[];
const ramp = (...hex: string[]): Ramp => hex.map(rgb);

function sample(r: Ramp, t: number): Rgb {
  const x = Math.max(0, Math.min(1, t)) * (r.length - 1);
  const i = Math.min(r.length - 2, Math.floor(x));
  const f = x - i;
  return [0, 1, 2].map((k) => Math.round(r[i][k] + (r[i + 1][k] - r[i][k]) * f)) as Rgb;
}

function hsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

// A path pattern nudges a recoloured path pixel lighter (+) or darker (-) by its position in
// its 16x16 tile, so the plain sand path reads as laid bricks or slabs.
type Pattern = (x: number, y: number) => number;

const iceBricks: Pattern = (x, y) => {
  const by = y % 4, bx = (x + ((y >> 2) % 2) * 4) % 8;
  if (by === 3 || bx === 7) return 0.3;
  if (by === 0) return 0.1;
  if (by === 2 && bx >= 4) return -0.12;
  return 0;
};

const sandstoneSlabs: Pattern = (x, y) => {
  const by = y % 8, bx = (x + ((y >> 3) % 2) * 4) % 8;
  if (by === 7 || bx === 7) return -0.28;
  if (by === 0 || bx === 0) return 0.1;
  return 0;
};

type Recolor = {
  green?: Ramp;
  path?: { ramp: Ramp; pattern?: Pattern };
  water?: Ramp;
  grey?: { to: Rgb; t: number };
};

function recolor(data: ImageData, o: Recolor) {
  const { width: w } = data;
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    if (!px[i + 3]) continue;
    const [h, s, l] = hsl(px[i], px[i + 1], px[i + 2]);
    let out: Rgb | null = null;
    if (o.green && h >= 70 && h <= 175 && s > 0.15 && l > 0.08) {
      out = sample(o.green, (l - 0.15) / 0.42);
    } else if (o.path && h >= 12 && h <= 50 && s > 0.3 && l > 0.42) {
      const p = (i / 4) % w, q = Math.floor(i / 4 / w);
      out = sample(o.path.ramp, (l - 0.45) / 0.35 + (o.path.pattern?.(p % 16, q % 16) ?? 0));
    } else if (o.water && h >= 180 && h <= 220 && s > 0.35) {
      out = sample(o.water, (l - 0.3) / 0.45);
    } else if (o.grey && s < 0.3 && l > 0.2 && l < 0.85) {
      const { to, t } = o.grey;
      out = [0, 1, 2].map((k) => Math.round(px[i + k] + (to[k] - px[i + k]) * t)) as Rgb;
    }
    if (out) [px[i], px[i + 1], px[i + 2]] = out;
  }
}

const SNOW_RAMP = ramp('#8fa5c9', '#b8c9e2', '#d6e2f1', '#eef3fa', '#ffffff');
const ICE_RAMP = ramp('#7d8cc8', '#a9b6e6', '#c3cdf0', '#d5dcf7');
const POND_ICE = ramp('#7fb4dc', '#a6d2ee', '#c8e6f7', '#e4f3fb');
const SAND_RAMP = ramp('#b98a4e', '#d4a867', '#e6c283', '#f3d9a4', '#fbe9c3');
const SANDSTONE = ramp('#7e4c31', '#a86c45', '#c98f5a', '#dda674');
const DRY_RAMP = ramp('#4a4122', '#6e6232', '#9c8a45', '#c2b060', '#d9cd84');

// ---------------------------------------------------------------- snow on sprites

export type SnowCap = {
  cap: number;          // snow thickness on every upward-facing top edge, in px
  drip: number;         // extra px some columns hang down, so the lower edge isn't ruler-straight
  frost: number;        // 0-1 blend of every pixel toward pale blue
  foliageFrost: number; // 0-1 blend of green pixels toward pale blue
  tiers: boolean;       // also cap foliage that sits under a dark outline (spruce layers)
};

const FROST: Rgb = [226, 236, 248];
export const SNOW_HI = '#ffffff';
export const SNOW = '#eef3fa';
export const SNOW_SHADE = '#c9d7eb';

export function isFoliage(r: number, g: number, b: number) {
  return g > r + 10 && g + 12 >= b;
}

export function snowOn(data: ImageData, o: SnowCap, seed: string) {
  const { width: w, height: h } = data;
  const px = data.data;
  const src = new Uint8ClampedArray(px);
  const at = (x: number, y: number) => (y * w + x) * 4;
  const opaque = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && src[at(x, y) + 3] > 40;
  const lum = (x: number, y: number) => {
    const i = at(x, y);
    return (0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2]) / 255;
  };
  const leafy = (x: number, y: number) => {
    const i = at(x, y);
    return isFoliage(src[i], src[i + 1], src[i + 2]);
  };
  const paint = (x: number, y: number, [r, g, b]: Rgb) => {
    const i = at(x, y);
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
  };

  for (let i = 0; i < px.length; i += 4) {
    if (!px[i + 3]) continue;
    const t = isFoliage(px[i], px[i + 1], px[i + 2]) ? o.foliageFrost : o.frost;
    for (let k = 0; k < 3; k++) px[i + k] = px[i + k] + (FROST[k] - px[i + k]) * t;
  }

  const hi = rgb(SNOW_HI), mid = rgb(SNOW), shade = rgb(SNOW_SHADE);
  for (let x = 0; x < w; x++) {
    const drip = [0, 0, 1, 0, 2, 1, 0, 0][hash(`${seed}:${x}`) % 8] * (o.drip / 2);
    for (let y = 0; y < h; y++) {
      if (!opaque(x, y)) continue;
      const top = !opaque(x, y - 1);
      const tier = o.tiers && !top && leafy(x, y) && lum(x, y - 1) < 0.3 && lum(x, y) - lum(x, y - 1) > 0.12;
      if (!top && !tier) continue;
      // Keep a dark outline pixel as the snow's own outline and start the snow beneath it.
      const start = top && lum(x, y) < 0.3 && opaque(x, y + 1) ? y + 1 : y;
      const depth = tier ? Math.max(1, o.cap - 1) : Math.round(o.cap + drip);
      for (let k = 0; k < depth; k++) {
        const yy = start + k;
        if (yy >= h || !opaque(x, yy) || (tier && !leafy(x, yy))) break;
        paint(x, yy, k === depth - 1 && depth > 1 ? shade : k === 0 ? hi : mid);
      }
    }
  }
}

export const HOUSE_SNOW: SnowCap = { cap: 5, drip: 3, frost: 0.08, foliageFrost: 0.2, tiers: false };
export const TREE_SNOW: SnowCap = { cap: 3, drip: 2, frost: 0.12, foliageFrost: 0.45, tiers: true };
const PLANT_SNOW: SnowCap = { cap: 2, drip: 1, frost: 0.1, foliageFrost: 0.4, tiers: true };
const PROP_SNOW: SnowCap = { cap: 2, drip: 1, frost: 0.08, foliageFrost: 0.3, tiers: false };

// ---------------------------------------------------------------- the skin table

type Transform = { perFrame: boolean; apply: (d: ImageData, seed: string) => void };

const GROUND = new Set([
  'terrain-grass', 'grass-edges', 'grass-2', 'grass-3', 'grass-4',
  'fill-grass-2', 'fill-grass-3', 'fill-grass-4', 'path-decor', 'cobble-edges',
]);
const PLANT = /^(decor|grass-anim-\d|flower-grass-\d|flower-anim-\d|flowers|cattail-\d)$/;

function transformFor(biome: TownBiome, key: string): Transform | null {
  const recolorWith = (o: Recolor): Transform => ({ perFrame: false, apply: (d) => recolor(d, o) });
  const capWith = (o: SnowCap): Transform => ({ perFrame: true, apply: (d, seed) => snowOn(d, o, seed) });

  if (biome === 'snow') {
    if (GROUND.has(key)) {
      return recolorWith({
        green: SNOW_RAMP,
        path: { ramp: ICE_RAMP, pattern: iceBricks },
        grey: { to: [214, 224, 240], t: 0.3 },
      });
    }
    if (key === 'water-anim') return recolorWith({ green: SNOW_RAMP, water: POND_ICE, path: { ramp: SNOW_RAMP } });
    if (key.startsWith('house-')) return capWith(HOUSE_SNOW);
    if (key.startsWith('tree-')) return capWith(TREE_SNOW);
    if (PLANT.test(key)) return capWith(PLANT_SNOW);
    return capWith(PROP_SNOW);
  }
  if (biome === 'desert') {
    if (GROUND.has(key)) {
      return recolorWith({
        green: SAND_RAMP,
        path: { ramp: SANDSTONE, pattern: sandstoneSlabs },
        grey: { to: [217, 174, 107], t: 0.35 },
      });
    }
    if (PLANT.test(key)) return recolorWith({ green: DRY_RAMP });
  }
  return null;
}

/** `key`'s version for `biome`, built on first use. Unchanged keys come back as they are. */
export function skin(scene: Phaser.Scene, biome: TownBiome, key: string): string {
  if (biome === 'forest' || !scene.textures.exists(key)) return key;
  const out = `${key}@${biome}`;
  if (scene.textures.exists(out)) return out;
  const t = transformFor(biome, key);
  if (!t) return key;

  const src = scene.textures.get(key);
  const img = src.getSourceImage() as CanvasImageSource & { width: number; height: number };
  const { c, ctx } = canvas(img.width, img.height);
  ctx.drawImage(img, 0, 0);
  const names = src.getFrameNames();
  if (t.perFrame && names.length > 0) {
    const done = new Set<string>();
    for (const name of names) {
      const f = src.get(name);
      const rect = `${f.cutX},${f.cutY},${f.cutWidth},${f.cutHeight}`;
      if (done.has(rect)) continue;
      done.add(rect);
      const d = ctx.getImageData(f.cutX, f.cutY, f.cutWidth, f.cutHeight);
      t.apply(d, `${key}:${name}`);
      ctx.putImageData(d, f.cutX, f.cutY);
    }
  } else {
    const d = ctx.getImageData(0, 0, img.width, img.height);
    t.apply(d, key);
    ctx.putImageData(d, 0, 0);
  }

  const tex = scene.textures.addCanvas(out, c);
  if (!tex) return key;
  for (const name of names) {
    const f = src.get(name);
    tex.add(name, 0, f.cutX, f.cutY, f.cutWidth, f.cutHeight);
  }
  return out;
}

/** An animation replayed on skin()'d textures, same frames and timing. */
export function skinAnim(scene: Phaser.Scene, biome: TownBiome, animKey: string): string {
  if (biome === 'forest') return animKey;
  const out = `${animKey}@${biome}`;
  if (scene.anims.exists(out)) return out;
  const anim = scene.anims.get(animKey);
  if (!anim) return animKey;
  const frames = anim.frames.map((f) => ({ key: skin(scene, biome, f.textureKey), frame: f.textureFrame }));
  if (frames.every((f, i) => f.key === anim.frames[i].textureKey)) return animKey;
  scene.anims.create({ key: out, frames, frameRate: anim.frameRate, repeat: anim.repeat, yoyo: anim.yoyo });
  return out;
}

export const BIOME_BACKDROP: Record<TownBiome, string> = {
  forest: '#27503a',
  snow: '#8ea2b8',
  desert: '#b98a4e',
};
