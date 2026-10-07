'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MINIMAP_TILE, getMinimapSource, type MinimapLayout } from '@/game/minimap';
import { RELAY_URL } from '@/lib/multiplayer/session';
import type { RoofColor, TownBiome } from '@/lib/types';
import styles from './Minimap.module.css';

// Longest side of the map in CSS px.
const SIZE = 260;
// Label size in CSS px; CuteFantasy is drawn on a 9px grid.
const FONT = 9;
const LABEL_MAX = 72;
const STORE_KEY = 'notekeep.minimapOpen';

const GROUND: Record<TownBiome, Record<number, string>> = {
  forest: {
    [MINIMAP_TILE.grass]: '#5a9a3c',
    [MINIMAP_TILE.blocked]: '#2f5f34',
    [MINIMAP_TILE.road]: '#d2ab6e',
    [MINIMAP_TILE.water]: '#4a8fd0',
    [MINIMAP_TILE.plaza]: '#bdb39e',
  },
  snow: {
    [MINIMAP_TILE.grass]: '#e3ecf4',
    [MINIMAP_TILE.blocked]: '#6f8fa8',
    [MINIMAP_TILE.road]: '#b9a48a',
    [MINIMAP_TILE.water]: '#a6d4ef',
    [MINIMAP_TILE.plaza]: '#c6cad3',
  },
  desert: {
    [MINIMAP_TILE.grass]: '#e4c08a',
    [MINIMAP_TILE.blocked]: '#7d8f4a',
    [MINIMAP_TILE.road]: '#bf8650',
    [MINIMAP_TILE.water]: '#4aa3c8',
    [MINIMAP_TILE.plaza]: '#d6c4a0',
  },
};

const ROOF: Record<RoofColor, string> = { black: '#4a4258', blue: '#3e6fb0', red: '#c0463a' };

function loadOpen() {
  try {
    return localStorage.getItem(STORE_KEY) !== '0';
  } catch {
    return true;
  }
}

function saveOpen(open: boolean) {
  try {
    localStorage.setItem(STORE_KEY, open ? '1' : '0');
  } catch {}
}

function drawLayout(layout: MinimapLayout, k: number, dpr: number, w: number, h: number) {
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d')!;
  const cell = (x: number, y: number, cw: number, ch: number) => {
    const x0 = Math.floor(x * k);
    const y0 = Math.floor(y * k);
    ctx.fillRect(x0, y0, Math.ceil((x + cw) * k) - x0, Math.ceil((y + ch) * k) - y0);
  };

  const palette = GROUND[layout.biome];
  ctx.fillStyle = palette[MINIMAP_TILE.grass];
  ctx.fillRect(0, 0, w, h);
  for (const kind of [MINIMAP_TILE.blocked, MINIMAP_TILE.plaza, MINIMAP_TILE.road, MINIMAP_TILE.water]) {
    ctx.fillStyle = palette[kind];
    for (let i = 0; i < layout.tiles.length; i++) {
      if (layout.tiles[i] === kind) cell(i % layout.w, Math.floor(i / layout.w), 1, 1);
    }
  }

  for (const house of layout.houses) {
    ctx.fillStyle = '#1f1418';
    cell(house.gx, house.gy, house.w, house.h);
    ctx.fillStyle = ROOF[house.roof];
    const inset = Math.min(0.5, 1 / k);
    cell(house.gx + inset, house.gy + inset, house.w - inset * 2, house.h - inset * 2);
  }

  drawLabels(ctx, layout, k, dpr, w, h);
  return out;
}

// Region (top-level folder) names go in the gap above each region, house (subfolder) names
// above or below their roof, nudged sideways if that is taken. A label with no free spot is
// left off; hovering a house still names it.
function drawLabels(ctx: CanvasRenderingContext2D, layout: MinimapLayout, k: number, dpr: number, w: number, h: number) {
  const taken: { x: number; y: number; w: number; h: number }[] = [];
  const free = (x: number, y: number, bw: number, bh: number) =>
    x >= 0 && y >= 0 && x + bw <= w && y + bh <= h &&
    !taken.some((t) => x < t.x + t.w && t.x < x + bw && y < t.y + t.h && t.y < y + bh);

  const fit = (text: string, max: number) => {
    if (ctx.measureText(text).width <= max) return text;
    for (let n = text.length - 1; n > 0; n--) {
      const cut = `${text.slice(0, n).trimEnd()}..`;
      if (ctx.measureText(cut).width <= max) return cut;
    }
    return '';
  };

  const pad = 2 * dpr;
  const bh = Math.ceil(FONT * dpr + pad);

  // spots(bw): [left, top] in backing px, tried in order.
  const place = (raw: string, spots: (bw: number) => [number, number][], color: string) => {
    const text = fit(raw, LABEL_MAX * dpr);
    if (!text) return;
    const bw = ctx.measureText(text).width + pad * 2;
    for (const [left, top] of spots(bw)) {
      const x = Math.round(Math.min(Math.max(left, 0), w - bw));
      const y = Math.round(top);
      if (!free(x, y, bw, bh)) continue;
      taken.push({ x, y, w: bw, h: bh });
      ctx.strokeText(text, x + pad, y + bh / 2);
      ctx.fillStyle = color;
      ctx.fillText(text, x + pad, y + bh / 2);
      return;
    }
  };

  ctx.font = `${FONT * dpr}px CuteFantasy, monospace`;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3 * dpr;
  ctx.strokeStyle = '#1f1418';

  // Whole backing pixels, so a label can sit flush against a roof without a sub-pixel overlap.
  const box = (house: MinimapLayout['houses'][number]) => {
    const x = Math.floor(house.gx * k);
    const y = Math.floor(house.gy * k);
    return { x, y, w: Math.ceil((house.gx + house.w) * k) - x, h: Math.ceil((house.gy + house.h) * k) - y };
  };
  for (const house of layout.houses) taken.push(box(house));
  for (const house of layout.houses) {
    const b = box(house);
    const left = b.x;
    const right = b.x + b.w;
    const above = b.y - bh;
    const below = b.y + b.h;
    place(house.name, (bw) => {
      const xs = [(left + right - bw) / 2, left, right - bw, left - bw / 2, right - bw / 2];
      return [above, below].flatMap((y) => xs.map((x) => [x, y] as [number, number]));
    }, '#fff7e6');
  }
  if (layout.areas.length > 1) {
    for (const a of layout.areas) {
      const cx = (a.gx + a.w / 2) * k;
      const top = a.gy * k - bh;
      place(a.name.toUpperCase(), (bw) => [0, 1, 2, 3, 4, 5].map((i) => [cx - bw / 2, top - i * pad] as [number, number]), '#f7c948');
    }
  }
}

