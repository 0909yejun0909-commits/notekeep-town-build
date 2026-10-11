'use client';

import { useEffect, useRef, useState } from 'react';
import { bus } from '@/game/bus';
import { conversation, helpFor, type NpcPage } from '@/lib/npcHelp';
import styles from './NpcDialogue.module.css';
import pixel from './pixelUi.module.css';

const NAMES: Record<string, string> = { farmer_bob: 'Farmer Bob', bartender_katy: 'Katy' };
const TYPE_MS = 28;
// Walking this far (world pixels) from where the chat started ends it.
const WALK_AWAY = 40;

type Talk = { npcId: string; page: NpcPage };

const registry = () => (window as any).__game?.registry;

// What an NPC says, in an RPG text box: the name on a tab, the line typed out letter by
// letter. Space (the talk key) skips the typing, then closes it; so does walking off, Esc
// or a click. An NPC that can help with your notes (lib/npcHelp.ts) offers choices under its
// line instead, picked with Up/Down and Enter or Space, and holds you there until you're done.
export default function NpcDialogue() {
  const [talk, setTalk] = useState<Talk | null>(null);
  const [shown, setShown] = useState(0);
  const [cursor, setCursor] = useState(0);
  const live = useRef({ talk, shown, cursor });
  live.current = { talk, shown, cursor };

  useEffect(() => {
    // While a line is up, Space belongs to the box (below), even if the NPC has wandered off.
    const onTalk = ({ npcId, line }: { npcId: string; line: string }) => {
      if (live.current.talk) return;
      const say = (page: NpcPage) => {
        setTalk({ npcId, page });
        setShown(0);
        setCursor(0);
      };
      const help = helpFor(npcId, registry()?.get('world')?.name);
      say(help ? conversation(help, say, () => setTalk(null)) : { line });
    };
    const close = () => setTalk(null);
    bus.on('talk-npc', onTalk);
    bus.on('enter-house', close);
    bus.on('open-town-editor', close);
    return () => {
      bus.off('talk-npc', onTalk);
      bus.off('enter-house', close);
      bus.off('open-town-editor', close);
    };
  }, []);

  // A conversation (choices, or more to come) keeps the player still: the arrow keys are
  // the menu's (OverworldScene.update()).
  const holding = !!talk && !!(talk.page.options || talk.page.next);
  useEffect(() => {
    registry()?.set('npcTalking', !!talk);
    registry()?.set('npcConversation', holding);
  }, [talk, holding]);
  useEffect(() => () => registry()?.set('npcConversation', false), []);

  // Type the line out, paced by the clock so a slow frame doesn't slow the reading.
  useEffect(() => {
    if (!talk) return;
    const line = talk.page.line;
    const start = performance.now();
    const t = setInterval(() => {
      const n = Math.floor((performance.now() - start) / TYPE_MS);
      setShown((cur) => Math.max(cur, Math.min(n, line.length)));
      if (n >= line.length) clearInterval(t);
    }, TYPE_MS);
    return () => clearInterval(t);
  }, [talk]);

  // Space skips the typing, then picks or moves on; Esc closes; so does walking away.
  useEffect(() => {
    if (!talk) return;
    const player = registry()?.get('player');
    const from = player ? { x: player.x, y: player.y } : null;
    let raf = 0;
    const watch = () => {
      const p = registry()?.get('player');
      if (from && p && Math.hypot(p.x - from.x, p.y - from.y) > WALK_AWAY) return setTalk(null);
      raf = requestAnimationFrame(watch);
    };
    raf = requestAnimationFrame(watch);
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      const { page } = talk;
      const typed = live.current.shown >= page.line.length;
      const options = typed ? page.options : undefined;
      if (k === 'Escape') setTalk(null);
      else if (options && (k === 'ArrowUp' || k === 'w' || k === 'W')) setCursor((c) => (c + options.length - 1) % options.length);
      else if (options && (k === 'ArrowDown' || k === 's' || k === 'S')) setCursor((c) => (c + 1) % options.length);
      else if ((k === ' ' || (k === 'Enter' && typed)) && !e.repeat) advance();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
    };
  }, [talk]);

  function advance() {
    const { talk: t, shown: n, cursor: c } = live.current;
    if (!t) return;
    if (n < t.page.line.length) return setShown(t.page.line.length);
    if (t.page.options) return t.page.options[c]?.pick();
    if (t.page.next) return t.page.next();
    setTalk(null);
  }

  if (!talk) return null;
  const { page } = talk;
  const done = shown >= page.line.length;

  return (
    <div className={styles.dock} data-panel="npc-dialogue">
      <div className={`${pixel.parchment} ${styles.box}`} onClick={() => (!done || !page.options) && advance()}>
        <span className={styles.name}>{NAMES[talk.npcId] ?? talk.npcId}</span>
        <p className={styles.line}>
          {page.line.slice(0, shown)}
          {/* The rest, invisible, so the box is its final size from the first letter. */}
          <span className={styles.unshown}>{page.line.slice(shown)}</span>
        </p>
        {page.options && (
          <ul role="menu" className={`${styles.options} ${done ? '' : styles.unshown}`}>
            {page.options.map((o, i) => (
              <li key={o.label} role="none">
                <button
                  role="menuitem"
                  className={`${pixel.item} ${i === cursor ? pixel.current : ''}`}
                  disabled={!done}
                  onMouseEnter={() => setCursor(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation();
                    o.pick();
                  }}
                >
                  <span className={`${pixel.cursor} ${i === cursor ? '' : pixel.cursorIdle}`} />
                  {o.label}
                </button>
              </li>
            ))}
          </ul>
        )}
        {!page.options && (
          <span className={styles.more}>
            {done ? 'Space' : ''}
            <span className={`${pixel.cursor} ${styles.next} ${done ? '' : pixel.cursorIdle}`} />
          </span>
        )}
      </div>
    </div>
  );
}
