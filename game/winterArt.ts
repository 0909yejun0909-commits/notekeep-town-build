import Phaser from 'phaser';
import { hash } from '@/lib/types';

// Everything the snow biome draws. Kenmi's Christmas pack was never measured (docs/ASSETS.md
// only covers one snow tile sheet), so nothing here slices an unverified sheet: the base
// pack's own house and tree sprites get snow painted onto them at runtime, and the winter-only
// props are drawn from code. All of it is deterministic, so a vault always builds the same town.

const SNOW = '#eef3fa';
const SNOW_HI = '#ffffff';
const SNOW_SHADE = '#c9d7eb';
const SNOW_DIMPLE = '#dde7f3';
const OUTLINE = '#3f2832';

export const SNOW_BACKGROUND = SNOW;
export const SNOW_GROUND = 'winter-ground';
export const ICE_ROAD = 'winter-ice-road';
export const SNOW_DECOR = 'winter-decor';
// Drifts and tufts are common, rocks and holly rarer.
const SNOW_DECOR_WEIGHTED = [0, 0, 0, 1, 1, 1, 2, 3];
export function snowDecorFrame(roll: number): number {
  return SNOW_DECOR_WEIGHTED[roll % SNOW_DECOR_WEIGHTED.length];
}
export const PRESENT = 'winter-present';
export const PRESENT_FRAMES = 3;
export const SNOWMAN = 'winter-snowman';
export const CAMPFIRE = 'winter-campfire';
export const CAMPFIRE_ANIM = 'winter-campfire-burn';
export const FIRE_GLOW = 'winter-fire-glow';
export const CANDY_CANE = 'winter-candy-cane';
export const WREATH = 'winter-wreath';
export const XMAS_TREE = 'winter-xmas-tree';
const SNOWFLAKE = 'winter-snowflake';

type Rgb = [number, number, number];

function rgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext('2d', { willReadFrequently: true })! };
}

// A small palette-indexed pixel grid: shapes are stamped in, then `outline()` rings every
// filled pixel with a 1px border, which is what makes the props sit next to Kenmi's art.
class Pixels {
  readonly px: (string | null)[];
  constructor(readonly w: number, readonly h: number) {
    this.px = new Array(w * h).fill(null);
  }
  get(x: number, y: number) {
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? null : this.px[y * this.w + x];
  }
  set(x: number, y: number, c: string | null) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c;
  }
  rect(x: number, y: number, w: number, h: number, c: string) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  // Snow-lit disc: highlight up-left, shade down-right.
  ball(cx: number, cy: number, r: number, base = SNOW, hi = SNOW_HI, shade = SNOW_SHADE) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        if (dx * dx + dy * dy > r * r) continue;
        const lit = (dx + dy) / r;
        this.set(x, y, lit > 0.75 ? shade : lit < -0.95 ? hi : base);
      }
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

// Frames are numbered 0..n-1 left to right, the same names a loaded spritesheet uses.
function addStrip(scene: Phaser.Scene, key: string, c: HTMLCanvasElement, fw: number, fh: number) {
  const tex = scene.textures.addCanvas(key, c);
  if (!tex) return;
  const cols = Math.floor(c.width / fw);
  const rows = Math.floor(c.height / fh);
  for (let i = 0; i < cols * rows; i++) tex.add(i, 0, (i % cols) * fw, Math.floor(i / cols) * fh, fw, fh);
}

// ---------------------------------------------------------------- ground and roads

