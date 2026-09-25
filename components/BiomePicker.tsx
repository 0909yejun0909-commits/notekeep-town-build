'use client';

import { useEffect, useState } from 'react';
import { bus } from '@/game/bus';
import { TOWN_BIOMES, TOWN_BIOME_LABEL, loadTownBiome, saveTownBiome } from '@/lib/biome';
import type { TownBiome } from '@/lib/types';

const ICON: Record<TownBiome, string> = { forest: '🌲', snow: '❄️' };

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
    <div className="fixed right-4 top-4 z-30 flex items-center gap-2 rounded-lg bg-neutral-900/90 px-3 py-2 text-white">
      <span className="text-xs uppercase text-neutral-400">Town</span>
      {TOWN_BIOMES.map((b) => (
        <button
          key={b}
          className={`rounded border px-2 py-1 text-xs ${
            b === biome ? 'border-yellow-400 text-yellow-400' : 'border-neutral-600'
          }`}
          // Blur so Space, the game's talk/interact key, can't re-press a focused button.
          onClick={(e) => {
            e.currentTarget.blur();
            pick(b);
          }}
        >
          {ICON[b]} {TOWN_BIOME_LABEL[b]}
        </button>
      ))}
    </div>
  );
}
