import Phaser from 'phaser';
import { hash } from '@/lib/types';
import { addPixels, addStrip, canvas, isFoliage, Pixels, rgb, SNOW, SNOW_HI, SNOW_SHADE, snowOn } from '@/game/biomeArt';

// The snow biome's own props, drawn in code. Each one stands in for something the forest town
// already puts on that tile (see game/townProps.ts and game/nature.ts), so walkability is the
// same in every biome.

export const WINTER_DECOR = 'winter-decor';
// Drifts and tufts are common, rocks and holly rarer.
const WINTER_DECOR_WEIGHTED = [0, 0, 0, 1, 1, 1, 2, 3];
export function winterDecorFrame(roll: number): number {
  return WINTER_DECOR_WEIGHTED[roll % WINTER_DECOR_WEIGHTED.length];
}
export const PRESENTS = 'winter-presents';
export const SNOWMAN = 'winter-snowman';
export const FIRE_PIT = 'winter-fire-pit';
export const FIRE_PIT_ANIM = 'winter-fire-pit-burn';
export const FIRE_GLOW = 'winter-fire-glow';
export const CANDY_CANE = 'winter-candy-cane';
export const WREATH = 'winter-wreath';
export const XMAS_TREE = 'winter-xmas-tree';
export const SNOWFLAKE = 'winter-snowflake';

// Headroom above the big spruce's frame for the star.
const XMAS_HEAD = 6;
export const XMAS_TREE_ORIGIN: [number, number] = [32 / 64, (66 + XMAS_HEAD) / (80 + XMAS_HEAD)];

function drawDecor(scene: Phaser.Scene) {
  const { c, ctx } = canvas(16 * 4, 16);

  const drift = new Pixels(16, 16);
  for (let y = 9; y < 15; y++) {
    for (let x = 1; x < 15; x++) {
      const dx = (x + 0.5 - 8) / 6.5, dy = (y + 0.5 - 15) / 5;
      if (dx * dx + dy * dy <= 1) drift.set(x, y, y < 11 ? SNOW_HI : y > 12 ? SNOW_SHADE : SNOW);
    }
  }
  drift.draw(ctx, 0, 0);

  const tuft = new Pixels(16, 16);
  const blade = '#5f9486', bladeDark = '#3f6e62';
  [[5, 9], [7, 7], [9, 8], [11, 10]].forEach(([x, top], i) => {
    for (let y = top; y < 14; y++) tuft.set(x + (y < top + 2 && i % 2 ? 1 : 0), y, y === top ? SNOW_HI : i % 2 ? bladeDark : blade);
  });
  tuft.rect(4, 13, 9, 2, SNOW);
  tuft.rect(5, 14, 7, 1, SNOW_SHADE);
  tuft.draw(ctx, 16, 0);

  const rock = new Pixels(16, 16);
  rock.ball(8, 11.5, 3.6, '#828fab', '#a3aec6', '#525f7a');
  rock.rect(5, 8, 6, 2, SNOW);
  rock.rect(6, 8, 3, 1, SNOW_HI);
  rock.outline('#262b44');
  rock.draw(ctx, 32, 0);

  const holly = new Pixels(16, 16);
  holly.map(
    ['..ll....LL..', '.lllL..LLll.', 'lllLL..LLlll', '.llLLrrLLll.', '..l.rRrr.l..', '.....rr.....'],
    { l: '#3e8948', L: '#265c42', r: '#e83b3b', R: '#ff8a8a' },
    2,
    7,
  );
  holly.outline('#1c3a2a');
  holly.draw(ctx, 48, 0);

  addStrip(scene, WINTER_DECOR, c, 16, 16);
}

// Two presents stacked, standing in for the flower barrel beside a house.
function drawPresents(scene: Phaser.Scene) {
  const box = (p: Pixels, x: number, y: number, w: number, h: number, body: string, dark: string, ribbon: string) => {
    p.rect(x, y, w, h, body);
    p.rect(x, y + h - 2, w, 2, dark);
    p.rect(x + Math.floor(w / 2) - 1, y, 2, h, ribbon);
    p.rect(x, y + 2, w, 1, ribbon);
  };
  const p = new Pixels(16, 32);
  box(p, 1, 20, 14, 11, '#b4202a', '#73172d', '#ffc825');
  box(p, 3, 11, 10, 9, '#3e8948', '#265c42', '#e83b3b');
  p.map(['o..o', 'orro', '.rr.'], { o: '#e83b3b', r: '#b4202a' }, 6, 8);
  p.rect(5, 10, 6, 1, SNOW);
  p.outline();
  addPixels(scene, PRESENTS, p);
}