function drawGround(scene: Phaser.Scene) {
  const size = 64;
  const { c, ctx } = canvas(size, size);
  ctx.fillStyle = SNOW;
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const h = hash(`winter:ground:${x}:${y}`);
      if (h % 97 < 2) {
        ctx.fillStyle = SNOW_DIMPLE;
        ctx.fillRect(x, y, h % 3 === 0 ? 2 : 1, 1);
      } else if (h % 263 === 0) {
        ctx.fillStyle = SNOW_HI;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  scene.textures.addCanvas(SNOW_GROUND, c);
}

// Same frame numbers as the meadow's grass_meadow.png road set (see roadFrame() in
// game/tilemap.ts), so the road autotiler picks a frame without knowing which biome it's in.
const ROAD_SIDES: Record<number, string> = {
  80: 'nw', 81: 'n', 82: 'ne', 96: 'w', 97: '', 98: 'e', 112: 'sw', 113: 's', 114: 'se',
  128: 'SE', 129: 'SW', 144: 'NE', 145: 'NW',
};

const ICE = '#c3cdf0';
const ICE_LIGHT = '#d5dcf7';
const ICE_SHADE = '#afbae6';
const ICE_JOINT = '#e6ebfb';
const ICE_EDGE = '#8a98d2';

function iceBrick(x: number, y: number): string {
  const row = y >> 2;
  const bx = (x + (row % 2) * 4) % 8;
  const by = y % 4;
  if (by === 3 || bx === 7) return ICE_JOINT;
  if ((x * 7 + y * 13) % 37 === 0) return SNOW_HI;
  if (by === 0) return ICE_LIGHT;
  if (by === 2 && bx >= 4) return ICE_SHADE;
  return ICE;
}

function isSnowInRoadTile(sides: string, x: number, y: number): boolean {
  const n = sides.includes('n'), s = sides.includes('s'), w = sides.includes('w'), e = sides.includes('e');
  if ((n && y < 3) || (s && y > 12) || (w && x < 3) || (e && x > 12)) return true;
  const round = (cx: number, cy: number) => (x - cx) ** 2 + (y - cy) ** 2 > 3.5 ** 2;
  if (n && w && x < 6 && y < 6 && round(6, 6)) return true;
  if (n && e && x > 9 && y < 6 && round(9, 6)) return true;
  if (s && w && x < 6 && y > 9 && round(6, 9)) return true;
  if (s && e && x > 9 && y > 9 && round(9, 9)) return true;
  const inner = (cx: number, cy: number) => (x - cx) ** 2 + (y - cy) ** 2 < 3.9 ** 2;
  if (sides === 'SE') return x > 12 && y > 12 && inner(16, 16);
  if (sides === 'SW') return x < 3 && y > 12 && inner(-1, 16);
  if (sides === 'NE') return x > 12 && y < 3 && inner(16, -1);
  if (sides === 'NW') return x < 3 && y < 3 && inner(-1, -1);
  return false;
}

function drawIceRoad(scene: Phaser.Scene) {
  const frames = Object.keys(ROAD_SIDES).map(Number);
  const { c, ctx } = canvas(frames.length * 16, 16);
  const tex = scene.textures.addCanvas(ICE_ROAD, c);
  frames.forEach((frame, i) => {
    const sides = ROAD_SIDES[frame];
    const snow = (x: number, y: number) => x >= 0 && y >= 0 && x < 16 && y < 16 && isSnowInRoadTile(sides, x, y);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        let color: string;
        if (snow(x, y)) {
          let nearIce = false;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < 16 && ny < 16 && !snow(nx, ny)) nearIce = true;
          }
          color = nearIce ? SNOW_DIMPLE : SNOW;
        } else {
          let nearSnow = false;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (snow(x + dx, y + dy)) nearSnow = true;
          color = nearSnow ? ICE_EDGE : iceBrick(x, y);
        }
        ctx.fillStyle = color;
        ctx.fillRect(i * 16 + x, y, 1, 1);
      }
    }
    tex?.add(frame, 0, i * 16, 0, 16, 16);
  });
  tex?.refresh();
}

// ---------------------------------------------------------------- props

