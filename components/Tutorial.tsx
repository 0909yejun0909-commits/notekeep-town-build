'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import Spotlight, { type Rect } from './Spotlight';
import styles from './Spotlight.module.css';
import { endTutorial, markTutorialOffered, setTutorialStep, useTutorialStep } from '@/lib/tutorial';
import { useWallet } from '@/lib/walletStore';
import { MIN_WORDS, NOTE_REWARD } from '@/lib/wallet';
import { SHELF_W } from '@/lib/interiorLayout';

const TILE = 16;

// ------------------------------------------------------------ where things are on screen

const el = (sel: string) => (typeof document === 'undefined' ? null : document.querySelector(sel));
const rectOf = (sel: string): Rect | null => el(sel)?.getBoundingClientRect() ?? null;
const game = () => (window as any).__game;
const sceneOn = (key: string) => !!game()?.scene?.isActive(key);

// A rectangle in a running scene's world, in page coordinates.
function worldRect(sceneKey: string, x: number, y: number, w: number, h: number): Rect | null {
  const g = game();
  const scene = g?.scene?.getScene(sceneKey);
  if (!scene || !g.scene.isActive(sceneKey)) return null;
  const cam = scene.cameras.main;
  const canvas = g.canvas.getBoundingClientRect();
  const k = cam.zoom * (canvas.width / g.scale.width);
  return { left: canvas.left + (x - cam.worldView.x) * k, top: canvas.top + (y - cam.worldView.y) * k, width: w * k, height: h * k };
}

// The house nearest the player in the town.
function nearestHouse(): Rect | null {
  const g = game();
  const scene = g?.scene?.getScene('OverworldScene');
  if (!scene || !g.scene.isActive('OverworldScene')) return null;
  const player = g.registry.get('player');
  const houses = scene.children.list.filter((o: any) => o.type === 'Image' && o.input?.enabled);
  if (!player || houses.length === 0) return null;
  let best: any = null;
  let bestD = Infinity;
  for (const h of houses) {
    const b = h.getBounds();
    const d = Math.hypot(b.centerX - player.x, b.bottom - player.y);
    if (d < bestD) [best, bestD] = [b, d];
  }
  return worldRect('OverworldScene', best.x, best.y, best.width, best.height);
}

function bookshelf(): Rect | null {
  const scene = game()?.scene?.getScene('InteriorScene') as any;
  const shelf = scene?.layout?.shelf;
  return shelf ? worldRect('InteriorScene', shelf.gx * TILE, shelf.gy * TILE, SHELF_W * TILE, 2 * TILE) : null;
}

// ------------------------------------------------------------ the steps

type Ctx = { balance: number; startBalance: number };

type Step = {
  id: string;
  text: ReactNode;
  target?: () => Rect | null;
  keysOnly?: boolean;
  pin?: 'top' | 'bottom';
  next?: string; // a button that moves on, for steps that only explain
  done?: (c: Ctx) => boolean;
  // Where to pick up again if the player wandered off (closed the panel the step is about).
  lost?: () => string | null;
};

const inHouse = () => sceneOn('InteriorScene');
const shelfOpen = () => !!el('[data-tour="new-note"]');
const noteOpen = () => !!el('.note-book');
const roomEditorOpen = () => !!el('[data-tour="room-grid"]');
const houseEditorOpen = () => !!el('[data-tour="house-editor"]');

