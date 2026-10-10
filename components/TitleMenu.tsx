'use client';

import { useEffect, useState } from 'react';
import styles from './TitleMenu.module.css';
import pixel from './pixelUi.module.css';
import CharacterCreator from './CharacterCreator';
import TitleFrame from './TitleFrame';
import Spotlight from './Spotlight';
import spot from './Spotlight.module.css';
import { openDemoVault, openVault } from '@/lib/vault/open';
import { bus } from '@/game/bus';
import { sfx } from '@/game/audio/sfx';
import type { VaultHandle } from '@/lib/types';
import { endTutorial, markTutorialOffered, startTutorial, tutorialOffered } from '@/lib/tutorial';

type Choice = 'vault' | 'demo' | 'hero';

const ITEMS: Array<[Choice, string]> = [
  ['vault', 'Open your vault'],
  ['demo', 'Tutorial'],
  ['hero', 'Your hero'],
];

export default function TitleMenu({ onVault }: { onVault: (vault: VaultHandle) => void }) {
  const [view, setView] = useState<'menu' | 'hero'>('menu');
  const [cursor, setCursor] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  // The very first visit points at the Tutorial, with everything else shaded.
  const [firstVisit, setFirstVisit] = useState(false);

  useEffect(() => {
    if (tutorialOffered()) return;
    setFirstVisit(true);
    setCursor(ITEMS.findIndex(([c]) => c === 'demo'));
  }, []);

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
    endTutorial();
    setBusy(false);
  };

  const moveTo = (i: number) => {
    if (i === cursor) return;
    sfx('move');
    setCursor(i);
  };

  const choose = (choice: Choice) => {
    if (busy) return;
    sfx('select');
    if (choice !== 'hero') {
      markTutorialOffered();
      setFirstVisit(false);
    }
    if (choice === 'vault') load(openVault, 'Reading your vault...');
    else if (choice === 'demo') {
      startTutorial();
      load(openDemoVault, 'Starting the tutorial...');
    } else setView('hero');
  };

  const dismissPointer = () => {
    markTutorialOffered();
    setFirstVisit(false);
  };

  const closeHero = () => {
    bus.emit('appearance-changed', undefined);
    setView('menu');
  };

  useEffect(() => {
    if (view !== 'menu') return;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === 'ArrowUp' || k === 'w' || k === 'W') moveTo((cursor + ITEMS.length - 1) % ITEMS.length);
      else if (k === 'ArrowDown' || k === 's' || k === 'S') moveTo((cursor + 1) % ITEMS.length);
      else if (k === 'Enter' || k === ' ') {
        if (!e.repeat) choose(ITEMS[cursor][0]);
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <TitleFrame
      subtitle="Your notes, as a town you can walk around"
      hint={
        view === 'menu'
          ? 'Arrow keys to choose, Enter to select'
          : 'Up/Down picks a row, Left/Right changes it, Enter when done'
      }
    >
      {view === 'menu' ? (
        <div className={pixel.parchment}>
          <ul role="menu" className={styles.menu}>
            {ITEMS.map(([choice, label], i) => (
              <li key={choice} role="none">
                <button
                  role="menuitem"
                  data-tour={choice === 'demo' ? 'tutorial' : undefined}
                  className={`${pixel.item} ${i === cursor ? pixel.current : ''}`}
                  disabled={busy}
                  onMouseEnter={() => moveTo(i)}
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
      {firstVisit && view === 'menu' && !busy && (
        <Spotlight
          holes={() => [document.querySelector('[data-tour="tutorial"]')?.getBoundingClientRect() ?? null]}
          avoid={() => [document.querySelector('[role="menu"]')?.getBoundingClientRect() ?? null]}
          actions={
            <>
              <button className={`${spot.button} ${spot.quiet}`} onMouseDown={(e) => e.preventDefault()} onClick={dismissPointer}>
                No thanks
              </button>
              <button className={`${spot.button} ${spot.primary}`} onMouseDown={(e) => e.preventDefault()} onClick={() => choose('demo')}>
                Start tutorial
              </button>
            </>
          }
        >
          <p>New here? Start with the Tutorial: it shows you how to write notes, earn coins and spend them.</p>
        </Spotlight>
      )}
    </TitleFrame>
  );
}