function drawDecor(scene: Phaser.Scene) {
  const { c, ctx } = canvas(16 * 4, 16);

  // 0: snow drift
  const drift = new Pixels(16, 16);
  for (let y = 9; y < 15; y++) {
    for (let x = 1; x < 15; x++) {
      const dx = (x + 0.5 - 8) / 6.5, dy = (y + 0.5 - 15) / 5;
      if (dx * dx + dy * dy <= 1) drift.set(x, y, y < 11 ? SNOW_HI : y > 12 ? SNOW_SHADE : SNOW);
    }
  }
  drift.draw(ctx, 0, 0);

  // 1: frosted grass tuft
  const tuft = new Pixels(16, 16);
  const blade = '#5f9486', bladeDark = '#3f6e62';
  [[5, 9], [7, 7], [9, 8], [11, 10]].forEach(([x, top], i) => {
    for (let y = top; y < 14; y++) tuft.set(x + (y < top + 2 && i % 2 ? 1 : 0), y, y === top ? SNOW_HI : i % 2 ? bladeDark : blade);
  });
  tuft.rect(4, 13, 9, 2, SNOW);
  tuft.rect(5, 14, 7, 1, SNOW_SHADE);
  tuft.draw(ctx, 16, 0);

  // 2: stone with a snow cap
  const rock = new Pixels(16, 16);
  rock.ball(8, 11.5, 3.6, '#828fab', '#a3aec6', '#525f7a');
  rock.rect(5, 8, 6, 2, SNOW);
  rock.rect(6, 8, 3, 1, SNOW_HI);
  rock.outline('#262b44');
  rock.draw(ctx, 32, 0);

  // 3: holly sprig
  const holly = new Pixels(16, 16);
  holly.map(
    [
      '..ll....LL..',
      '.lllL..LLll.',
      'lllLL..LLlll',
      '.llLLrrLLll.',
      '..l.rRrr.l..',
      '.....rr.....',
    ],
    { l: '#3e8948', L: '#265c42', r: '#e83b3b', R: '#ff8a8a' },
    2,
    7,
  );
  holly.outline('#1c3a2a');
  holly.draw(ctx, 48, 0);

  addStrip(scene, SNOW_DECOR, c, 16, 16);
}

function drawPresents(scene: Phaser.Scene) {
  const rows = [
    '................',
    '................',
    '.....oo..oo.....',
    '....orroorro....',
    '....oRrrrrRo....',
    '.oooooooooooooo.',
    '.oLLLLLrrLLLLLo.',
    '.oBBBBBRRBBBBBo.',
    '.oooooooooooooo.',
    '..obbbbrrbbbbo..',
    '..obbbbrrbbbbo..',
    '..obbbbrrbbbbo..',
    '..oBBBBRRBBBBo..',
    '..obbbbrrbbbbo..',
    '..oBBBBRRBBBBo..',
    '..oooooooooooo..',
  ];
  const variants: Record<string, string>[] = [
    { b: '#b4202a', B: '#73172d', L: '#e83b3b', r: '#ffc825', R: '#e08a2b' },
    { b: '#3e8948', B: '#265c42', L: '#63c74d', r: '#e83b3b', R: '#b4202a' },
    { b: '#3e6fb0', B: '#2a4a80', L: '#5a8fd6', r: '#f4f4f4', R: '#c0cbdc' },
  ];
  const { c, ctx } = canvas(16 * PRESENT_FRAMES, 16);
  variants.forEach((v, i) => {
    const p = new Pixels(16, 16);
    p.map(rows, { ...v, o: OUTLINE });
    p.draw(ctx, i * 16, 0);
  });
  addStrip(scene, PRESENT, c, 16, 16);
}

function drawSnowman(scene: Phaser.Scene) {
  const p = new Pixels(16, 28);
  p.ball(8, 21.5, 5.5);
  p.ball(8, 13.5, 4.2);
  p.ball(8, 7, 3.3);
  p.rect(5, 1, 6, 3, '#2b2b2b');
  p.rect(5, 3, 6, 1, '#b4202a');
  p.rect(4, 4, 8, 1, '#2b2b2b');
  p.outline();
  p.set(7, 6, '#2b2b2b');
  p.set(9, 6, '#2b2b2b');
  p.set(8, 8, '#fb6b1d');
  p.set(9, 8, '#e08a2b');
  p.rect(5, 10, 7, 1, '#b4202a');
  p.rect(9, 11, 2, 2, '#b4202a');
  p.set(8, 14, '#2b2b2b');
  p.set(8, 16, '#2b2b2b');
  const stick = '#6d483b';
  [[3, 13], [2, 12], [1, 11], [12, 13], [13, 12], [14, 11]].forEach(([x, y]) => p.set(x, y, stick));
  p.set(0, 10, stick);
  p.set(15, 10, stick);
  const { c, ctx } = canvas(16, 28);
  p.draw(ctx);
  scene.textures.addCanvas(SNOWMAN, c);
}

