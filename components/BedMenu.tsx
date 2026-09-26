'use client';

import { useEffect, useState } from 'react';
import styles from './BedMenu.module.css';
import pixel from './pixelUi.module.css';
import { bus } from '@/game/bus';
import type { NoteRef } from '@/lib/types';

type Choice = 'read' | 'lie';

const ITEMS: Array<[Choice, string]> = [
  ['read', 'Read note'],
  ['lie', 'Lie down'],
];

// Space on a bed that holds a note (InteriorScene) asks which you meant.
export default function BedMenu() {
  const [note, setNote] = useState<NoteRef | null>(null);
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    const onOpen = ({ note }: { note: NoteRef }) => {
      setNote(note);
      setCursor(0);
    };
    bus.on('open-bed-menu', onOpen);
    return () => bus.off('open-bed-menu', onOpen);
  }, []);

  const choose = (choice: Choice | 'cancel') => {
    setNote(null);
    bus.emit('bed-menu-choice', { choice });
  };

  useEffect(() => {
    if (!note) return;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === 'ArrowUp' || k === 'w' || k === 'W') setCursor((c) => (c + ITEMS.length - 1) % ITEMS.length);
      else if (k === 'ArrowDown' || k === 's' || k === 'S') setCursor((c) => (c + 1) % ITEMS.length);
      else if (k === 'Enter' || k === ' ') {
        if (!e.repeat) choose(ITEMS[cursor][0]);
      } else if (k === 'Escape') choose('cancel');
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!note) return null;

  return (
    <div className={styles.screen} onClick={() => choose('cancel')}>
      <div className={pixel.parchment} onClick={(e) => e.stopPropagation()}>
        <p className={styles.title}>{note.title}</p>
        <ul role="menu" className={styles.menu}>
          {ITEMS.map(([choice, label], i) => (
            <li key={choice} role="none">
              <button
                role="menuitem"
                className={`${pixel.item} ${i === cursor ? pixel.current : ''}`}
                onMouseEnter={() => setCursor(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(choice)}
              >
                <span className={`${pixel.cursor} ${i === cursor ? '' : pixel.cursorIdle}`} />
                {label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
