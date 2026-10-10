'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './Spotlight.module.css';
import pixel from './pixelUi.module.css';

export type Rect = { left: number; top: number; width: number; height: number };

const PAD = 6;
const MARGIN = 12;
const ARROW_GAP = 56; // room for the arrow between a target and the bubble beside it

// Pixel arrow, pointing down; turned to point any way.
const ARROW = ['..OOOOO..', '..OYYYO..', '..OYYYO..', '..OYYYO..', 'OOOYYYOOO', 'OYYYYYYYO', '.OYYYYYO.', '..OYYYO..', '...OYO...', '....O....'];
const ARROW_COLOR: Record<string, string> = { O: '#3f2832', Y: '#ffe066' };
const TURN = { down: 'none', up: 'scaleY(-1)', left: 'rotate(90deg)', right: 'rotate(-90deg)' } as const;
type Dir = keyof typeof TURN;

function Arrow({ dir }: { dir: Dir }) {
  return (
    <svg width={36} height={40} viewBox="0 0 9 10" shapeRendering="crispEdges" aria-hidden style={{ transform: TURN[dir] }}>
      {ARROW.flatMap((row, y) =>
        [...row].map((c, x) => (ARROW_COLOR[c] ? <rect key={`${x},${y}`} x={x} y={y} width={1} height={1} fill={ARROW_COLOR[c]} /> : null)),
      )}
    </svg>
  );
}

