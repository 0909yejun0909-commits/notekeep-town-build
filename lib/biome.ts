import type { TownBiome } from './types';

export const TOWN_BIOMES: readonly TownBiome[] = ['forest', 'snow'];
export const TOWN_BIOME_LABEL: Record<TownBiome, string> = { forest: 'Forest', snow: 'Snow' };
export const DEFAULT_TOWN_BIOME: TownBiome = 'forest';

const KEY = 'notekeep-town:biome';

export function loadTownBiome(): TownBiome {
  if (typeof window === 'undefined') return DEFAULT_TOWN_BIOME;
  try {
    const raw = window.localStorage.getItem(KEY);
    return (TOWN_BIOMES as readonly string[]).includes(raw ?? '') ? (raw as TownBiome) : DEFAULT_TOWN_BIOME;
  } catch {
    return DEFAULT_TOWN_BIOME;
  }
}

export function saveTownBiome(biome: TownBiome): void {
  try {
    window.localStorage.setItem(KEY, biome);
  } catch {
    // Private browsing / storage disabled — the choice just won't persist across reloads.
  }
}
