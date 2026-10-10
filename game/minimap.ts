// Phaser-free on purpose, like sceneLabels.ts. The overworld publishes its layout once per
// build and a cheap per-frame reading; components/Minimap.tsx draws both.

import type { RoofColor, TownBiome } from '@/lib/types';

export const MINIMAP_TILE = { grass: 0, blocked: 1, road: 2, water: 3, plaza: 4 } as const;

export type MinimapHouse = { id: string; name: string; gx: number; gy: number; w: number; h: number; roof: RoofColor };

export type MinimapLayout = {
  w: number;
  h: number;
  biome: TownBiome;
  tiles: Uint8Array; // MINIMAP_TILE per tile, row-major
  houses: MinimapHouse[];
  areas: { name: string; gx: number; gy: number; w: number; h: number }[];
  townName: string;
};

// All in tiles; x,y of a body is its centre.
export type MinimapFrame = {
  player: { x: number; y: number };
  view: { x: number; y: number; w: number; h: number };
  peers: { x: number; y: number }[];
};

export type MinimapSource = { layout: MinimapLayout; frame: () => MinimapFrame };

let source: MinimapSource | null = null;

export function setMinimapSource(next: MinimapSource | null) {
  source = next;
}

export function getMinimapSource(): MinimapSource | null {
  return source;
}