function Bubble({ compact, actions, children }: { compact: boolean; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className={compact ? `${styles.bubble} ${styles.compact}` : `${pixel.parchment} ${styles.bubble}`}>
      <div className={styles.text}>{children}</div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}

const padded = (r: Rect): Rect => ({
  left: Math.round(r.left) - PAD,
  top: Math.round(r.top) - PAD,
  width: Math.round(r.width) + 2 * PAD,
  height: Math.round(r.height) + 2 * PAD,
});
const visible = (r: Rect | null | undefined): r is Rect => !!r && r.width > 0 && r.height > 0;
const key = (rs: Rect[]) => rs.map((r) => `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`).join(';');

function overlap(a: Rect, b: Rect) {
  const w = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const h = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

function union(rs: Rect[]): Rect | null {
  if (rs.length === 0) return null;
  const l = Math.min(...rs.map((r) => r.left)), t = Math.min(...rs.map((r) => r.top));
  const r = Math.max(...rs.map((x) => x.left + x.width)), b = Math.max(...rs.map((x) => x.top + x.height));
  return { left: l, top: t, width: r - l, height: b - t };
}

// The bubble's possible sizes, roomiest first: the full parchment box, then a compact one
// (smaller text, thin border) for the narrow margins around a big panel.
const SIZES = [
  ...[380, 300, 240].map((w) => ({ w, compact: false })),
  ...[300, 240, 200, 170, 140].map((w) => ({ w, compact: true })),
];
type Size = { w: number; compact: boolean; h: number };
type Spot = Rect & { compact: boolean };

// Where the bubble goes: beside the target if there's room, else beside any of the things it
// must not cover, else in a corner; at the roomiest size that covers nothing. Failing that,
// wherever it covers least.
function placeBubble(target: Rect | null, blockers: Rect[], sizes: Size[], vw: number, vh: number): Spot {
  const clampX = (x: number, w: number) => Math.max(MARGIN, Math.min(vw - MARGIN - w, x));
  const clampY = (y: number, h: number) => Math.max(MARGIN, Math.min(vh - MARGIN - h, y));
  const candidates: Spot[] = [];
  for (const { w: width, h, compact } of sizes.filter((z) => z.w <= vw - 2 * MARGIN)) {
    const at = (left: number, top: number): Spot => ({ left, top, width, height: h, compact });
    const around = (r: Rect, gap: number) => {
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      candidates.push(
        at(clampX(cx - width / 2, width), r.top + r.height + gap),
        at(clampX(cx - width / 2, width), r.top - gap - h),
        at(r.left + r.width + gap, clampY(cy - h / 2, h)),
        at(r.left - gap - width, clampY(cy - h / 2, h)),
      );
    };
    if (target) around(target, ARROW_GAP);
    for (const b of blockers) around(b, MARGIN);
    candidates.push(
      at(MARGIN, 90), at(vw - MARGIN - width, 90),
      at(MARGIN, vh - MARGIN - h), at(vw - MARGIN - width, vh - MARGIN - h),
      at(vw / 2 - width / 2, vh / 2 - h / 2),
    );
  }
  const inside = (c: Rect) =>
    c.left >= MARGIN - 1 && c.top >= MARGIN - 1 && c.left + c.width <= vw - MARGIN + 1 && c.top + c.height <= vh - MARGIN + 1;
  const covered = (c: Rect) =>
    blockers.reduce((n, b) => n + overlap(c, { left: b.left - 6, top: b.top - 6, width: b.width + 12, height: b.height + 12 }), 0);
  const fits = candidates.filter(inside);
  return (
    fits.find((c) => covered(c) === 0) ??
    fits.sort((a, b) => covered(a) - covered(b))[0] ??
    { left: MARGIN, top: MARGIN, width: vw - 2 * MARGIN, height: 170, compact: true }
  );
}

// Shades the whole page except the highlighted rects (re-measured every frame, so they follow
// a walking sprite or a panel that opens), points a yellow arrow at the first one and explains
// what to do. The shade takes every click; holes let clicks through unless `keysOnly`, for
// steps done with the keyboard. The bubble keeps clear of the holes and of `avoid` (the
// interface the player needs to see).
export default function Spotlight({
  holes,
  avoid,
  children,
  actions,
  keysOnly,
}: {
  holes: () => (Rect | null)[];
  avoid?: () => (Rect | null)[];
  children: ReactNode;
  actions?: ReactNode;
  keysOnly?: boolean;
}) {
  const measure = () => ({
    holes: holes().map((r) => (visible(r) ? padded(r) : null)),
    avoid: (avoid?.() ?? []).filter(visible),
  });
  // Measured before the first paint too, so nothing flashes in the wrong place.
  const [shape, setShape] = useState(measure);
  // The bubble's height at each width it can take, from hidden copies: measuring the placed
  // bubble instead would feed its placement back into its size and make it jump around.
  const [heights, setHeights] = useState<number[]>([]);
  const live = useRef({ measure, heights });
  live.current = { measure, heights };
  const sizers = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    let raf = 0;
    let last = '';
    const tick = () => {
      const next = live.current.measure();
      const k = key(next.holes.filter(visible)) + '|' + key(next.avoid) + '|' + next.holes.map((h) => (h ? 1 : 0)).join('');
      if (k !== last) {
        last = k;
        setShape(next);
      }
      const hs = sizers.current.map((d) => d?.offsetHeight ?? 0);
      if (hs.join() !== live.current.heights.join()) setHeights(hs);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const target = shape.holes[0] ?? null;
  const lit = shape.holes.filter(visible);
  const sizes = SIZES.map((z, i) => ({ ...z, h: heights[i] || 170 }));
  const spot = placeBubble(target, [...lit, ...shape.avoid], sizes, vw, vh);

  let arrow: { dir: Dir; left: number; top: number } | null = null;
  if (target) {
    const tb = target.top + target.height, tr = target.left + target.width;
    const cx = target.left + target.width / 2, cy = target.top + target.height / 2;
    if (spot.top >= tb) arrow = { dir: 'up', left: cx - 18, top: tb + 8 };
    else if (spot.top + spot.height <= target.top) arrow = { dir: 'down', left: cx - 18, top: target.top - 48 };
    else if (spot.left >= tr) arrow = { dir: 'left', left: tr + 6, top: cy - 20 };
    else if (spot.left + spot.width <= target.left) arrow = { dir: 'right', left: target.left - 42, top: cy - 20 };
  }

  // One path: the screen minus each hole (even-odd), so clicks land only on the shade.
  const path = `M0 0H${vw}V${vh}H0Z` + lit.map((r) => `M${r.left} ${r.top}h${r.width}v${r.height}h${-r.width}Z`).join('');

  return createPortal(
    <div className={styles.layer}>
      <svg className={styles.shade} width={vw} height={vh}>
        <path d={path} fillRule="evenodd" />
      </svg>
      {keysOnly && target && <div className={styles.block} style={target} />}
      {lit.map((r, i) => (
        <div key={i} className={i === 0 && target ? styles.ring : styles.softRing} style={r} />
      ))}
      {arrow && (
        <div
          className={`${styles.arrow} ${arrow.dir === 'up' || arrow.dir === 'down' ? styles.bobY : styles.bobX}`}
          style={{ left: arrow.left, top: arrow.top }}
        >
          <Arrow dir={arrow.dir} />
        </div>
      )}
      <div className={styles.placed} style={{ left: spot.left, top: spot.top, width: spot.width }}>
        <Bubble compact={spot.compact} actions={actions}>{children}</Bubble>
      </div>
      {SIZES.map((z, i) => (
        <div key={i} className={styles.sizer} style={{ width: z.w }} aria-hidden>
          <div ref={(d) => { sizers.current[i] = d; }}>
            <Bubble compact={z.compact} actions={actions}>{children}</Bubble>
          </div>
        </div>
      ))}
    </div>,
    document.body,
  );
}
