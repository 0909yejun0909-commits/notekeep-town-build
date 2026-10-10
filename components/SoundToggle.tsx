'use client';

import { useSyncExternalStore } from 'react';
import { isMuted, subscribeMute, toggleMute } from '@/game/audio/engine';
import styles from './SoundToggle.module.css';

const SPEAKER: Array<[number, number, number, number]> = [[1, 3, 2, 3], [3, 2, 1, 5], [4, 1, 1, 7]];
const WAVES: Array<[number, number, number, number]> = [[6, 3, 1, 3], [7, 1, 1, 1], [8, 2, 1, 5], [7, 7, 1, 1]];
const CROSS: Array<[number, number, number, number]> = [[6, 3, 1, 1], [8, 3, 1, 1], [7, 4, 1, 1], [6, 5, 1, 1], [8, 5, 1, 1]];

export default function SoundToggle() {
  const muted = useSyncExternalStore(subscribeMute, isMuted, () => false);
  const label = muted ? 'Sound off (M)' : 'Sound on (M)';
  return (
    <button
      className={styles.toggle}
      onClick={toggleMute}
      onMouseDown={(e) => e.preventDefault()}
      title={label}
      aria-label={label}
      aria-pressed={!muted}
    >
      <svg viewBox="0 0 9 9" fill="currentColor" aria-hidden>
        {[...SPEAKER, ...(muted ? CROSS : WAVES)].map(([x, y, w, h]) => (
          <rect key={`${x},${y}`} x={x} y={y} width={w} height={h} />
        ))}
      </svg>
    </button>
  );
}
