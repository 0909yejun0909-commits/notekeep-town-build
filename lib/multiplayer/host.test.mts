import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorldPayload } from './host.ts';
import { saveLayout } from '@/lib/interiorStore';
import type { InteriorLayout, WorldModel } from '@/lib/types';

const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  },
});

const layout = (roomSize: InteriorLayout['roomSize']): InteriorLayout => ({
  floorFrame: 1, wallTriple: 2, roomSize, shelf: { gx: 3, gy: 1 }, placements: [],
});

test('the host shares a saved layout for every room, keyed by room id', () => {
  const world: WorldModel = {
    name: 'V',
    regions: [{
      id: 'R', name: 'R', biome: 'meadow',
      houses: [{
        id: 'R/H', name: 'H', gx: 0, gy: 0, variant: 0, material: 'wood', wallColor: 'base', roofColor: 'black',
        rooms: [
          { id: 'R/H', name: 'Main', notes: [] },
          { id: 'R/H/K', name: 'K', notes: [] },
          { id: 'R/H/Empty', name: 'Empty', notes: [] },
        ],
      }],
    }],
  };
  saveLayout('fp', 'R/H', layout('large'));
  saveLayout('fp', 'R/H/K', layout('small'));
  const { layouts } = buildWorldPayload(world, 'fp', 'notes');
  assert.deepEqual(layouts, { 'R/H': layout('large'), 'R/H/K': layout('small') });
});
