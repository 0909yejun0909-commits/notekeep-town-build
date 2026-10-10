'use client';

import { useEffect, useState } from 'react';
import styles from './ChoiceMenu.module.css';
import pixel from './pixelUi.module.css';
import { bus } from '@/game/bus';

type Menu = { title: string; options: string[] };

// Space on a piece that does two things (InteriorScene) — a bed holding a note, a wardrobe
// standing in for the shelf — asks which you meant.
export default function ChoiceMenu() {
  const [menu, setMenu] = useState<Menu | null>(null);
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    const onOpen = (next: Menu) => {
      setMenu(next);
      setCursor(0);
    };
    bus.on('open-choice-menu', onOpen);
    return () => bus.off('open-choice-menu', onOpen);
  }, []);

  const choose = (index: number | null) => {
    setMenu(null);
    bus.emit('choice-menu-choice', { index });
  };

  useEffect(() => {
    if (!menu) return;
    const n = menu.options.length;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === 'ArrowUp' || k === 'w' || k === 'W') setCursor((c) => (c + n - 1) % n);
      else if (k === 'ArrowDown' || k === 's' || k === 'S') setCursor((c) => (c + 1) % n);
      else if (k === 'Enter' || k === ' ') {
        if (!e.repeat) choose(cursor);
      } else if (k === 'Escape') choose(null);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!menu) return null;

  return (
    <div className={styles.screen} onClick={() => choose(null)}>
      <div className={pixel.parchment} onClick={(e) => e.stopPropagation()}>
        <p className={styles.title}>{menu.title}</p>
        <ul role="menu" className={styles.menu}>
          {menu.options.map((label, i) => (
            <li key={label} role="none">
              <button
                role="menuitem"
                className={`${pixel.item} ${i === cursor ? pixel.current : ''}`}
                onMouseEnter={() => setCursor(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(i)}
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
