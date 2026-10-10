'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Spotlight, { type Rect } from './Spotlight';
import styles from './Spotlight.module.css';
import { bus } from '@/game/bus';
import { endTutorial, markTutorialOffered, setTutorialStep, useTutorialStep } from '@/lib/tutorial';
import { topUpTutorial, useWallet } from '@/lib/walletStore';
import { MIN_WORDS, NOTE_REWARD } from '@/lib/wallet';
import { SHELF_W } from '@/lib/interiorLayout';
import type { WorldModel } from '@/lib/types';

const TILE = 16;

// ------------------------------------------------------------ where things are on screen

const el = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel);
const rectOf = (sel: string): Rect | null => el(sel)?.getBoundingClientRect() ?? null;
const rectsOf = (sel: string): Rect[] => [...document.querySelectorAll(sel)].map((e) => e.getBoundingClientRect());
const game = () => (window as any).__game;
const sceneOn = (key: string) => !!game()?.scene?.isActive(key);
const scene = (key: string) => game()?.scene?.getScene(key) as any;

// A rectangle in a running scene's world, in page coordinates.
function worldRect(sceneKey: string, x: number, y: number, w: number, h: number): Rect | null {
  const g = game();
  if (!g || !sceneOn(sceneKey)) return null;
  const cam = scene(sceneKey).cameras.main;
  const canvas = g.canvas.getBoundingClientRect();
  const k = cam.zoom * (canvas.width / g.scale.width);
  return { left: canvas.left + (x - cam.worldView.x) * k, top: canvas.top + (y - cam.worldView.y) * k, width: w * k, height: h * k };
}

// Menus and editors the player is looking at (marked data-panel).
const panelOpen = () => !!el('[data-panel]');

// The player's own character: highlighted whenever no panel hides it.
function playerRect(): Rect | null {
  if (panelOpen()) return null;
  const inside = sceneOn('InteriorScene');
  const key = inside ? 'InteriorScene' : sceneOn('OverworldScene') ? 'OverworldScene' : null;
  const p = key && (inside ? scene(key).player : game().registry.get('player'));
  return p ? worldRect(key!, p.x - 9, p.y - 22, 18, 26) : null;
}

// The house nearest the player in the town.
function nearestHouseSprite(): any {
  if (!sceneOn('OverworldScene')) return null;
  const player = game().registry.get('player');
  const houses = scene('OverworldScene').children.list.filter((o: any) => o.type === 'Image' && o.getData?.('houseId'));
  let best: any = null;
  let bestD = Infinity;
  for (const h of houses) {
    const b = h.getBounds();
    const d = Math.hypot(b.centerX - player.x, b.bottom - player.y);
    if (d < bestD) [best, bestD] = [h, d];
  }
  return best;
}

function nearestHouse(): Rect | null {
  const h = nearestHouseSprite();
  if (!h) return null;
  const b = h.getBounds();
  return worldRect('OverworldScene', b.x, b.y, b.width, b.height);
}

function bookshelf(): Rect | null {
  const shelf = scene('InteriorScene')?.layout?.shelf;
  return shelf && sceneOn('InteriorScene') ? worldRect('InteriorScene', shelf.gx * TILE, shelf.gy * TILE, SHELF_W * TILE, 2 * TILE) : null;
}

function room(): Rect | null {
  const s = scene('InteriorScene');
  return s && sceneOn('InteriorScene') ? worldRect('InteriorScene', 0, 0, s.roomPxW, s.roomPxH) : null;
}

function union(a: Rect | null, b: Rect | null): Rect | null {
  if (!a || !b) return a ?? b;
  const l = Math.min(a.left, b.left), t = Math.min(a.top, b.top);
  return { left: l, top: t, width: Math.max(a.left + a.width, b.left + b.width) - l, height: Math.max(a.top + a.height, b.top + b.height) - t };
}

// ------------------------------------------------------------ doing a step for the player

const click = (sel: string) => el(sel)?.click();