function drawCampfire(scene: Phaser.Scene) {
  const frames = 3;
  const { c, ctx } = canvas(16 * frames, 16);
  for (let f = 0; f < frames; f++) {
    const base = new Pixels(16, 16);
    base.rect(3, 11, 10, 2, '#6d483b');
    base.rect(4, 10, 8, 1, '#91533b');
    base.set(3, 11, '#b86f50');
    base.set(12, 12, '#b86f50');
    [2, 5, 8, 11, 13].forEach((x, i) => base.ball(x + 0.5, 13.5 + (i % 2) * 0.5, 1.6, '#828fab', '#a3aec6', '#525f7a'));
    base.outline();

    const flame = new Pixels(16, 16);
    for (let y = 2; y <= 11; y++) {
      const t = (y - 1) / 10;
      const jitter = (hash(`fire:${f}:${y}`) % 3) - 1;
      const half = Math.max(0, Math.round(t * 3.6 + (y > 4 ? jitter * 0.5 : 0)));
      const sway = y < 7 ? ((hash(`sway:${f}:${y}`) % 3) - 1) : 0;
      for (let x = 8 - half + sway; x <= 7 + half + sway + (y === 2 ? 1 : 0); x++) {
        const d = Math.min(x - (8 - half + sway), 7 + half + sway - x);
        flame.set(x, y, d >= 2 && y > 5 ? '#fff4a8' : d >= 1 && y > 3 ? '#ffc825' : '#fb6b1d');
      }
    }
    const spark = hash(`spark:${f}`);
    flame.set(4 + (spark % 8), spark % 2, '#ffc825');
    base.draw(ctx, f * 16, 0);
    flame.draw(ctx, f * 16, 0);
  }
  addStrip(scene, CAMPFIRE, c, 16, 16);
  scene.anims.create({
    key: CAMPFIRE_ANIM,
    frames: scene.anims.generateFrameNumbers(CAMPFIRE, { start: 0, end: frames - 1 }),
    frameRate: 7,
    repeat: -1,
  });

  const g = canvas(64, 64);
  const grad = g.ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255, 150, 50, 0.42)');
  grad.addColorStop(0.5, 'rgba(255, 140, 40, 0.16)');
  grad.addColorStop(1, 'rgba(255, 120, 30, 0)');
  g.ctx.fillStyle = grad;
  g.ctx.fillRect(0, 0, 64, 64);
  scene.textures.addCanvas(FIRE_GLOW, g.c);
}

function drawCandyCane(scene: Phaser.Scene) {
  const p = new Pixels(16, 32);
  const stripe = (x: number, y: number, shade: boolean) =>
    ((x + y) >> 1) % 2 ? (shade ? '#a11f2a' : '#d62f3a') : shade ? '#c9d2e3' : '#f4f4f4';
  for (let y = 9; y <= 29; y++) {
    p.set(7, y, stripe(7, y, false));
    p.set(8, y, stripe(8, y, true));
  }
  for (let y = 4; y <= 11; y++) {
    for (let x = 6; x <= 14; x++) {
      const dx = x + 0.5 - 10.5, dy = y + 0.5 - 9;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 1.6 || d > 3.4) continue;
      if (y + 0.5 <= 9 || (x + 0.5 > 10.5 && y <= 10)) p.set(x, y, stripe(x, y, dx > 1.5));
    }
  }
  p.ball(8, 30, 3.2);
  p.outline();
  p.map(['l..l', 'lrrl', '.rr.'], { l: '#3e8948', r: '#b4202a' }, 6, 12);
  const { c, ctx } = canvas(16, 32);
  p.draw(ctx);
  scene.textures.addCanvas(CANDY_CANE, c);
}

