'use client';

import { useEffect, useRef, useState } from 'react';
import { clock, restCoins } from '@/lib/chill';
import { payCalm } from '@/lib/calmStore';
import { bus } from '@/game/bus';
import styles from './RestHud.module.css';

// Sitting or lying on a sofa, bed, beanbag or chair is a rest: the screen softens, a timer
// counts, and standing up pays a coin for every two minutes (within the daily calm limit).
export default function RestHud() {
  const [since, setSince] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  // The paying has to happen outside a state updater, which React may run while rendering.
  const began = useRef<number | null>(null);

  useEffect(() => {
    const onStart = () => {
      began.current = Date.now();
      setSince(began.current);
      setNow(began.current);
    };
    const onEnd = () => {
      if (began.current === null) return;
      const coins = restCoins((Date.now() - began.current) / 1000);
      began.current = null;
      setSince(null);
      if (coins > 0) payCalm(coins, 'A good rest. You feel better.');
    };
    bus.on('rest-start', onStart);
    bus.on('rest-end', onEnd);
    return () => {
      bus.off('rest-start', onStart);
      bus.off('rest-end', onEnd);
    };
  }, []);

  useEffect(() => {
    if (since === null) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [since]);

  if (since === null) return null;
  const seconds = (now - since) / 1000;

  return (
    <>
      <div className={styles.vignette} aria-hidden />
      <div className={styles.pill} role="status">
        <span className={styles.dot} aria-hidden />
        <span>Resting {clock(seconds)}</span>
        <span className={styles.sub}>Move to get up</span>
      </div>
    </>
  );
}
