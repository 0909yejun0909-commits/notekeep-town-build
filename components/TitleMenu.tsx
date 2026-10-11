'use client';

import { useEffect, useState } from 'react';
import styles from './TitleMenu.module.css';
import pixel from './pixelUi.module.css';
import CharacterCreator from './CharacterCreator';
import TitleFrame from './TitleFrame';
import Spotlight from './Spotlight';
import spot from './Spotlight.module.css';
import { openDemoVault, openTown, VaultError } from '@/lib/vault/open';
import { bus } from '@/game/bus';
import { sfx } from '@/game/audio/sfx';
import type { VaultHandle } from '@/lib/types';
import { endTutorial, markTutorialOffered, startTutorial, tutorialOffered } from '@/lib/tutorial';

type Choice = 'town' | 'demo' | 'hero' | 'credits';

const ITEMS: Array<[Choice, string]> = [
  ['town', 'Your town'],
  ['demo', 'Tutorial'],
  ['hero', 'Your hero'],
  ['credits', 'Credits'],
];

const DEVELOPERS = ['Jayden Yang', 'Jason Kim', 'Roy Park', 'Ian Hsu'];

export default function TitleMenu({ onVault }: { onVault: (vault: VaultHandle) => void }) {
  const [view, setView] = useState<'menu' | 'hero' | 'credits'>('menu');
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
    } catch (err) {
      setStatus(err instanceof VaultError ? err.message : "Couldn't read that folder.");
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
    if (choice !== 'hero' && choice !== 'credits') {
      markTutorialOffered();
      setFirstVisit(false);
    }
    if (choice === 'town') load(openTown, 'Opening your town...');
    else if (choice === 'demo') {
      startTutorial();
      load(openDemoVault, 'Starting the tutorial...');
    } else setView(choice);
  };

  const dismissPointer = () => {
    markTutorialOffered();
    setFirstVisit(false);
  };

  const closeHero = () => {
    bus.emit('appearance-changed', undefined);
    setView('menu');
  };

  // Any of Escape, Enter or Space leaves the credits.
  useEffect(() => {
    if (view !== 'credits') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      setView('menu');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view]);

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
          : view === 'credits'
            ? 'Enter or Esc to go back'
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
                  data-tour={choice === 'demo' ? 'tutorial' : choice === 'town' ? 'your-town' : undefined}
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
      ) : view === 'credits' ? (
        <div className={`${pixel.parchment} ${styles.credits}`}>
          <h2 className={styles.creditsTitle}>Credits</h2>
          <p className={styles.creditsRole}>Art</p>
          <p>
            <a href="https://kenmi-art.itch.io/" target="_blank" rel="noreferrer" className={styles.creditsLink}>
              Kenmi (kenmi-art.itch.io)
            </a>
          </p>
          <p className={styles.creditsRole}>Developers</p>
          <ul className={styles.creditsNames}>
            {DEVELOPERS.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
          <button
            className={`${pixel.item} ${pixel.current} ${styles.creditsBack}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setView('menu')}
          >
            <span className={pixel.cursor} />
            Back
          </button>
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