function drawWreath(scene: Phaser.Scene) {
  const size = 13;
  const p = new Pixels(size, size);
  const cx = 6.5, cy = 6.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d < 2.4 || d > 5.4) continue;
      const h = hash(`wreath:${x}:${y}`);
      p.set(x, y, h % 9 === 0 ? '#e83b3b' : x + y > 13 ? '#265c42' : h % 3 === 0 ? '#63c74d' : '#3e8948');
    }
  }
  p.outline('#1c3a2a');
  p.map(['r.r', '.R.', 'r.r'], { r: '#e83b3b', R: '#b4202a' }, 5, 9);
  const { c, ctx } = canvas(size, size);
  p.draw(ctx);
  scene.textures.addCanvas(WREATH, c);
}

// ---------------------------------------------------------------- snow on Kenmi's sprites

type SnowCap = {
  cap: number;         // snow thickness on every upward-facing top edge, in px
  drip: number;        // extra px some columns hang down, so the lower edge isn't ruler-straight
  frost: number;       // 0-1 blend of every pixel toward pale blue
  foliageFrost: number; // 0-1 blend of green pixels toward pale blue
  tiers: boolean;      // also cap foliage that sits under a dark outline (spruce layers)
};

const FROST: Rgb = [226, 236, 248];

function isFoliage(r: number, g: number, b: number) {
  return g > r + 10 && g + 12 >= b;
}

