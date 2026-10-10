'use client';

import { useEffect, useState } from 'react';
import { bus } from '@/game/bus';
import { sfx } from '@/game/audio/sfx';
import { useVault } from '@/lib/vault/open';
import { loadHouseCards } from '@/lib/houseCards';
import { readPref, writePref } from '@/lib/vaultPrefs';
import type { Card } from '@/lib/flashcards';
import WordRain from './arcade/WordRain';
import Match from './arcade/Match';
import styles from './Arcade.module.css';

export type GameProps = { cards: Card[]; best: number | null; onEnd: (score: number) => void };

const CARTRIDGES = [
  { id: 'word-rain', name: 'Word Rain', minCards: 4, better: 'higher', blurb: 'Type the falling term that matches the definition.', Game: WordRain },
  { id: 'match', name: 'Match', minCards: 8, better: 'lower', blurb: 'Flip tiles to pair each term with its definition. Fewest moves wins.', Game: Match },
] as const;
type CartridgeId = (typeof CARTRIDGES)[number]['id'];
type Scores = Record<string, number>;
const PREF = 'arcade';

// Opened from a TV console or arcade cabinet (InteriorScene). Just for fun: no coins, no streak.
export default function Arcade() {
  const { vault } = useVault();
  const [houseId, setHouseId] = useState<string | null>(null);
  const [cards, setCards] = useState<Card[] | null>(null);
  const [playing, setPlaying] = useState<CartridgeId | null>(null);
  const [cursor, setCursor] = useState(0);
  const [scores, setScores] = useState<Scores>({});
  const [last, setLast] = useState<{ id: CartridgeId; score: number; record: boolean } | null>(null);

  useEffect(() => {
    const onOpen = ({ houseId }: { houseId: string }) => {
      setHouseId(houseId);
      setCards(null);
      setPlaying(null);
      setLast(null);
      setCursor(0);
      setScores(readPref<Scores>(PREF, {}));
      sfx('open');
    };
    bus.on('open-arcade', onOpen);
    return () => bus.off('open-arcade', onOpen);
  }, []);

  useEffect(() => {
    if (!houseId || !vault) return;
    let live = true;
    loadHouseCards(vault, houseId).then((d) => live && setCards((d?.cards ?? []).filter((c) => c.kind === 'pair')));
    return () => { live = false; };
  }, [houseId, vault]);

  const close = () => {
    setHouseId(null);
    sfx('close');
    bus.emit('close-arcade', undefined);
  };

  const keyOf = (id: CartridgeId) => `${houseId}|${id}`;
  const playable = (c: (typeof CARTRIDGES)[number]) => (cards?.length ?? 0) >= c.minCards;

  const end = (id: CartridgeId, score: number) => {
    const cart = CARTRIDGES.find((c) => c.id === id)!;
    const best = scores[keyOf(id)];
    const record = best === undefined || (cart.better === 'higher' ? score > best : score < best);
    if (record) {
      const next = { ...scores, [keyOf(id)]: score };
      setScores(next);
      writePref(PREF, next);
    }
    setLast({ id, score, record });
    setPlaying(null);
    sfx(record ? 'coin' : 'select');
  };

  useEffect(() => {
    if (!houseId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (playing) setPlaying(null);
        else close();
      } else if (!playing && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        const step = e.key === 'ArrowUp' ? CARTRIDGES.length - 1 : 1;
        setCursor((c) => (c + step) % CARTRIDGES.length);
      } else if (!playing && (e.key === 'Enter' || e.key === ' ')) {
        const cart = CARTRIDGES[cursor];
        if (playable(cart)) { setLast(null); setPlaying(cart.id); }
      } else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  if (!houseId) return null;
  const cart = CARTRIDGES.find((c) => c.id === playing);

  return (
    <div className={styles.screen} onClick={close}>
      <div className={styles.tv} onClick={(e) => e.stopPropagation()}>
        <div className={styles.glass}>
          {!cards ? (
            <p className={styles.blink}>Loading…</p>
          ) : cart ? (
            <cart.Game cards={cards} best={scores[keyOf(cart.id)] ?? null} onEnd={(s) => end(cart.id, s)} />
          ) : (
            <div className={styles.menu}>
              <p className={styles.logo}>NOTEKEEP ARCADE</p>
              {last && <p className={styles.last}>{last.record ? 'New record! ' : ''}Score: {last.score}</p>}
              <ul>
                {CARTRIDGES.map((c, i) => (
                  <li key={c.id}>
                    <button
                      className={`${styles.cart} ${i === cursor ? styles.current : ''}`}
                      disabled={!playable(c)}
                      onMouseEnter={() => setCursor(i)}
                      onClick={() => { setLast(null); setPlaying(c.id); }}
                    >
                      <span className={styles.cartName}>{c.name}</span>
                      <span className={styles.blurb}>{playable(c) ? c.blurb : `Needs ${c.minCards} cards (term :: definition lines) in this house; it has ${cards.length}.`}</span>
                      {scores[keyOf(c.id)] !== undefined && <span className={styles.best}>Best: {scores[keyOf(c.id)]}</span>}
                    </button>
                  </li>
                ))}
              </ul>
              <p className={styles.hint}>↑↓ choose · Enter play · Esc leave</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
