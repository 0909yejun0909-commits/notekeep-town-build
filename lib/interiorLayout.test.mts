import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FLOOR_FRAMES, ROOM_SIZES, SHELF_GY, canResize, computeDefaultLayout, doorCells, doorSlots, shelfGxFor,
} from './interiorLayout.ts';
import { CATALOG_BY_ID } from './catalog.ts';
import { hash } from './types.ts';
import type { House, InteriorLayout, NoteRef, RoomSize } from './types.ts';

const empty = (roomSize: RoomSize): InteriorLayout => ({
  floorFrame: 0,
  wallTriple: 0,
  roomSize,
  shelf: { gx: shelfGxFor(ROOM_SIZES[roomSize][0]), gy: SHELF_GY },
  placements: [],
});

const note = (id: string): NoteRef => ({ id, title: id, furniture: 'desk', gx: 0, gy: 0, preview: '' });

test('an empty room has 11, 14 and 22 door slots by size', () => {
  assert.equal(doorSlots(empty('small'), CATALOG_BY_ID, 99).length, 11);
  assert.equal(doorSlots(empty('medium'), CATALOG_BY_ID, 99).length, 14);
  assert.equal(doorSlots(empty('large'), CATALOG_BY_ID, 99).length, 22);
});

test('more rooms than slots just returns every slot there is', () => {
  assert.equal(doorSlots(empty('small'), CATALOG_BY_ID, 40).length, 11);
  assert.deepEqual(doorSlots(empty('small'), CATALOG_BY_ID, 0), []);
});

test('slots fill the top wall, then left, right and bottom', () => {
  const slots = doorSlots(empty('large'), CATALOG_BY_ID, 99);
  assert.deepEqual(slots.slice(0, 5).map((s) => [s.side, s.gx, s.gy]), [
    ['top', 4, 0], ['top', 14, 0], ['top', 16, 0], ['left', 0, 2], ['left', 0, 4],
  ]);
  assert.deepEqual(slots[0].inside, [[4, 1], [4, 2]]);
  assert.deepEqual(slots.at(-1), { gx: 16, gy: 14, side: 'bottom', inside: [[16, 13]] });
  assert.equal(doorSlots(empty('large'), CATALOG_BY_ID, 3).length, 3);
});

test('no slot sits under the coin purse, the header labels, on EXIT or beside it', () => {
  const slots = doorSlots(empty('large'), CATALOG_BY_ID, 99);
  const top = slots.filter((s) => s.side === 'top').map((s) => s.gx);
  const bottom = slots.filter((s) => s.side === 'bottom').map((s) => s.gx);
  assert.ok(top.every((gx) => gx >= 4 && (gx < 6 || gx > 13)));
  assert.ok(bottom.every((gx) => Math.abs(gx - 10) > 1));
});

test('furniture on every top slot pushes doors onto free wall, never under a piece', () => {
  const layout: InteriorLayout = {
    ...empty('large'),
    placements: [1, 3, 13, 15].map((gx) => ({ item: 'desk', gx, gy: 1, rotation: 0 as const })),
  };
  assert.deepEqual(doorSlots(layout, CATALOG_BY_ID, 1)[0], { gx: 0, gy: 4, side: 'left', inside: [[1, 4]] });
});

test('a shelf moved against a side wall skips the doors behind it', () => {
  const layout: InteriorLayout = { ...empty('large'), shelf: { gx: 1, gy: 5 } };
  const left = doorSlots(layout, CATALOG_BY_ID, 99).filter((s) => s.side === 'left').map((s) => s.gy);
  assert.deepEqual(left, [2, 4, 8, 10, 12]);
});

test('doorCells covers each doorway and the tiles in front of it', () => {
  assert.deepEqual(
    [...doorCells([{ gx: 2, gy: 0, side: 'top', inside: [[2, 1], [2, 2]] }])].sort(),
    ['2,0', '2,1', '2,2'],
  );
});

test('canResize refuses a shrink that leaves too few doors', () => {
  const layout: InteriorLayout = { ...empty('large'), shelf: { gx: 3, gy: SHELF_GY } };
  assert.equal(canResize(layout, CATALOG_BY_ID, 'small'), true);
  assert.equal(canResize(layout, CATALOG_BY_ID, 'small', 11), true);
  assert.equal(canResize(layout, CATALOG_BY_ID, 'small', 12), false);
  assert.equal(canResize(layout, CATALOG_BY_ID, 'medium', 12), true);
});

test('the entrance keeps the house look and starts large; other rooms start medium with only their notes', () => {
  const house: House = {
    id: 'R/H', name: 'H', gx: 0, gy: 0, variant: 0, material: 'wood', wallColor: 'base', roofColor: 'black',
    rooms: [
      { id: 'R/H', name: 'Main', notes: [note('R/H/a.md')] },
      { id: 'R/H/K', name: 'K', notes: [note('R/H/K/b.md'), note('R/H/K/c.md')] },
    ],
  };
  const noteIds = (l: InteriorLayout) => l.placements.flatMap((p) => (p.noteId ? [p.noteId] : [])).sort();

  const entrance = computeDefaultLayout(house, house.rooms[0]);
  assert.equal(entrance.roomSize, 'large');
  assert.equal(entrance.floorFrame, hash('R/H') % FLOOR_FRAMES.length);
  assert.deepEqual(noteIds(entrance), ['R/H/a.md']);

  const kitchen = computeDefaultLayout(house, house.rooms[1]);
  assert.equal(kitchen.roomSize, 'medium');
  assert.equal(kitchen.floorFrame, hash('R/H/K') % FLOOR_FRAMES.length);
  assert.deepEqual(noteIds(kitchen), ['R/H/K/b.md', 'R/H/K/c.md']);
});
