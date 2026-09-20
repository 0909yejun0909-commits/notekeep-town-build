'use client';

import styles from './CharacterCreator.module.css';

// Same fixed outfit BootScene loads: base, then shoes -> pants -> shirt -> hair.
// Frame 0 of every sheet is the first idle-down frame, so background-position 0 0
// shows the character standing still.
const LAYERS = ['base', 'shoes/black', 'pants/brown', 'shirt/red', 'hair/1_brown'];

export default function CharacterCreator({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <div className={styles.wrapper} aria-hidden>
      <div className={styles.preview}>
        {LAYERS.map((layer) => (
          <div
            key={layer}
            className={styles.layer}
            style={{ backgroundImage: `url('/assets/character/${layer}.png')` }}
          />
        ))}
      </div>
    </div>
  );
}