function drawSnowman(scene: Phaser.Scene) {
  const p = new Pixels(16, 28);
  p.ball(8, 21.5, 5.5, SNOW, SNOW_HI, SNOW_SHADE);
  p.ball(8, 13.5, 4.2, SNOW, SNOW_HI, SNOW_SHADE);
  p.ball(8, 7, 3.3, SNOW, SNOW_HI, SNOW_SHADE);
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
  [[3, 13], [2, 12], [1, 11], [0, 10], [12, 13], [13, 12], [14, 11], [15, 10]].forEach(([x, y]) => p.set(x, y, stick));
  addPixels(scene, SNOWMAN, p);
}

function flames(p: Pixels, f: number, cx: number, baseY: number, height: number, maxHalf: number) {
  for (let y = baseY - height; y <= baseY; y++) {
    const t = (y - (baseY - height) + 1) / (height + 1);
    const jitter = (hash(`fire:${f}:${y}`) % 3) - 1;
    const half = Math.max(0, Math.round(t * maxHalf + (t > 0.3 ? jitter * 0.5 : 0)));
    const sway = t < 0.5 ? (hash(`sway:${f}:${y}`) % 3) - 1 : 0;
    const x0 = cx - half + sway, x1 = cx - 1 + half + sway + (half === 0 ? 1 : 0);
    for (let x = x0; x <= x1; x++) {
      const d = Math.min(x - x0, x1 - x);
      p.set(x, y, d >= 2 && t > 0.45 ? '#fff4a8' : d >= 1 && t > 0.2 ? '#ffc825' : '#fb6b1d');
    }
  }
}

// A stone ring with a crackling fire, the size of the well it replaces (2x2 tiles).
function drawFirePit(scene: Phaser.Scene) {
  const frames = 3;
  const { c, ctx } = canvas(32 * frames, 32);
  for (let f = 0; f < frames; f++) {
    const base = new Pixels(32, 32);
    base.ball(16, 24, 11, '#e6edf6', '#ffffff', '#c9d7eb', 5);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      base.ball(16 + Math.cos(a) * 10, 24 + Math.sin(a) * 4.5, 2.1, '#828fab', '#a3aec6', '#525f7a', 1.8);
    }
    base.line(8, 26, 23, 20, '#6d483b', 2);
    base.line(9, 20, 24, 26, '#91533b', 2);
    base.outline();
    const fire = new Pixels(32, 32);
    flames(fire, f, 16, 23, 13, 5);
    const spark = hash(`pit-spark:${f}`);
    fire.set(12 + (spark % 9), 3 + (spark % 4), '#ffc825');
    fire.set(10 + ((spark >> 3) % 12), 6 + ((spark >> 5) % 3), '#fb6b1d');
    base.draw(ctx, f * 32, 0);
    fire.draw(ctx, f * 32, 0);
  }
  addStrip(scene, FIRE_PIT, c, 32, 32);
  scene.anims.create({
    key: FIRE_PIT_ANIM,
    frames: scene.anims.generateFrameNumbers(FIRE_PIT, { start: 0, end: frames - 1 }),
    frameRate: 7,
    repeat: -1,
  });

  const g = canvas(96, 96);
  const grad = g.ctx.createRadialGradient(48, 48, 0, 48, 48, 48);
  grad.addColorStop(0, 'rgba(255, 150, 50, 0.42)');
  grad.addColorStop(0.5, 'rgba(255, 140, 40, 0.16)');
  grad.addColorStop(1, 'rgba(255, 120, 30, 0)');
  g.ctx.fillStyle = grad;
  g.ctx.fillRect(0, 0, 96, 96);
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
  p.ball(8, 30, 3.2, SNOW, SNOW_HI, SNOW_SHADE);
  p.outline();
  p.map(['l..l', 'lrrl', '.rr.'], { l: '#3e8948', r: '#b4202a' }, 6, 12);
  addPixels(scene, CANDY_CANE, p);
}