function snowOn(data: ImageData, o: SnowCap, seed: string) {
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

function imageData(scene: Phaser.Scene, key: string, sx = 0, sy = 0, sw?: number, sh?: number) {
  const src = scene.textures.get(key).getSourceImage() as CanvasImageSource & { width: number; height: number };
  const w = sw ?? src.width, h = sh ?? src.height;
  const { c, ctx } = canvas(w, h);
  ctx.drawImage(src, sx, sy, w, h, 0, 0, w, h);
  return { c, ctx, data: ctx.getImageData(0, 0, w, h) };
}

const HOUSE_SNOW: SnowCap = { cap: 5, drip: 3, frost: 0.08, foliageFrost: 0.2, tiers: false };
const TREE_SNOW: SnowCap = { cap: 3, drip: 2, frost: 0.1, foliageFrost: 0.32, tiers: true };

function snowyCopy(scene: Phaser.Scene, key: string, cap: SnowCap, frame?: [number, number]): string {
  const snowKey = `${key}-snow`;
  if (scene.textures.exists(snowKey) || !scene.textures.exists(key)) {
    return scene.textures.exists(snowKey) ? snowKey : key;
  }
  const { c, ctx, data } = imageData(scene, key);
  snowOn(data, cap, key);
  ctx.putImageData(data, 0, 0);
  if (frame) addStrip(scene, snowKey, c, frame[0], frame[1]);
  else scene.textures.addCanvas(snowKey, c);
  return snowKey;
}

/** The snowed-on version of a single-image texture (houses). Falls back to `key` if it's missing. */
export function snowyHouse(scene: Phaser.Scene, key: string): string {
  return snowyCopy(scene, key, HOUSE_SNOW);
}

/** The snowed-on version of a 32x48 tree sheet, same frame numbers. */
export function snowyTree(scene: Phaser.Scene, key: 'tree-oak' | 'tree-spruce'): string {
  return snowyCopy(scene, key, TREE_SNOW, [32, 48]);
}

// A spruce frame, lightly snowed, hung with baubles and topped with a star. Drawn 32x52: the
// extra 4px on top is headroom for the star, so it's placed with the same origin(0, 1) as trees.
function drawXmasTree(scene: Phaser.Scene) {
  if (!scene.textures.exists('tree-spruce')) return;
  const head = 4;
  const { data } = imageData(scene, 'tree-spruce', 32, 0, 32, 48);
  snowOn(data, { cap: 2, drip: 0, frost: 0.04, foliageFrost: 0.06, tiers: true }, 'xmas');
  const { c, ctx } = canvas(32, 48 + head);
  ctx.putImageData(data, 0, head);

  const out = ctx.getImageData(0, 0, 32, 48 + head);
  const px = out.data;
  const at = (x: number, y: number) => (y * 32 + x) * 4;
  const baubles = ['#e83b3b', '#ffc825', '#5a8fd6', '#f5a0c8', '#f4f4f4'];
  let topY = -1, topX = 16;
  for (let y = 0; y < 48 + head && topY < 0; y++) {
    const xs: number[] = [];
    for (let x = 8; x < 24; x++) if (px[at(x, y) + 3] > 40) xs.push(x);
    if (xs.length) {
      topY = y;
      topX = Math.round((xs[0] + xs[xs.length - 1]) / 2);
    }
  }
  for (let y = head; y < 48 + head; y++) {
    for (let x = 1; x < 31; x++) {
      const i = at(x, y);
      if (!px[i + 3] || !isFoliage(px[i], px[i + 1], px[i + 2])) continue;
      const h = hash(`bauble:${x}:${y}`);
      if (h % 19 !== 0) continue;
      const [r, g, b] = rgb(baubles[h % baubles.length]);
      px[i] = r; px[i + 1] = g; px[i + 2] = b;
    }
  }
  ctx.putImageData(out, 0, 0);
  if (topY >= 0) {
    const star = new Pixels(5, 5);
    star.map(['..y..', '.yYy.', 'yYYYy', '.yYy.', '.y.y.'], { y: '#ffc825', Y: '#fff4a8' });
    star.draw(ctx, topX - 2, Math.max(0, topY - 3));
  }
  scene.textures.addCanvas(XMAS_TREE, c);
}

/** Create every procedural winter texture and animation once per game. */
export function ensureWinterTextures(scene: Phaser.Scene) {
  if (scene.textures.exists(SNOW_GROUND)) return;
  drawGround(scene);
  drawIceRoad(scene);
  drawDecor(scene);
  drawPresents(scene);
  drawSnowman(scene);
  drawCampfire(scene);
  drawCandyCane(scene);
  drawWreath(scene);
  drawXmasTree(scene);
  const flake = canvas(2, 2);
  flake.ctx.fillStyle = SNOW_HI;
  flake.ctx.fillRect(0, 0, 2, 2);
  scene.textures.addCanvas(SNOWFLAKE, flake.c);
}

/** Snow drifting down over the camera, fixed to the screen, not the world. */
export function startSnowfall(scene: Phaser.Scene) {
  const cam = scene.cameras.main;
  const zone = new Phaser.Geom.Rectangle(-40, -10, cam.width + 80, 4);
  const emitter = scene.add.particles(0, 0, SNOWFLAKE, {
    emitZone: { type: 'random', source: zone } as Phaser.Types.GameObjects.Particles.EmitZoneData,
    lifespan: 30000,
    speedY: { min: 14, max: 26 },
    speedX: { min: -10, max: 6 },
    scale: { min: 0.5, max: 1 },
    alpha: { min: 0.55, max: 0.95 },
    frequency: Math.max(40, Math.round(60000 / cam.width)),
    advance: 30000,
  });
  emitter.setScrollFactor(0).setDepth(1_000_000);
  const onResize = () => {
    if (!emitter.scene) return;
    zone.width = cam.width + 80;
    emitter.setFrequency(Math.max(40, Math.round(60000 / cam.width)));
  };
  const stop = () => scene.scale.off(Phaser.Scale.Events.RESIZE, onResize);
  scene.scale.on(Phaser.Scale.Events.RESIZE, onResize);
  emitter.once(Phaser.GameObjects.Events.DESTROY, stop);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, stop);
  return emitter;
}
