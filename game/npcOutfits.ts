import Phaser from 'phaser';
import type { TownBiome } from '@/lib/types';
import { addStrip, canvas, rgb, OUTLINE, type Rgb } from './biomeArt';

// Bob and Katy dress for the town's biome: winter coats, scarves and beanies in the snow; light
// linen and a head wrap or sun hat in the desert. Like the rest of the biome art this is a
// reskin built in code from the NPC's own sheet, frame by frame, so every pose and walk cycle
// keeps its animation. Kenmi's NPC sheets were measured only for their grid (docs/ASSETS.md),
// so nothing here assumes where a garment is drawn: each frame's figure is found from its
// pixels, its top half treated as the head and its lower half (minus the feet) as clothes.

type Ramp = Rgb[];
type Head =
  | { kind: 'beanie'; main: string; shade: string; cuff: string; pom: string }
  | { kind: 'wrap'; main: string; shade: string; band: string }
  | { kind: 'sunhat'; main: string; shade: string; band: string };
type Outfit = { clothes: Ramp; head: Head; scarf?: [string, string] };

const ramp = (...hex: string[]): Ramp => hex.map(rgb);

const OUTFITS: Partial<Record<TownBiome, Record<string, Outfit>>> = {
  snow: {
    farmer_bob: {
      clothes: ramp('#1e3b2c', '#2e5e3e', '#3e8948', '#63a85a'),
      scarf: ['#b8333a', '#f4f1ea'],
      head: { kind: 'beanie', main: '#b8333a', shade: '#8a2430', cuff: '#f4f1ea', pom: '#ffffff' },
    },
    bartender_katy: {
      clothes: ramp('#7a2430', '#a8343c', '#c94a46', '#e0705f'),
      scarf: ['#f4f1ea', '#3e8948'],
      head: { kind: 'beanie', main: '#3e8948', shade: '#265c42', cuff: '#f4f1ea', pom: '#ffffff' },
    },
  },
  desert: {
    farmer_bob: {
      clothes: ramp('#7a5a3a', '#b08a5e', '#d9bf91', '#f1e3c2'),
      head: { kind: 'wrap', main: '#f4efe2', shade: '#d8cdb5', band: '#b8333a' },
    },
    bartender_katy: {
      clothes: ramp('#6e3424', '#a8553a', '#d07a50', '#e8a878'),
      head: { kind: 'sunhat', main: '#e8c873', shade: '#c19a4b', band: '#3a8f8a' },
    },
  },
};

const FRAME = 64;
const COLS = 6;
const ROWS = 6; // idle and walk, down/right/up; the job animations below are never played

function lightness(r: number, g: number, b: number) {
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 510;
}

// Kenmi's peach skin and its shade; hands and faces keep their colour.
function isSkin(r: number, g: number, b: number) {
  const l = lightness(r, g, b);
  if (l < 0.55 || l > 0.9 || r <= g || g <= b) return false;
  const hue = (60 * (g - b)) / (r - b);
  return hue >= 15 && hue <= 38 && (r - b) / 255 > 0.25;
}

class Frame {
  private edges = new Set<number>();
  constructor(private d: ImageData, private ox: number, private oy: number) {
    // The figure's own outline: dark pixels on its rim or against a lighter fill. Found before
    // anything is painted, and kept wherever a garment goes. Dark cloth inside the figure
    // (a black apron) isn't outline and gets dyed like any other.
    for (let y = 0; y < FRAME; y++) {
      for (let x = 0; x < FRAME; x++) {
        if (!this.solid(x, y)) continue;
        const l = lightness(...this.rgb(x, y));
        if (l >= 0.25) continue;
        const rim = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) =>
          !this.solid(x + dx, y + dy) || lightness(...this.rgb(x + dx, y + dy)) > l + 0.3);
        if (rim) this.edges.add(y * FRAME + x);
      }
    }
  }
  private i(x: number, y: number) {
    return ((this.oy + y) * this.d.width + this.ox + x) * 4;
  }
  inside(x: number, y: number) {
    return x >= 0 && y >= 0 && x < FRAME && y < FRAME;
  }
  solid(x: number, y: number) {
    return this.inside(x, y) && this.d.data[this.i(x, y) + 3] >= 200;
  }
  rgb(x: number, y: number): Rgb {
    const i = this.i(x, y);
    return [this.d.data[i], this.d.data[i + 1], this.d.data[i + 2]];
  }
  edge(x: number, y: number) {
    return this.edges.has(y * FRAME + x);
  }
  erase(x: number, y: number) {
    if (this.inside(x, y)) this.d.data[this.i(x, y) + 3] = 0;
  }
  set(x: number, y: number, c: string | Rgb) {
    if (!this.inside(x, y)) return;
    const [r, g, b] = typeof c === 'string' ? rgb(c) : c;
    const i = this.i(x, y);
    this.d.data.set([r, g, b, 255], i);
  }
  // Paint a garment pixel: only over the figure's fill, never its outline or the background.
  paint(x: number, y: number, c: string | Rgb) {
    if (this.solid(x, y) && !this.edge(x, y)) this.set(x, y, c);
  }
  // A new pixel past the figure's edge, ringed with outline where it meets the background.
  add(x: number, y: number, c: string) {
    this.set(x, y, c);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (this.inside(x + dx, y + dy) && !this.solid(x + dx, y + dy)) this.set(x + dx, y + dy, OUTLINE);
    }
  }
  span(y: number): [number, number] | null {
    let a = -1, b = -1;
    for (let x = 0; x < FRAME; x++) {
      if (!this.solid(x, y)) continue;
      if (a < 0) a = x;
      b = x;
    }
    return a < 0 ? null : [a, b];
  }
}

