'use client';

import { useEffect, useState } from 'react';
import styles from './TitleMenu.module.css';
import pixel from './pixelUi.module.css';
import CharacterCreator from './CharacterCreator';
import { openDemoVault, openVault } from '@/lib/vault/open';
import { bus } from '@/game/bus';
import type { VaultHandle } from '@/lib/types';

type Choice = 'vault' | 'demo' | 'hero';

const ITEMS: Array<[Choice, string]> = [
  ['vault', 'Open your vault'],
  ['demo', 'Visit the demo town'],
  ['hero', 'Your hero'],
];

export default function TitleMenu({ onVault }: { onVault: (vault: VaultHandle) => void }) {
  const [view, setView] = useState<'menu' | 'hero'>('menu');
  const [cursor, setCursor] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // open() must be called synchronously from the click/keydown handler: the folder picker
  // needs the user activation that event carries.
  const load = async (open: () => Promise<VaultHandle | null>, message: string) => {
    setBusy(true);
    setStatus(message);
    try {
      const vault = await open();
      if (vault) return onVault(vault);
      setStatus(null);
    } catch {
      setStatus("Couldn't read that folder.");
    }
    setBusy(false);
  };

  const choose = (choice: Choice) => {
    if (busy) return;
    if (choice === 'vault') load(openVault, 'Reading your vault...');
    else if (choice === 'demo') load(openDemoVault, 'Walking to the demo town...');
    else setView('hero');
  };

  const closeHero = () => {
    bus.emit('appearance-changed', undefined);
    setView('menu');
  };

  useEffect(() => {
    if (view !== 'menu') return;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === 'ArrowUp' || k === 'w' || k === 'W') setCursor((c) => (c + ITEMS.length - 1) % ITEMS.length);
      else if (k === 'ArrowDown' || k === 's' || k === 'S') setCursor((c) => (c + 1) % ITEMS.length);
      else if (k === 'Enter' || k === ' ') {
        if (!e.repeat) choose(ITEMS[cursor][0]);
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <h1 className={pixel.ribbon}>Notekeep Town</h1>
        <p className={`${pixel.outlined} ${styles.subtitle}`}>Your notes, as a town you can walk around</p>
      </header>

      <div className={styles.stage}>
        {view === 'menu' ? (
          <div className={pixel.parchment}>
            <ul role="menu" className={styles.menu}>
              {ITEMS.map(([choice, label], i) => (
                <li key={choice} role="none">
                  <button
                    role="menuitem"
                    className={`${styles.item} ${i === cursor ? styles.current : ''}`}
                    disabled={busy}
                    onMouseEnter={() => setCursor(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(choice)}
                  >
                    <span className={`${pixel.cursor} ${i === cursor && !busy ? '' : pixel.cursorIdle}`} />
                    {label}
                  </button>
                </li>
              ))}
            </ul>
            {status && <p className={styles.status}>{status}</p>}
          </div>
        ) : (
          <CharacterCreator onDone={closeHero} />
        )}

        <p className={`${pixel.outlined} ${styles.hint}`}>
          {view === 'menu'
            ? 'Arrow keys to choose, Enter to select'
            : 'Up/Down picks a row, Left/Right changes it, Enter when done'}
        </p>
      </div>
    </div>
  );
}
