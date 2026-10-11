'use client';

import { useEffect, useState } from 'react';
import { bus } from '@/game/bus';
import { trackDistinct } from '@/lib/achievementStore';
import { DEFAULT_TOWN_BIOME, TOWN_BIOMES, TOWN_BIOME_LABEL, loadTownBiome, saveTownBiome } from '@/lib/biome';
import { biomeUnlockId } from '@/lib/wallet';
import { unlockAll, unlockCost, useWallet } from '@/lib/walletStore';
import Coin from './Coin';
import type { TownBiome } from '@/lib/types';
import styles from './BiomePicker.module.css';

// 9x9 pixel icons, one letter per pixel, drawn 3x (27px).
const ICONS: Record<TownBiome, { rows: string[]; palette: Record<string, string> }> = {
  forest: {
    rows: ['....g....', '...Ggd...', '..Gggdd..', '...Ggd...', '..Gggdd..', '.Ggggddd.', 'GGgggdddd', '....t....', '....t....'],
    palette: { G: '#63c74d', g: '#3e8948', d: '#265c42', t: '#91533b' },
  },
  snow: {
    rows: ['....L....', '.D..L..D.', '..L.L.L..', '...LWL...', 'LLLWWWLLL', '...LWL...', '..L.L.L..', '.D..L..D.', '....L....'],
    palette: { L: '#7fc8f0', D: '#3e8acc', W: '#ffffff' },
  },
  desert: {
    rows: ['....C....', '...Cck...', '.c.Cck...', '.c.Cck.c.', '.ccCck.c.', '...Cckcc.', '...Cck...', '...Cck...', 'sssssssss'],
    palette: { C: '#72bf6c', c: '#4f9a5a', k: '#2e6b3e', s: '#e4a672' },
  },
};

function PixelIcon({ biome }: { biome: TownBiome }) {
  const { rows, palette } = ICONS[biome];
  return (
    <svg className={styles.icon} width={27} height={27} viewBox="0 0 9 9" shapeRendering="crispEdges" aria-hidden>
      {rows.flatMap((row, y) =>
        [...row].map((ch, x) => (palette[ch] ? <rect key={`${x},${y}`} x={x} y={y} width={1} height={1} fill={palette[ch]} /> : null)),
      )}
    </svg>
  );
}

// The town's look is standing state, so it goes through the registry (which BootScene seeds)
// rather than the bus — Overworld and Title rebuild on its changedata event.
const BUILT_KEY = 'notekeep-town:built-once';
// An 8x8 hammer: H the iron head, W the handle.
const HAMMER = ['.HHHH...', 'HHHHH...', '.HHHH...', '...WW...', '...WW...', '...WW...', '...WW...', '...WW...'];

export default function BiomePicker() {
  const [biome, setBiome] = useState<TownBiome | null>(null);
  const [indoors, setIndoors] = useState(false);
  const [building, setBuilding] = useState(false);
  // Build glows until it's first opened, so it's found.
  const [builtOnce, setBuiltOnce] = useState(true);
  useEffect(() => {
    try {
      setBuiltOnce(localStorage.getItem(BUILT_KEY) === '1');
    } catch {
      setBuiltOnce(false);
    }
  }, []);
  // A biome still to buy takes two clicks: the first asks, the second pays.
  const [asking, setAsking] = useState<TownBiome | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const wallet = useWallet();
  const cost = (b: TownBiome) => unlockCost(wallet, biomeUnlockId(b));

  useEffect(() => {
    setBiome(loadTownBiome());
    const onEnter = () => setIndoors(true);
    const onExit = () => setIndoors(false);
    const onBuild = () => setBuilding(true);
    const onBuilt = () => setBuilding(false);
    bus.on('enter-house', onEnter);
    bus.on('fast-travel', onEnter);
    bus.on('exit-house', onExit);
    bus.on('open-town-editor', onBuild);
    bus.on('close-town-editor', onBuilt);
    return () => {
      bus.off('enter-house', onEnter);
      bus.off('fast-travel', onEnter);
      bus.off('exit-house', onExit);
      bus.off('open-town-editor', onBuild);
      bus.off('close-town-editor', onBuilt);
    };
  }, []);

  // A town that hasn't bought the biome last picked (on this browser, maybe for another vault)
  // opens in the forest.
  const lockedNow = biome !== null && wallet.active && cost(biome) > 0;
  useEffect(() => {
    if (lockedNow) apply(DEFAULT_TOWN_BIOME);
  }, [lockedNow]);

  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 4000);
    return () => clearTimeout(t);
  }, [note]);

  if (!biome || indoors || building) return null;

  function pick(next: TownBiome) {
    if (next === biome) return;
    const price = cost(next);
    if (price > 0) {
      if (!wallet.active) {
        setNote('Open your town to unlock biomes with coins.');
        return;
      }
      if (asking !== next) {
        setAsking(next);
        setNote(`${TOWN_BIOME_LABEL[next]} costs ${price} coins. Click again to buy it.`);
        return;
      }
      if (!unlockAll([biomeUnlockId(next)])) {
        setAsking(null);
        setNote(`${TOWN_BIOME_LABEL[next]} costs ${price} coins and you have ${wallet.balance}. Write notes to earn more!`);
        return;
      }
    }
    setAsking(null);
    setNote(null);
    apply(next);
  }

  function apply(next: TownBiome) {
    if (biome) trackDistinct('biomesTried', biome);
    trackDistinct('biomesTried', next);
    setBiome(next);
    saveTownBiome(next);
    (window as any).__game?.registry.set('townBiome', next);
  }

  return (
    <div className={styles.corner} data-hud>
      {note && <p className={styles.note}>{note}</p>}
      <div className={styles.plank} role="group" aria-label="Town biome">
        <span className={styles.label}>Town</span>
        {TOWN_BIOMES.map((b) => (
          <button
            key={b}
            className={`${styles.option} ${b === biome ? styles.selected : ''}`}
            title={cost(b) ? `${TOWN_BIOME_LABEL[b]}: ${cost(b)} coins` : TOWN_BIOME_LABEL[b]}
            aria-pressed={b === biome}
            // Blur so Space, the game's talk/interact key, can't re-press a focused button.
            onClick={(e) => {
              e.currentTarget.blur();
              pick(b);
            }}
          >
            <PixelIcon biome={b} />
            <span className={styles.name}>{asking === b ? 'Buy?' : TOWN_BIOME_LABEL[b]}</span>
            {cost(b) > 0 && (
              <span className={styles.price}>
                <Coin size={14} />
                {cost(b)}
              </span>
            )}
          </button>
        ))}
        {/* Village building: only for the town's owner, who has the coins to spend. */}
        {wallet.active && (
          <button
            className={`${styles.build} ${builtOnce ? '' : styles.buildNew}`}
            data-tour="build"
            title="Add houses, buy land, decorate the town and paint paths"
            onClick={(e) => {
              e.currentTarget.blur();
              if (!builtOnce) {
                setBuiltOnce(true);
                try {
                  localStorage.setItem(BUILT_KEY, '1');
                } catch {
                  // Storage unavailable: it just keeps glowing next time.
                }
              }
              bus.emit('open-town-editor', undefined);
            }}
          >
            <svg width={24} height={24} viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden>
              {HAMMER.flatMap((row, y) =>
                [...row].map((c, x) => (c === '.' ? null : <rect key={`${x},${y}`} x={x} y={y} width={1} height={1} fill={c === 'H' ? '#3f2832' : '#91533b'} />)),
              )}
            </svg>
            <span>Build</span>
          </button>
        )}
      </div>
    </div>
  );
}
