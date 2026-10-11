'use client';

import { useEffect, useState } from 'react';
import { bus } from '@/game/bus';
import Coin from './Coin';
import styles from './PlotTooltip.module.css';

type Hover = { x: number; y: number; price: number; state: 'buy' | 'poor' | 'far' };

const LOCK = ['..OOOOO..', '.OO...OO.', '.O.....O.', '.O.....O.', 'OOOOOOOOO', 'OYYYYYYYO', 'OYYYOYYYO', 'OYYYYYYYO', 'OOOOOOOOO'];

// A padlock and the price over the locked plot of land under the pointer (game/plots.ts).
export default function PlotTooltip() {
  const [hover, setHover] = useState<Hover | null>(null);
  useEffect(() => {
    bus.on('plot-hover', setHover);
    return () => bus.off('plot-hover', setHover);
  }, []);
  if (!hover) return null;
  return (
    <div className={styles.tip} style={{ left: hover.x, top: hover.y }} data-hud>
      <svg width={36} height={36} viewBox="0 0 9 9" shapeRendering="crispEdges" aria-hidden>
        {LOCK.flatMap((row, y) =>
          [...row].map((c, x) =>
            c === '.' ? null : <rect key={`${x},${y}`} x={x} y={y} width={1} height={1} fill={c === 'O' ? '#1f1418' : '#f7c948'} />,
          ),
        )}
      </svg>
      <span className={styles.price}>
        <Coin size={14} />
        {hover.price}
      </span>
      <span className={styles.what}>
        {hover.state === 'buy' ? 'Click to buy this land' : hover.state === 'poor' ? 'Not enough coins yet' : 'Buy the land next to it first'}
      </span>
    </div>
  );
}
