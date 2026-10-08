'use client';

import { useEffect, useRef, useState } from 'react';
import { sfx } from '@/game/audio/sfx';
import { normalizeAnswer, shuffle } from '@/lib/quiz';
import type { GameProps } from '../Arcade';
import styles from '../Arcade.module.css';

const LIVES = 3;
const START_SECONDS = 9;
const SPEEDUP = 0.92;

type Round = { definition: string; answer: string; terms: string[] };

function makeRound(cards: GameProps['cards']): Round {
  const [card, ...others] = shuffle(cards);
  const wrong = shuffle(others.filter((c) => c.front.toLowerCase() !== card.front.toLowerCase()))
    .slice(0, 3)
    .map((c) => c.front);
  return { definition: card.back, answer: card.front, terms: shuffle([card.front, ...wrong]) };
}

// A definition sits at the bottom; four terms fall. Type the right one before it lands.
export default function WordRain({ cards, best, onEnd }: GameProps) {
  const [round, setRound] = useState(() => makeRound(cards));
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(LIVES);
  const [typed, setTyped] = useState('');
  const [progress, setProgress] = useState(0);
  const [flash, setFlash] = useState<'right' | 'wrong' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // The falling loop reads these, so a landing is counted once and the game ends once.
  const live = useRef({ start: performance.now(), seconds: START_SECONDS, score: 0, lives: LIVES, over: false });

  const nextRound = () => {
    setRound(makeRound(cards));
    setTyped('');
    setProgress(0);
    live.current.start = performance.now();
  };

  const miss = () => {
    const g = live.current;
    if (g.over) return;
    sfx('error');
    setFlash('wrong');
    g.lives -= 1;
    setLives(g.lives);
    if (g.lives <= 0) {
      g.over = true;
      onEnd(g.score);
      return;
    }
    nextRound();
  };
  const missRef = useRef(miss);
  missRef.current = miss;

  useEffect(() => {
    inputRef.current?.focus();
    let raf = 0;
    let hiddenAt: number | null = null;
    const tick = (now: number) => {
      const g = live.current;
      if (document.hidden) hiddenAt ??= now;
      else {
        if (hiddenAt !== null) {
          g.start += now - hiddenAt;
          hiddenAt = null;
        }
        const p = (now - g.start) / (g.seconds * 1000);
        if (p >= 1) missRef.current();
        else setProgress(p);
      }
      if (!g.over) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 300);
    return () => clearTimeout(t);
  }, [flash]);

  const submit = () => {
    if (!typed.trim() || live.current.over) return;
    if (normalizeAnswer(typed) !== normalizeAnswer(round.answer)) {
      miss();
      return;
    }
    const g = live.current;
    sfx('select');
    setFlash('right');
    g.score += 1;
    g.seconds *= SPEEDUP;
    setScore(g.score);
    nextRound();
  };

  // Escape still reaches the console (it leaves the game); everything else is typing.
  const stop = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape') e.stopPropagation();
  };

  return (
    <div className={`${styles.game} ${flash ? styles[flash] : ''}`}>
      <div className={styles.hud}>
        <span>SCORE {score}</span>
        <span className={styles.lives}>{'♥'.repeat(lives)}{'♡'.repeat(LIVES - lives)}</span>
        <span>BEST {best ?? '-'}</span>
      </div>
      <div className={styles.sky}>
        {round.terms.map((t, i) => (
          <span key={`${t}-${i}`} className={styles.drop} style={{ left: `${3 + i * 24.5}%`, top: `${progress * 85}%` }}>
            {t}
          </span>
        ))}
        <div className={styles.ground} />
      </div>
      <p className={styles.definition}>{round.definition}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          ref={inputRef}
          className={styles.input}
          value={typed}
          placeholder="type the matching term, then Enter"
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={stop}
          onKeyUp={stop}
        />
      </form>
    </div>
  );
}
