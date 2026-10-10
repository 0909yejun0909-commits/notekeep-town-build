'use client';

import { useEffect, useState } from 'react';
import { bus } from '@/game/bus';
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
export default function BiomePicker() {
  const [biome, setBiome] = useState<TownBiome | null>(null);
  const [indoors, setIndoors] = useState(false);
  const [building, setBuilding] = useState(false);
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
    bus.on('exit-house', onExit);
    bus.on('open-town-editor', onBuild);
    bus.on('close-town-editor', onBuilt);
    return () => {
      bus.off('enter-house', onEnter);
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
            className={`${styles.option} ${styles.build}`}
            data-tour="build"
            title="Decorate the town, paint paths and cut down trees"
            onClick={(e) => {
              e.currentTarget.blur();
              bus.emit('open-town-editor', undefined);
            }}
          >
            <span className={styles.name}>Build</span>
          </button>
        )}
      </div>
    </div>
  );
}
