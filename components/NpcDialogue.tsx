'use client';

import { useEffect, useRef, useState } from 'react';
import { bus } from '@/game/bus';
import styles from './NpcDialogue.module.css';
import pixel from './pixelUi.module.css';

const NAMES: Record<string, string> = { farmer_bob: 'Farmer Bob', bartender_katy: 'Katy' };
const TYPE_MS = 28;
// Walking this far (world pixels) from where the chat started ends it.
const WALK_AWAY = 40;

type Talk = { npcId: string; line: string };

// What an NPC says, in an RPG text box: the name on a tab, the line typed out letter by
// letter. Space (the talk key) skips the typing, then closes it; so does walking off, Esc
// or a click.
export default function NpcDialogue() {
  const [talk, setTalk] = useState<Talk | null>(null);
  const [shown, setShown] = useState(0);
  const live = useRef({ talk, shown });
  live.current = { talk, shown };

  useEffect(() => {
    // While a line is up, Space belongs to the box (below), even if the NPC has wandered off.
    const onTalk = (next: Talk) => {
      if (live.current.talk) return;
      setTalk(next);
      setShown(0);
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

  useEffect(() => {
    (window as any).__game?.registry.set('npcTalking', !!talk);
  }, [talk]);

  // Type the line out, paced by the clock so a slow frame doesn't slow the reading.
  useEffect(() => {
    if (!talk) return;
    const start = performance.now();
    const t = setInterval(() => {
      const n = Math.floor((performance.now() - start) / TYPE_MS);
      setShown((cur) => Math.max(cur, Math.min(n, talk.line.length)));
      if (n >= talk.line.length) clearInterval(t);
    }, TYPE_MS);
    return () => clearInterval(t);
  }, [talk]);

  // Space skips the typing, then closes; Esc closes; so does walking away.
  useEffect(() => {
    if (!talk) return;
    const player = (window as any).__game?.registry.get('player');
    const from = player ? { x: player.x, y: player.y } : null;
    let raf = 0;
    const watch = () => {
      const p = (window as any).__game?.registry.get('player');
      if (from && p && Math.hypot(p.x - from.x, p.y - from.y) > WALK_AWAY) return setTalk(null);
      raf = requestAnimationFrame(watch);
    };
    raf = requestAnimationFrame(watch);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTalk(null);
      if (e.key !== ' ' || e.repeat) return;
      if (live.current.shown < talk.line.length) setShown(talk.line.length);
      else setTalk(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
    };
  }, [talk]);

  if (!talk) return null;
  const done = shown >= talk.line.length;

  return (
    <div className={styles.dock} data-panel="npc-dialogue">
      <div
        className={`${pixel.parchment} ${styles.box}`}
        onClick={() => (done ? setTalk(null) : setShown(talk.line.length))}
      >
        <span className={styles.name}>{NAMES[talk.npcId] ?? talk.npcId}</span>
        <p className={styles.line}>
          {talk.line.slice(0, shown)}
          {/* The rest, invisible, so the box is its final size from the first letter. */}
          <span className={styles.unshown}>{talk.line.slice(shown)}</span>
        </p>
        <span className={styles.more}>
          {done ? 'Space' : ''}
          <span className={`${pixel.cursor} ${styles.next} ${done ? '' : pixel.cursorIdle}`} />
        </span>
      </div>
    </div>
  );
}