const STEPS: Step[] = [
  {
    id: 'welcome',
    text: (
      <>
        <p>Welcome to Notekeep Town!</p>
        <p>Every house is a folder of notes, and every book inside is a note. Let&apos;s write one, earn some coins and spend them.</p>
      </>
    ),
    next: "Let's go",
  },
  {
    id: 'walk',
    text: <p>Walk to this house with the arrow keys or WASD, then step through its door.</p>,
    target: nearestHouse,
    keysOnly: true,
    done: inHouse,
  },
  {
    id: 'shelf',
    text: <p>This bookshelf holds every note in the house. Walk up to it and press Space.</p>,
    target: bookshelf,
    keysOnly: true,
    done: shelfOpen,
    lost: () => (inHouse() ? null : 'walk'),
  },
  {
    id: 'new-note',
    text: <p>Click the + book to start a new note.</p>,
    target: () => rectOf('[data-tour="new-note"]'),
    done: () => !!el('[data-tour="note-namer"]') || noteOpen(),
    lost: () => (shelfOpen() ? null : 'shelf'),
  },
  {
    id: 'name',
    text: <p>Give your note a title, then press Create.</p>,
    target: () => rectOf('[data-tour="note-namer"]'),
    done: noteOpen,
    lost: () => (el('[data-tour="note-namer"]') || noteOpen() ? null : 'new-note'),
  },
  {
    id: 'type',
    text: (
      <p>
        Now write! Type anything you like. A note of {MIN_WORDS}+ words earns {NOTE_REWARD} coins: watch the counter
        under the page fill up.
      </p>
    ),
    target: () => rectOf('.note-book'),
    pin: 'top',
    done: () => /Save to earn/.test(el('[data-tour="note-progress"]')?.textContent ?? ''),
    // The book opens a moment before its editor does, so only a closed book counts as lost.
    lost: () => (noteOpen() ? null : shelfOpen() ? 'new-note' : 'shelf'),
  },
  {
    id: 'save',
    text: <p>That&apos;s {MIN_WORDS} words. Click Save to collect your coins.</p>,
    target: () => rectOf('[data-tour="note-save"]'),
    done: (c) => c.balance > c.startBalance,
    lost: () => (noteOpen() ? null : 'type'),
  },
  {
    id: 'paid',
    text: (
      <p>
        +{NOTE_REWARD} coins! Every new note of {MIN_WORDS}+ words pays, even ones you write in Obsidian. Your coins are
        up here.
      </p>
    ),
    target: () => rectOf('[data-tour="coins"]'),
    next: 'Next',
  },
  {
    id: 'pages',
    text: (
      <p>
        Long notes fill several pages: Prev and Next turn them. To change a note later, open it and press Edit, then
        Save.
      </p>
    ),
    target: () => rectOf('[data-tour="note-controls"]'),
    next: 'Next',
  },
  {
    id: 'close',
    text: <p>Press Esc to close the book, then Esc again to close the shelf.</p>,
    done: () => !noteOpen() && !shelfOpen(),
  },
  {
    id: 'customize',
    text: <p>Time to spend coins. Click CUSTOMIZE to decorate this room.</p>,
    target: () => rectOf('[data-tour="customize"]'),
    done: roomEditorOpen,
    lost: () => (inHouse() ? null : 'walk-again'),
  },
  {
    id: 'tile',
    text: <p>Click an empty floor tile to put something there.</p>,
    target: () => rectOf('[data-tour="room-grid"]'),
    done: () => !!el('[data-tour="furniture"]'),
    lost: () => (roomEditorOpen() ? null : 'customize'),
  },
  {
    id: 'buy',
    text: <p>Pick a piece. Ones you don&apos;t own yet show their price, and buying it takes the coins.</p>,
    target: () => rectOf('[data-tour="furniture"]'),
    done: (c) => c.balance < c.startBalance,
    lost: () => (!roomEditorOpen() ? 'customize' : el('[data-tour="furniture"]') ? null : 'tile'),
  },
  {
    id: 'room-save',
    text: <p>Click Save to keep your new room. Pieces you take out go back to your inventory for free.</p>,
    target: () => rectOf('[data-tour="room-save"]'),
    done: () => !roomEditorOpen(),
  },
  {
    id: 'exit',
    text: <p>Now walk out through the door at the bottom of the room.</p>,
    target: () => rectOf('[data-tour="exit"]'),
    keysOnly: true,
    done: () => sceneOn('OverworldScene'),
  },
  {
    id: 'house',
    text: <p>Houses can be upgraded too. Click this house to change how it looks outside.</p>,
    target: nearestHouse,
    done: houseEditorOpen,
  },
  {
    id: 'roof',
    text: <p>Try a different roof colour. A coin on an option means you haven&apos;t bought it yet.</p>,
    target: () => rectOf('[data-tour="house-roof"]'),
    done: () => /Buy/.test(el('[data-tour="house-save"]')?.textContent ?? ''),
    lost: () => (houseEditorOpen() ? null : 'house'),
  },
  {
    id: 'house-save',
    text: <p>Click Buy and save. Anything you buy here works on every house, for good.</p>,
    target: () => rectOf('[data-tour="house-save"]'),
    done: () => !houseEditorOpen(),
  },
  {
    id: 'more',
    text: (
      <p>
        Coins also unlock new town biomes down here, and new outfits at the wardrobe inside houses. Bigger houses are
        upgrades too.
      </p>
    ),
    target: () => rectOf('[aria-label="Town biome"]'),
    next: 'Next',
  },
  {
    id: 'home',
    text: <p>That&apos;s everything! Home takes you back to the title screen, where you can open your own notes folder.</p>,
    target: () => rectOf('[data-tour="home"]'),
    next: 'Finish',
  },
];

// Picked up again after wandering out of a house before CUSTOMIZE.
STEPS.splice(STEPS.findIndex((s) => s.id === 'customize'), 0, {
  id: 'walk-again',
  text: <p>Head back into a house to carry on.</p>,
  target: nearestHouse,
  keysOnly: true,
  done: inHouse,
});
// Only reached through `lost`: in order, a player who stayed inside skips it.
const SKIP_IN_ORDER = new Set(['walk-again']);

const indexOf = (id: string) => STEPS.findIndex((s) => s.id === id);

function finish() {
  markTutorialOffered();
  endTutorial();
}

export default function Tutorial() {
  const step = useTutorialStep();
  const wallet = useWallet();
  const balance = useRef(wallet.balance);
  balance.current = wallet.balance;
  const startBalance = useRef(wallet.balance);

  useEffect(() => {
    startBalance.current = balance.current;
  }, [step]);

  useEffect(() => {
    if (step === null) return;
    let raf = 0;
    const tick = () => {
      const s = STEPS[step];
      const ctx = { balance: balance.current, startBalance: startBalance.current };
      // Finishing a step often closes the panel it was about, so done is checked first.
      if (s?.done?.(ctx)) {
        let next = step + 1;
        while (next < STEPS.length && SKIP_IN_ORDER.has(STEPS[next].id)) next++;
        if (next >= STEPS.length) finish();
        else setTutorialStep(next);
        return;
      }
      const back = s?.lost?.();
      if (back) {
        setTutorialStep(indexOf(back));
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [step]);

  if (step === null || !STEPS[step]) return null;
  const s = STEPS[step];

  const advance = () => {
    if (step + 1 >= STEPS.length) finish();
    else setTutorialStep(step + 1);
  };

  return (
    <Spotlight
      key={s.id}
      target={s.target ?? (() => null)}
      keysOnly={s.keysOnly}
      pin={s.pin}
      actions={
        <>
          {s.id !== 'home' && (
            <button className={`${styles.button} ${styles.quiet}`} onMouseDown={(e) => e.preventDefault()} onClick={finish}>
              Skip tutorial
            </button>
          )}
          {s.next && (
            // No focus on press, so Space (talk / interact) can't press it again later.
            <button className={styles.button} onMouseDown={(e) => e.preventDefault()} onClick={advance}>
              {s.next}
            </button>
          )}
        </>
      }
    >
      {s.text}
    </Spotlight>
  );
}