export default function Minimap() {
  const [layout, setLayout] = useState<MinimapLayout | null>(null);
  const [open, setOpen] = useState(true);
  const [place, setPlace] = useState('');
  const [hovered, setHovered] = useState<string | null>(null);
  const [fontsReady, setFontsReady] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const backdrop = useRef<HTMLCanvasElement | null>(null);

  const scale = layout ? SIZE / Math.max(layout.w, layout.h) : 1;
  const cssW = layout ? Math.round(layout.w * scale) : 0;
  const cssH = layout ? Math.round(layout.h * scale) : 0;

  useEffect(() => {
    setOpen(loadOpen());
    document.fonts?.ready.then(() => setFontsReady((n) => n + 1));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'm' && e.key !== 'M') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (!getMinimapSource()) return;
      setOpen((o) => {
        saveOpen(!o);
        return !o;
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useLayoutEffect(() => {
    const el = canvas.current;
    if (!layout || !el) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = Math.round(cssW * dpr);
    el.height = Math.round(cssH * dpr);
    backdrop.current = drawLayout(layout, scale * dpr, dpr, el.width, el.height);
  }, [layout, open, cssW, cssH, scale, fontsReady]);

  useEffect(() => {
    let raf = 0;
    let shown: MinimapLayout | null = null;
    let where = '';
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const source = getMinimapSource();
      const next = source?.layout ?? null;
      if (next !== shown) {
        shown = next;
        setLayout(next);
      }
      if (!source) return;

      const { player, view, peers } = source.frame();
      const area = source.layout.areas.find(
        (a) => player.x >= a.gx && player.y >= a.gy && player.x < a.gx + a.w && player.y < a.gy + a.h,
      );
      const name = area?.name ?? source.layout.townName;
      if (name !== where) {
        where = name;
        setPlace(name);
      }

      const el = canvas.current;
      const bg = backdrop.current;
      if (!el || !bg || bg.width !== el.width) return;
      const ctx = el.getContext('2d')!;
      const k = el.width / source.layout.w;
      const dpr = window.devicePixelRatio || 1;
      ctx.drawImage(bg, 0, 0);

      ctx.strokeStyle = 'rgba(255, 247, 230, 0.85)';
      ctx.lineWidth = Math.max(1, Math.round(dpr));
      ctx.strokeRect(
        Math.round(view.x * k) + 0.5 * ctx.lineWidth,
        Math.round(view.y * k) + 0.5 * ctx.lineWidth,
        Math.round(view.w * k) - ctx.lineWidth,
        Math.round(view.h * k) - ctx.lineWidth,
      );

      const dot = (x: number, y: number, r: number, fill: string) => {
        ctx.beginPath();
        ctx.arc(x * k, y * k, r * dpr, 0, Math.PI * 2);
        ctx.fillStyle = '#1f1418';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x * k, y * k, (r - 1) * dpr, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
      };
      for (const p of peers) dot(p.x, p.y, 3, '#7fc8f0');

      const pulse = (performance.now() % 1200) / 1200;
      ctx.beginPath();
      ctx.arc(player.x * k, player.y * k, (3 + pulse * 6) * dpr, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(247, 201, 72, ${1 - pulse})`;
      ctx.lineWidth = 1.5 * dpr;
      ctx.stroke();
      dot(player.x, player.y, 4, '#f7c948');
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!layout) return null;

  const toggle = () => {
    saveOpen(!open);
    setOpen(!open);
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const gx = ((e.clientX - r.left) / r.width) * layout.w;
    const gy = ((e.clientY - r.top) / r.height) * layout.h;
    const house = layout.houses.find((h) => gx >= h.gx && gy >= h.gy && gx < h.gx + h.w && gy < h.gy + h.h);
    setHovered(house?.name ?? null);
  };

  return (
    <div className={styles.corner} style={{ top: RELAY_URL ? 72 : 16 }}>
      <div className={styles.plank}>
        <button
          className={styles.header}
          aria-expanded={open}
          title={open ? 'Hide map (M)' : 'Show map (M)'}
          // Blur so Space, the game's talk/interact key, can't re-press a focused button.
          onClick={(e) => {
            e.currentTarget.blur();
            toggle();
          }}
        >
          <span className={styles.place}>{open && hovered ? hovered : place}</span>
          <span className={styles.chevron}>{open ? '-' : '+'}</span>
        </button>
        {open && (
          <canvas
            ref={canvas}
            className={styles.map}
            style={{ width: cssW, height: cssH }}
            onPointerMove={onMove}
            onPointerLeave={() => setHovered(null)}
          />
        )}
      </div>
    </div>
  );
}
