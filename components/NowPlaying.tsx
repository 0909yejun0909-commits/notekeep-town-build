'use client';

import { AMBIENCES, PLAYLIST } from '@/lib/chill';
import { isPlaying, stopAll, useChill } from '@/game/audio/chill';
import styles from './NowPlaying.module.css';

// What's playing from a sound device, left of the mute button, with a stop. The music keeps
// going when you leave the room, so this is how you find and silence it.
export default function NowPlaying() {
  const chill = useChill();
  if (!isPlaying(chill)) return null;

  const parts = [
    ...(chill.track ? [PLAYLIST.find((t) => t.place === chill.track)?.name ?? 'Music'] : []),
    ...AMBIENCES.filter((a) => chill.levels[a.id]).map((a) => a.label),
  ];

  return (
    <div className={styles.pill} role="status">
      <span className={styles.note} aria-hidden>{'♪'}</span>
      <span className={styles.text}>{parts.join(' + ')}</span>
      <button className={styles.stop} title="Stop" aria-label="Stop playing" onMouseDown={(e) => e.preventDefault()} onClick={stopAll}>
        <svg viewBox="0 0 5 5" fill="currentColor" aria-hidden>
          <rect width="5" height="5" />
        </svg>
      </button>
    </div>
  );
}
