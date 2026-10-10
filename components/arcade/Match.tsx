'use client';

import { useEffect, useRef, useState } from 'react';
import { sfx } from '@/game/audio/sfx';
import { shuffle } from '@/lib/quiz';
import type { GameProps } from '../Arcade';
import styles from '../Arcade.module.css';

const PAIRS = 8;
type Tile = { key: string; pair: string; text: string; side: 'term' | 'def' };

// Sixteen face-down tiles: eight terms, eight definitions. Fewest moves wins.
export default function Match({ cards, best, onEnd }: GameProps) {
  const [tiles] = useState<Tile[]>(() =>
    shuffle(
      shuffle(cards)
        .slice(0, PAIRS)
        .flatMap((c) => [
          { key: `${c.id}:t`, pair: c.id, text: c.front, side: 'term' as const },
          { key: `${c.id}:d`, pair: c.id, text: c.back, side: 'def' as const },
        ]),
    ),
  );
  const [up, setUp] = useState<number[]>([]);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [moves, setMoves] = useState(0);
  const ended = useRef(false);
  const pairs = tiles.length / 2;

  useEffect(() => {
    if (up.length !== 2) return;
    const [a, b] = up;
    const same = tiles[a].pair === tiles[b].pair;
    const t = setTimeout(() => {
      if (same) {
        sfx('select');
        setDone((d) => new Set(d).add(tiles[a].pair));
      } else sfx('close');
      setUp([]);
    }, same ? 250 : 900);
    return () => clearTimeout(t);
  }, [up, tiles]);

  const endTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(endTimer.current), []);
  useEffect(() => {
    if (done.size < pairs || ended.current) return;
    ended.current = true;
    endTimer.current = setTimeout(() => onEnd(moves), 600);
  }, [done, moves, pairs, onEnd]);

  const flip = (i: number) => {
    if (up.length === 2 || up.includes(i) || done.has(tiles[i].pair)) return;
    sfx('open');
    if (up.length === 1) setMoves((m) => m + 1);
    setUp([...up, i]);
  };

  return (
    <div className={styles.game}>
      <div className={styles.hud}>
        <span>MOVES {moves}</span>
        <span>{done.size}/{pairs}</span>
        <span>BEST {best ?? '-'}</span>
      </div>
      <div className={styles.grid}>
        {tiles.map((t, i) => {
          const shown = up.includes(i) || done.has(t.pair);
          return (
            <button
              key={t.key}
              className={[styles.tile, shown ? styles.shown : '', done.has(t.pair) ? styles.matched : '', shown ? styles[t.side] : ''].join(' ')}
              onClick={() => flip(i)}
            >
              {shown ? t.text : '?'}
            </button>
          );
        })}
      </div>
    </div>
  );
}