function drawWreath(scene: Phaser.Scene) {
  const size = 13;
  const p = new Pixels(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - 6.5, y + 0.5 - 6.5);
      if (d < 2.4 || d > 5.4) continue;
      const h = hash(`wreath:${x}:${y}`);
      p.set(x, y, h % 9 === 0 ? '#e83b3b' : x + y > 13 ? '#265c42' : h % 3 === 0 ? '#63c74d' : '#3e8948');
    }
  }
  p.outline('#1c3a2a');
  p.map(['r.r', '.R.', 'r.r'], { r: '#e83b3b', R: '#b4202a' }, 5, 9);
  addPixels(scene, WREATH, p);
}

// The big spruce, lightly snowed, hung with baubles and a garland and topped with a star.
function drawXmasTree(scene: Phaser.Scene) {
  if (!scene.textures.exists('tree-big-spruce')) return;
  const src = scene.textures.get('tree-big-spruce');
  const frame = src.has('1') ? src.get('1') : src.get();
  const img = src.getSourceImage() as CanvasImageSource;
  const fw = frame.cutWidth, fh = frame.cutHeight;
  const { c, ctx } = canvas(fw, fh + XMAS_HEAD);
  ctx.drawImage(img, frame.cutX, frame.cutY, fw, fh, 0, XMAS_HEAD, fw, fh);
  const data = ctx.getImageData(0, 0, fw, fh + XMAS_HEAD);
  snowOn(data, { cap: 2, drip: 0, frost: 0.04, foliageFrost: 0.06, tiers: true }, 'xmas');

  const px = data.data;
  const at = (x: number, y: number) => (y * fw + x) * 4;
  const baubles = ['#e83b3b', '#ffc825', '#5a8fd6', '#f5a0c8', '#f4f4f4'];
  let topY = -1, topX = fw / 2;
  for (let y = 0; y < fh + XMAS_HEAD && topY < 0; y++) {
    const xs: number[] = [];
    for (let x = fw / 4; x < (fw * 3) / 4; x++) if (px[at(x, y) + 3] > 40) xs.push(x);
    if (xs.length) {
      topY = y;
      topX = Math.round((xs[0] + xs[xs.length - 1]) / 2);
    }
  }
  const paint = (x: number, y: number, hex: string) => {
    const i = at(x, y);
    [px[i], px[i + 1], px[i + 2]] = rgb(hex);
  };
  for (let y = XMAS_HEAD; y < fh + XMAS_HEAD; y++) {
    for (let x = 1; x < fw - 1; x++) {
      const i = at(x, y);
      if (!px[i + 3] || !isFoliage(px[i], px[i + 1], px[i + 2])) continue;
      // A gold garland winding down the tree, and baubles scattered over it.
      if (topY >= 0 && Math.abs(((y - topY) * 1.1 + (x - topX) * 0.55) % 14) < 1) paint(x, y, '#ffc825');
      else {
        const h = hash(`bauble:${x}:${y}`);
        if (h % 17 === 0) paint(x, y, baubles[h % baubles.length]);
      }
    }
  }
  ctx.putImageData(data, 0, 0);
  if (topY >= 0) {
    const star = new Pixels(7, 7);
    star.map(['...y...', '..yYy..', 'yyYYYyy', '.yYYYy.', '..yYy..', '.yy.yy.', '.y...y.'], { y: '#ffc825', Y: '#fff4a8' });
    star.draw(ctx, topX - 3, Math.max(0, topY - 4));
  }
  scene.textures.addCanvas(XMAS_TREE, c);
}

/** Create every procedural winter texture and animation once per game. */
export function ensureWinterTextures(scene: Phaser.Scene) {
  if (scene.textures.exists(WINTER_DECOR)) return;
  drawDecor(scene);
  drawPresents(scene);
  drawSnowman(scene);
  drawFirePit(scene);
  drawCandyCane(scene);
  drawWreath(scene);
  drawXmasTree(scene);
  const flake = canvas(2, 2);
  flake.ctx.fillStyle = SNOW_HI;
  flake.ctx.fillRect(0, 0, 2, 2);
  scene.textures.addCanvas(SNOWFLAKE, flake.c);
}

/** Snow drifting down over the camera, fixed to the screen, not the world. For the title. */
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