// Sets a React-controlled field the way typing would.
function type(field: HTMLInputElement | HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value')!.set!.call(field, value);
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

function enterNearestHouse() {
  const houseId = nearestHouseSprite()?.getData('houseId');
  if (houseId) bus.emit('enter-house', { houseId });
}

function openNearestHouseEditor() {
  const houseId = nearestHouseSprite()?.getData('houseId');
  const world = game()?.registry.get('world') as WorldModel | undefined;
  const region = world?.regions.find((r) => r.houses.some((h) => h.id === houseId));
  const house = region?.houses.find((h) => h.id === houseId);
  if (house && region) scene('OverworldScene').openExteriorEditor(house, region);
}

// Empty floor tiles are the cells nothing reacts to but the furniture list: try them in
// turn from the middle of the room until the list opens.
async function pickEmptyTile() {
  const cells = [...document.querySelectorAll<HTMLElement>('[data-tour="room-grid"] button')];
  const middle = Math.floor(cells.length / 2);
  const order = cells.map((c, i) => [c, Math.abs(i - middle)] as const).sort((a, b) => a[1] - b[1]).map(([c]) => c);
  for (const cell of order) {
    if (el('[data-tour="furniture"]') || !el('[data-tour="room-grid"]')) return;
    cell.click();
    await new Promise((r) => setTimeout(r, 60));
  }
}

function buyCheapest() {
  const price = (b: Element) => Number(b.textContent?.match(/\d+/)?.[0] ?? Infinity);
  const tiles = [...document.querySelectorAll<HTMLButtonElement>('[data-tour="furniture"] button:not([disabled])')];
  tiles.sort((a, b) => price(a) - price(b))[0]?.click();
}

const SAMPLE_NOTE =
  'Today I explored Notekeep Town. Every house is a folder and every book on a shelf is a note. ' +
  'Writing a note of thirty words or more earns coins, which buy furniture, house upgrades, outfits and new biomes.';

// ------------------------------------------------------------ the steps

type Ctx = { balance: number; startBalance: number };

type Step = {
  id: string;
  text: ReactNode;
  target?: () => Rect | null;
  also?: () => Rect | null; // something else to keep lit, without an arrow
  keysOnly?: boolean; // walking: the highlight takes no clicks
  enterInField?: boolean; // Enter in a text field still means Next (a one-line field)
  done?: (c: Ctx) => boolean; // absent: an explanation, Next moves on
  auto?: () => void; // what Next does on a step that asks for an action: the action itself
  onEnter?: () => void;
  // Where to pick up again if the player wandered off (closed the panel the step is about).
  lost?: () => string | null;
};

const inHouse = () => sceneOn('InteriorScene');
const shelfOpen = () => !!el('[data-tour="new-note"]');
const noteOpen = () => !!el('.note-book');
const roomEditorOpen = () => !!el('[data-tour="room-grid"]');
const houseEditorOpen = () => !!el('[data-tour="house-editor"]');
const closeButton = () =>
  el('[data-tour="note-close"]') ? '[data-tour="note-close"]'
  : el('[data-tour="note-cancel"]') ? '[data-tour="note-cancel"]'
  : '[data-tour="shelf-close"]';

const STEPS: Step[] = [
  {
    id: 'welcome',
    text: (
      <>
        <p>Welcome to Notekeep Town! This is you.</p>
        <p>Every house is a folder of notes, and every book inside is a note. Let&apos;s write one, earn some coins and spend them.</p>
        <p>Press Enter or Next to go on.</p>
      </>
    ),
  },
  {
    id: 'walk',
    text: <p>Walk to this house with the arrow keys or WASD and step through its door. Or press Next to go straight in.</p>,
    target: nearestHouse,
    keysOnly: true,
    done: inHouse,
    auto: enterNearestHouse,
  },
  {
    id: 'shelf',
    text: <p>This bookshelf holds every note in the house. Walk up to it and press Space, or press Next.</p>,
    target: bookshelf,
    keysOnly: true,
    done: shelfOpen,
    auto: () => scene('InteriorScene').openShelf(),
    lost: () => (inHouse() ? null : 'walk'),
  },
  {
    id: 'new-note',
    text: <p>Click the + book to start a new note.</p>,
    target: () => rectOf('[data-tour="new-note"]'),
    done: () => !!el('[data-tour="note-namer"]') || noteOpen(),
    auto: () => click('[data-tour="new-note"]'),
    lost: () => (shelfOpen() ? null : 'shelf'),
  },
  {
    id: 'name',
    text: <p>Give your note a title, then press Create.</p>,
    enterInField: true,
    target: () => rectOf('[data-tour="note-namer"]'),
    done: noteOpen,
    auto: () => {
      const input = el<HTMLInputElement>('[data-tour="note-namer"] input');
      if (input && !input.value.trim()) type(input, 'My first note');
      setTimeout(() => el<HTMLFormElement>('[data-tour="note-namer"]')?.requestSubmit(), 50);
    },
    lost: () => (el('[data-tour="note-namer"]') || noteOpen() ? null : 'new-note'),
  },
  {
    id: 'type',
    text: (
      <p>
        Now write anything you like. At {MIN_WORDS} words the note is worth {NOTE_REWARD} coins: the counter under the
        left page shows how close you are.
      </p>
    ),
    target: () => rectOf('[data-tour="note-text"]'),
    also: () => rectOf('[data-tour="note-progress"]'),
    done: () => /Save to earn/.test(el('[data-tour="note-progress"]')?.textContent ?? ''),
    auto: () => {
      const area = el<HTMLTextAreaElement>('[data-tour="note-text"]');
      if (area) type(area, `${area.value}${area.value ? ' ' : ''}${SAMPLE_NOTE}`);
    },
    // The book opens a moment before its editor does, so only a closed book counts as lost.
    lost: () => (noteOpen() ? null : shelfOpen() ? 'new-note' : 'shelf'),
  },
  {
    id: 'save',
    text: <p>That&apos;s {MIN_WORDS} words. Click Save to collect your coins.</p>,
    target: () => rectOf('[data-tour="note-save"]'),
    also: () => rectOf('[data-tour="note-progress"]'),
    done: (c) => c.balance > c.startBalance,
    auto: () => click('[data-tour="note-save"]'),
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
  },
  {
    id: 'pages',
    text: <p>Long notes fill several pages: Prev and Next turn them. To change a note later, open it and press Edit.</p>,
    target: () => rectOf('[data-tour="note-controls"]'),
  },
  {
    id: 'close',
    text: <p>Close the book, then the shelf, with the highlighted button.</p>,
    target: () => rectOf(closeButton()),
    done: () => !noteOpen() && !shelfOpen(),
    auto: () => {
      click(closeButton());
      setTimeout(() => click(closeButton()), 120);
    },
  },
  {
    id: 'customize',
    text: <p>Time to spend coins. Click CUSTOMIZE to decorate this room.</p>,
    target: () => rectOf('[data-tour="customize"]'),
    done: roomEditorOpen,
    auto: () => scene('InteriorScene').openEditor(),
    lost: () => (inHouse() ? null : 'walk-again'),
  },
  {
    id: 'tile',
    text: <p>Click an empty floor tile to put something there.</p>,
    target: () => rectOf('[data-tour="room-grid"]'),
    done: () => !!el('[data-tour="furniture"]'),
    auto: () => void pickEmptyTile(),
    // Enough for the dearest piece and a bigger room on top.
    onEnter: () => topUpTutorial(230),
    lost: () => (roomEditorOpen() ? null : 'customize'),
  },
  {
    id: 'buy',
    text: <p>Pick a piece. Ones you don&apos;t own yet show their price, and buying takes the coins.</p>,
    target: () => rectOf('[data-tour="furniture"]'),
    done: (c) => c.balance < c.startBalance,
    auto: buyCheapest,
    lost: () => (!roomEditorOpen() ? 'customize' : el('[data-tour="furniture"]') ? null : 'tile'),
  },
  {
    id: 'room-save',
    text: <p>Click Save to keep your new room. Rooms start small: Medium and Large sizes can be bought up here too.</p>,
    target: () => rectOf('[data-tour="room-save"]'),
    done: () => !roomEditorOpen(),
    auto: () => click('[data-tour="room-save"]'),
  },
  {
    id: 'exit',
    text: <p>Now walk out through the door at the bottom of the room, or press Next.</p>,
    target: () => rectOf('[data-tour="exit"]'),
    keysOnly: true,
    done: () => sceneOn('OverworldScene'),
    auto: () => {
      const s = scene('InteriorScene');
      if (!s) return;
      s.exiting = true;
      bus.emit('exit-house', undefined);
    },
  },
  {
    id: 'house',
    text: <p>Houses can be upgraded too. Click this house to change how it looks outside.</p>,
    target: nearestHouse,
    done: houseEditorOpen,
    auto: openNearestHouseEditor,
    onEnter: () => topUpTutorial(205),
  },
  {
    id: 'roof',
    text: <p>Pick a different roof colour. A coin on a colour means you haven&apos;t bought it yet.</p>,
    target: () => rectOf('[data-tour="house-roof"]'),
    done: () => /Buy/.test(el('[data-tour="house-save"]')?.textContent ?? ''),
    auto: () => {
      const locked = [...document.querySelectorAll<HTMLElement>('[data-tour="house-roof"] button')].find((b) => b.querySelector('svg'));
      locked?.click();
    },
    lost: () => (houseEditorOpen() ? null : 'house'),
  },
  {
    id: 'house-save',
    text: <p>Click Buy and save. Anything you buy works on every house, for good.</p>,
    target: () => rectOf('[data-tour="house-save"]'),
    done: () => !houseEditorOpen(),
    auto: () => click('[data-tour="house-save"]'),
  },
  {
    id: 'more',
    text: (
      <p>
        Your house has its new roof! Down here, coins also unlock new town biomes, and Build lets you decorate the
        village, paint paths and cut down trees. New outfits are at the wardrobe inside houses.
      </p>
    ),
    target: () => rectOf('[aria-label="Town biome"]'),
  },
  {
    id: 'home',
    text: <p>That&apos;s everything! Home takes you back to the title screen, where you can open your own notes folder.</p>,
    target: () => rectOf('[data-tour="home"]'),
  },
];

// Picked up again after wandering out of a house before CUSTOMIZE.
STEPS.splice(STEPS.findIndex((s) => s.id === 'customize'), 0, {
  id: 'walk-again',
  text: <p>Head back into a house to carry on, or press Next.</p>,
  target: nearestHouse,
  keysOnly: true,
  done: inHouse,
  auto: enterNearestHouse,
});
// Only reached through `lost`: a player who stayed inside skips it.
const SKIP_IN_ORDER = new Set(['walk-again']);

const indexOf = (id: string) => STEPS.findIndex((s) => s.id === id);

function finish() {
  markTutorialOffered();
  endTutorial();
}

function advanceFrom(step: number) {
  let next = step + 1;
  while (next < STEPS.length && SKIP_IN_ORDER.has(STEPS[next].id)) next++;
  if (next >= STEPS.length) finish();
  else setTutorialStep(next);
}

// Interface the bubble must never cover: open panels and the always-on corners, plus, for
// walking steps, the room or the stretch of town between the player and where they're going.
function avoid(s: Step): Rect[] {
  const out = [...rectsOf('[data-panel]'), ...rectsOf('[data-hud]')];
  if (s.keysOnly) {
    const r = inHouse() ? room() : union(playerRect(), s.target?.() ?? null);
    if (r) out.push(r);
  }
  return out;
}

export default function Tutorial() {
  const step = useTutorialStep();
  const wallet = useWallet();
  const [skipping, setSkipping] = useState(false);
  const balance = useRef(wallet.balance);
  balance.current = wallet.balance;
  const startBalance = useRef(wallet.balance);
  // What Enter does right now: the bubble's main button (Next, Finish, or Keep going).
  const primary = useRef<{ press: () => void; inFields: boolean } | null>(null);

  useEffect(() => {
    setSkipping(false);
    if (step === null) return;
    STEPS[step]?.onEnter?.();
    startBalance.current = balance.current;
  }, [step]);

  useEffect(() => {
    if (step === null) return;
    let raf = 0;
    const tick = () => {
      const s = STEPS[step];
      // Finishing a step often closes the panel it was about, so done is checked first.
      if (s?.done?.({ balance: balance.current, startBalance: startBalance.current })) {
        advanceFrom(step);
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

  // Enter presses the main button. Registered once, on the window's capture phase, as the app
  // starts, so it runs before any panel's or the game's own Enter handling and one press can't
  // also save a panel or interact in the room. Typing in a field keeps its own Enter.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || !primary.current) return;
      const inField = (e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]');
      if (inField && !primary.current.inFields) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) primary.current.press();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  primary.current = null;
  if (step === null || !STEPS[step]) return null;
  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  // Explanations move on; steps that ask for something do it for the player.
  const next = () => {
    if (s.done && s.auto) s.auto();
    else advanceFrom(step);
  };

  primary.current = { press: skipping ? () => setSkipping(false) : last ? finish : next, inFields: !skipping && !!s.enterInField };

  const press = (fn: () => void) => ({ onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault(), onClick: fn });

  return (
    <Spotlight
      key={s.id}
      // The target first (the arrow points at it), then the player, always lit while visible.
      holes={() => [s.target ? s.target() : playerRect(), s.also?.() ?? null, s.target ? playerRect() : null]}
      avoid={() => avoid(s)}
      keysOnly={s.keysOnly}
      actions={
        skipping ? (
          <>
            <button className={`${styles.button} ${styles.quiet}`} {...press(finish)}>
              Skip it
            </button>
            <button className={`${styles.button} ${styles.primary}`} title="Enter" {...press(() => setSkipping(false))}>
              Keep going
            </button>
          </>
        ) : (
          <>
            {!last ? (
              <button className={`${styles.button} ${styles.quiet}`} {...press(() => setSkipping(true))}>
                Skip tutorial
              </button>
            ) : (
              <span />
            )}
            <button className={`${styles.button} ${styles.primary}`} title="Enter" {...press(last ? finish : next)}>
              {last ? 'Finish' : 'Next'}
            </button>
          </>
        )
      }
    >
      {skipping ? <p>Skip the rest of the tutorial? You can start it again any time from the title screen.</p> : s.text}
    </Spotlight>
  );
}