function dressFrame(f: Frame, o: Outfit) {
  let top = -1, bottom = -1;
  for (let y = 0; y < FRAME; y++) {
    const s = f.span(y);
    if (s && s[1] - s[0] >= 1) {
      if (top < 0) top = y;
      bottom = y;
    }
  }
  if (top < 0 || bottom - top < 8) return;
  const neck = top + Math.round((bottom - top + 1) * 0.5);

  // Clothes: everything below the neck that isn't skin or outline, down to the shoes, dyed by
  // its own lightness so folds and shading survive.
  for (let y = neck; y <= bottom - 2; y++) {
    for (let x = 0; x < FRAME; x++) {
      if (!f.solid(x, y) || f.edge(x, y)) continue;
      const [r, g, b] = f.rgb(x, y);
      if (isSkin(r, g, b)) continue;
      const t = Math.min(1, Math.max(0, (lightness(r, g, b) - 0.12) / 0.65));
      f.set(x, y, o.clothes[Math.round(t * (o.clothes.length - 1))]);
    }
  }

  if (o.scarf) {
    const [a, b] = o.scarf;
    for (let y = neck; y <= neck + 1; y++) {
      for (let x = 0; x < FRAME; x++) f.paint(x, y, y === neck && x % 3 === 0 ? b : a);
    }
  }

  // Headwear replaces whatever was on top of the head (Bob's straw hat included): the top
  // rows become a cap exactly as wide as the head, which is the width most head rows share.
  const widths = new Map<string, number>();
  for (let y = top + 1; y < neck; y++) {
    const sp = f.span(y);
    if (sp) widths.set(sp.join(), (widths.get(sp.join()) ?? 0) + 1);
  }
  const common = [...widths].sort((a, b) => b[1] - a[1])[0];
  if (!common) return;
  const [l, r] = common[0].split(',').map(Number);
  const head = o.head;
  const rows = 4; // under the outline row at `top`
  for (let y = top; y <= top + rows; y++) {
    for (let x = 0; x < FRAME; x++) {
      if (x < l || x > r || (y === top && (x === l || x === r))) {
        f.erase(x, y);
        continue;
      }
      if (y === top || x === l || x === r) {
        f.set(x, y, OUTLINE);
        continue;
      }
      const last = y === top + rows;
      const c =
        head.kind === 'beanie' && last ? head.cuff
        : head.kind !== 'beanie' && y === top + rows - 1 ? head.band
        : x >= r - 2 ? head.shade : head.main;
      f.set(x, y, c);
    }
  }

  const cx = Math.round((l + r) / 2);
  if (head.kind === 'beanie') {
    for (const [dx, dy] of [[0, -1], [-1, -1], [0, -2], [-1, -2]]) f.add(cx + dx, top + dy, head.pom);
  } else if (head.kind === 'sunhat') {
    for (let x = l - 2; x <= r + 2; x++) f.add(x, top + rows, head.shade);
    for (let x = l - 2; x <= r + 2; x++) if (!f.solid(x, top + rows + 1)) f.set(x, top + rows + 1, OUTLINE);
  } else {
    // The wrap's loose end hangs at the back of the head.
    for (let y = top + rows; y < top + rows + 3; y++) f.add(l - 1, y, head.shade);
  }
}

/** The texture `npcId` wears in `biome`, built on first use. Forest keeps Kenmi's own outfits. */
export function npcTexture(scene: Phaser.Scene, biome: TownBiome, npcId: string): string {
  const outfit = OUTFITS[biome]?.[npcId];
  if (!outfit || !scene.textures.exists(npcId)) return npcId;
  const out = `${npcId}@${biome}`;
  if (scene.textures.exists(out)) return out;

  const img = scene.textures.get(npcId).getSourceImage() as CanvasImageSource & { width: number; height: number };
  if (img.width < COLS * FRAME || img.height < ROWS * FRAME) return npcId;
  const { c, ctx } = canvas(COLS * FRAME, ROWS * FRAME);
  ctx.drawImage(img, 0, 0, COLS * FRAME, ROWS * FRAME, 0, 0, COLS * FRAME, ROWS * FRAME);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  for (let r = 0; r < ROWS; r++) for (let col = 0; col < COLS; col++) dressFrame(new Frame(d, col * FRAME, r * FRAME), outfit);
  ctx.putImageData(d, 0, 0);
  addStrip(scene, out, c, FRAME, FRAME);
  return scene.textures.exists(out) ? out : npcId;
}
