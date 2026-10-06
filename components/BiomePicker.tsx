'use client';

import { useEffect, useState } from 'react';
import { bus } from '@/game/bus';
import { TOWN_BIOMES, TOWN_BIOME_LABEL, loadTownBiome, saveTownBiome } from '@/lib/biome';
import type { TownBiome } from '@/lib/types';
import styles from './BiomePicker.module.css';

// 9x9 pixel icons, one letter per pixel, drawn 3x (27px, the CuteFantasy grid).
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

  useEffect(() => {
    setBiome(loadTownBiome());
    const onEnter = () => setIndoors(true);
    const onExit = () => setIndoors(false);
    bus.on('enter-house', onEnter);
    bus.on('exit-house', onExit);
    return () => {
      bus.off('enter-house', onEnter);
      bus.off('exit-house', onExit);
    };
  }, []);

  if (!biome || indoors) return null;

  function pick(next: TownBiome) {
    if (next === biome) return;
    setBiome(next);
    saveTownBiome(next);
    (window as any).__game?.registry.set('townBiome', next);
  }

  return (
    <div className={styles.corner}>
      <div className={styles.plank} role="group" aria-label="Town biome">
        <span className={styles.label}>Town</span>
        {TOWN_BIOMES.map((b) => (
          <button
            key={b}
            className={`${styles.option} ${b === biome ? styles.selected : ''}`}
            title={TOWN_BIOME_LABEL[b]}
            aria-pressed={b === biome}
            // Blur so Space, the game's talk/interact key, can't re-press a focused button.
            onClick={(e) => {
              e.currentTarget.blur();
              pick(b);
            }}
          >
            <PixelIcon biome={b} />
            <span className={styles.name}>{TOWN_BIOME_LABEL[b]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
