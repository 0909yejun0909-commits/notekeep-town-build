'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './Spotlight.module.css';
import pixel from './pixelUi.module.css';

export type Rect = { left: number; top: number; width: number; height: number };

const PAD = 6;
const BUBBLE_W = 380;

// Pixel arrow, pointing down; flipped to point up.
const ARROW = ['..OOOOO..', '..OYYYO..', '..OYYYO..', '..OYYYO..', 'OOOYYYOOO', 'OYYYYYYYO', '.OYYYYYO.', '..OYYYO..', '...OYO...', '....O....'];
const ARROW_COLOR: Record<string, string> = { O: '#3f2832', Y: '#ffe066' };

function Arrow({ up }: { up: boolean }) {
  return (
    <svg width={36} height={40} viewBox="0 0 9 10" shapeRendering="crispEdges" aria-hidden style={up ? { transform: 'scaleY(-1)' } : undefined}>
      {ARROW.flatMap((row, y) =>
        [...row].map((c, x) => (ARROW_COLOR[c] ? <rect key={`${x},${y}`} x={x} y={y} width={1} height={1} fill={ARROW_COLOR[c]} /> : null)),
      )}
    </svg>
  );
}

function measure(target: () => Rect | null): Rect | null {
  const r = target();
  return r && r.width > 0 && r.height > 0
    ? { left: Math.round(r.left) - PAD, top: Math.round(r.top) - PAD, width: Math.round(r.width) + 2 * PAD, height: Math.round(r.height) + 2 * PAD }
    : null;
}

function same(a: Rect | null, b: Rect | null) {
  if (!a || !b) return a === b;
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
}

// Shades the whole page except `target` (re-measured every frame, so it follows a moving
// sprite or a panel that opens), points a yellow arrow at it and explains what to do there.
// The shade takes every click; the hole lets clicks through to the target unless
// `keysOnly`, for steps done with the keyboard (walking somewhere).
export default function Spotlight({
  target,
  children,
  actions,
  keysOnly,
  pin = 'top',
}: {
  target: () => Rect | null;
  children: ReactNode;
  actions?: ReactNode;
  keysOnly?: boolean;
  // Where the bubble goes when the target leaves no room above or below it (a whole panel).
  pin?: 'top' | 'bottom';
}) {
  // Measured before the first paint too, so the bubble doesn't flash in the middle first.
  const [rect, setRect] = useState<Rect | null>(() => measure(target));
  const targetRef = useRef(target);
  targetRef.current = target;

  useEffect(() => {
    let raf = 0;
    let last = rect;
    const tick = () => {
      const next = measure(targetRef.current);
      if (!same(next, last)) {
        last = next;
        setRect(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const vw = typeof window === 'undefined' ? 1024 : window.innerWidth;
  const vh = typeof window === 'undefined' ? 768 : window.innerHeight;
  const bubbleW = Math.min(BUBBLE_W, vw - 32);

  const bubble = (
    <div className={`${pixel.parchment} ${styles.bubble}`} style={{ width: bubbleW }}>
      <div className={styles.text}>{children}</div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );

  // On <body>, so no panel's stacking context can lift anything above the shade.
  const portal = (node: ReactNode) => createPortal(node, document.body);

  if (!rect) {
    return portal(
      <div className={styles.layer}>
        <div className={styles.shade} style={{ inset: 0 }} />
        <div className={styles.center}>{bubble}</div>
      </div>
    );
  }

  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;
  // Bubble on whichever side of the target has more room; over the target's edge if neither
  // side has enough.
  const above = rect.top > vh - bottom;
  const room = Math.max(rect.top, vh - bottom) > 200;
  const cx = rect.left + rect.width / 2;
  const bubbleLeft = Math.max(16, Math.min(vw - 16 - bubbleW, cx - bubbleW / 2));

  return portal(
    <div className={styles.layer}>
      <div className={styles.shade} style={{ left: 0, top: 0, right: 0, height: Math.max(0, rect.top) }} />
      <div className={styles.shade} style={{ left: 0, top: bottom, right: 0, bottom: 0 }} />
      <div className={styles.shade} style={{ left: 0, top: rect.top, width: Math.max(0, rect.left), height: rect.height }} />
      <div className={styles.shade} style={{ left: right, top: rect.top, right: 0, height: rect.height }} />
      {keysOnly && <div className={styles.block} style={rect} />}
      <div className={styles.ring} style={rect} />
      {room && (
        <div
          className={`${styles.arrow} ${above ? styles.down : styles.up}`}
          style={{ left: cx - 18, top: above ? rect.top - 48 : bottom + 8 }}
        >
          <Arrow up={!above} />
        </div>
      )}
      <div
        className={styles.placed}
        style={!room
          ? { left: bubbleLeft, [pin]: 16 }
          : above
            ? { left: bubbleLeft, bottom: vh - rect.top + 56 }
            : { left: bubbleLeft, top: bottom + 56 }}
      >
        {bubble}
      </div>
    </div>
  );
}
