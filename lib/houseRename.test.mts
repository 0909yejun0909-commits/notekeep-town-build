import { test } from 'node:test';
import assert from 'node:assert/strict';
import { movedPath } from './vault/paths.ts';
import { movedLayout, moveHouseSaves } from './houseRename.ts';

test('only the house and what is inside it move', () => {
  assert.equal(movedPath('Town/Home', 'Town/Home', 'Town/Den'), 'Town/Den');
  assert.equal(movedPath('Town/Home/Kitchen/a.md', 'Town/Home', 'Town/Den'), 'Town/Den/Kitchen/a.md');
  assert.equal(movedPath('Town/Homework/a.md', 'Town/Home', 'Town/Den'), 'Town/Homework/a.md');
  assert.equal(movedPath('Other/Home/a.md', 'Town/Home', 'Town/Den'), 'Other/Home/a.md');
});

test('furniture holding notes follows them', () => {
  const layout = {
    floorFrame: 0, wallTriple: 0, roomSize: 'small' as const, shelf: { gx: 1, gy: 1 },
    placements: [
      { item: 'desk' as never, gx: 0, gy: 0, rotation: 0 as const, noteId: 'Town/Home/a.md' },
      { item: 'lamp' as never, gx: 2, gy: 0, rotation: 0 as const },
    ],
  };
  const moved = movedLayout(layout, 'Town/Home', 'Town/Den');
  assert.equal(moved.placements[0].noteId, 'Town/Den/a.md');
  assert.equal(moved.placements[1].noteId, undefined);
});

test('room layouts and the look move to the new name, and nothing else', () => {
  const store = new Map<string, string>([
    ['interior:fp:Town/Home', JSON.stringify({ placements: [{ noteId: 'Town/Home/a.md' }] })],
    ['interior:fp:Town/Home/Kitchen', JSON.stringify({ placements: [] })],
    ['interior:fp:Town/Homework', 'keep'],
    ['interior:other:Town/Home', 'other vault'],
    ['exterior:fp:Town/Home', '{"variant":1}'],
  ]);
  (globalThis as any).localStorage = {
    get length() { return store.size; },
    key: (i: number) => [...store.keys()][i] ?? null,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  };
  moveHouseSaves('fp', 'Town/Home', 'Town/Den');
  assert.deepEqual([...store.keys()].sort(), [
    'exterior:fp:Town/Den', 'interior:fp:Town/Den', 'interior:fp:Town/Den/Kitchen', 'interior:fp:Town/Homework', 'interior:other:Town/Home',
  ]);
  assert.equal(JSON.parse(store.get('interior:fp:Town/Den')!).placements[0].noteId, 'Town/Den/a.md');
  assert.equal(store.get('exterior:fp:Town/Den'), '{"variant":1}');
  delete (globalThis as any).localStorage;
});
