'use client';

import { useRef, useState, useSyncExternalStore } from 'react';
import { getVolume, isMuted, setVolume, subscribeMute, toggleMute } from '@/game/audio/engine';
import styles from './SoundToggle.module.css';

const SPEAKER: Array<[number, number, number, number]> = [[1, 3, 2, 3], [3, 2, 1, 5], [4, 1, 1, 7]];
const WAVES: Array<[number, number, number, number]> = [[6, 3, 1, 3], [7, 1, 1, 1], [8, 2, 1, 5], [7, 7, 1, 1]];
const CROSS: Array<[number, number, number, number]> = [[6, 3, 1, 1], [8, 3, 1, 1], [7, 4, 1, 1], [6, 5, 1, 1], [8, 5, 1, 1]];

const STEP = 0.05;

// The speaker button, with a volume slider that slides out to its left on hover. Clicking the
// button (or M) still mutes; dragging the slider sets the level and unmutes.
export default function SoundToggle() {
  const muted = useSyncExternalStore(subscribeMute, isMuted, () => false);
  const volume = useSyncExternalStore(subscribeMute, getVolume, () => 1);
  const [dragging, setDragging] = useState(false);
  const track = useRef<HTMLDivElement>(null);
  const label = muted ? 'Sound off (M)' : 'Sound on (M)';
  const pct = Math.round(volume * 100);

  const setFrom = (clientX: number) => {
    const r = track.current?.getBoundingClientRect();
    if (r) setVolume(Math.round(((clientX - r.left) / r.width) / STEP) * STEP);
  };

  return (
    <div className={`${styles.dock} ${dragging ? styles.open : ''}`} data-hud>
      <button
        className={styles.toggle}
        onClick={toggleMute}
        onMouseDown={(e) => e.preventDefault()}
        title={label}
        aria-label={label}
        aria-pressed={!muted}
      >
        <svg viewBox="0 0 9 9" fill="currentColor" aria-hidden>
          {[...SPEAKER, ...(muted ? CROSS : volume > 0 ? WAVES : [])].map(([x, y, w, h]) => (
            <rect key={`${x},${y}`} x={x} y={y} width={w} height={h} />
          ))}
        </svg>
      </button>
      <div className={styles.panel}>
        <div
          ref={track}
          className={`${styles.track} ${muted ? styles.dim : ''}`}
          role="slider"
          tabIndex={0}
          aria-label="Volume"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-valuetext={muted ? `${pct}%, muted` : `${pct}%`}
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            setDragging(true);
            setFrom(e.clientX);
          }}
          onPointerMove={(e) => dragging && setFrom(e.clientX)}
          onPointerUp={() => setDragging(false)}
          onPointerCancel={() => setDragging(false)}
          // Arrow keys turn it up and down here instead of walking the player.
          onKeyDown={(e) => {
            const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? STEP : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -STEP : 0;
            if (!d) return;
            e.preventDefault();
            e.stopPropagation();
            setVolume(volume + d);
          }}
          onKeyUp={(e) => e.stopPropagation()}
        >
          <span className={styles.fill} style={{ width: `${pct}%` }} />
          <span className={styles.knob} style={{ left: `${pct}%` }} />
        </div>
        <span className={styles.value}>{muted ? 'Off' : pct}</span>
      </div>
    </div>
  );
}
