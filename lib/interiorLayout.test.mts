import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FLOOR_FRAMES, ROOM_SIZES, SHELF_GY, SHELF_W, canResize, computeDefaultLayout, doorCells, doorPositionFor, doorSlots,
  shelfGxFor,
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

test('an empty room has 10, 13 and 21 door slots by size', () => {
  assert.equal(doorSlots(empty('small'), CATALOG_BY_ID, 99).length, 10);
  assert.equal(doorSlots(empty('medium'), CATALOG_BY_ID, 99).length, 13);
  assert.equal(doorSlots(empty('large'), CATALOG_BY_ID, 99).length, 21);
});

test('more rooms than slots just returns every slot there is', () => {
  assert.equal(doorSlots(empty('small'), CATALOG_BY_ID, 40).length, 10);
  assert.deepEqual(doorSlots(empty('small'), CATALOG_BY_ID, 0), []);
});

test('slots fill the top wall, then left, right and bottom', () => {
  const slots = doorSlots(empty('large'), CATALOG_BY_ID, 99);
  assert.deepEqual(slots.slice(0, 5).map((s) => [s.side, s.gx, s.gy]), [
    ['top', 4, 0], ['top', 6, 0], ['left', 0, 2], ['left', 0, 4], ['left', 0, 6],
  ]);
  assert.deepEqual(slots[0].inside, [[4, 1], [4, 2]]);
  assert.deepEqual(slots.at(-1), { gx: 16, gy: 14, side: 'bottom', inside: [[16, 13]] });
  assert.equal(doorSlots(empty('large'), CATALOG_BY_ID, 3).length, 3);
});

test('no slot sits under the coin purse, the top-right header, on EXIT or beside it', () => {
  const slots = doorSlots(empty('large'), CATALOG_BY_ID, 99);
  const top = slots.filter((s) => s.side === 'top').map((s) => s.gx);
  const bottom = slots.filter((s) => s.side === 'bottom').map((s) => s.gx);
  assert.ok(top.every((gx) => gx >= 4 && gx < 20 - 1 - 12));
  assert.ok(bottom.every((gx) => Math.abs(gx - 10) > 1));
});

test('furniture on every top slot pushes doors onto free wall, never under a piece', () => {
  const layout: InteriorLayout = {
    ...empty('large'),
    placements: [1, 3, 5].map((gx) => ({ item: 'desk', gx, gy: 1, rotation: 0 as const })),
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
  assert.equal(canResize(layout, CATALOG_BY_ID, 'small', 10), true);
  assert.equal(canResize(layout, CATALOG_BY_ID, 'small', 11), false);
  assert.equal(canResize(layout, CATALOG_BY_ID, 'medium', 12), true);
});

test('every room starts small; the entrance keeps the house look, other rooms hold only their notes', () => {
  const house: House = {
    id: 'R/H', name: 'H', gx: 0, gy: 0, variant: 0, material: 'wood', wallColor: 'base', roofColor: 'black',
    rooms: [
      { id: 'R/H', name: 'Main', notes: [note('R/H/a.md')] },
      { id: 'R/H/K', name: 'K', notes: [note('R/H/K/b.md'), note('R/H/K/c.md')] },
    ],
  };
  const noteIds = (l: InteriorLayout) => l.placements.flatMap((p) => (p.noteId ? [p.noteId] : [])).sort();

  const entrance = computeDefaultLayout(house, house.rooms[0]);
  assert.equal(entrance.roomSize, 'small');
  assert.equal(entrance.floorFrame, hash('R/H') % FLOOR_FRAMES.length);
  assert.deepEqual(noteIds(entrance), ['R/H/a.md']);

  const kitchen = computeDefaultLayout(house, house.rooms[1]);
  assert.equal(kitchen.roomSize, 'small');
  assert.equal(kitchen.floorFrame, hash('R/H/K') % FLOOR_FRAMES.length);
  assert.deepEqual(noteIds(kitchen), ['R/H/K/b.md', 'R/H/K/c.md']);
});

test('an untouched new room can be switched to any size', () => {
  for (let i = 0; i < 40; i++) {
    const room = { id: `R/H/Room ${i}`, name: `Room ${i}`, notes: i % 3 ? [note(`R/H/Room ${i}/n.md`)] : [] };
    const house: House = {
      id: 'R/H', name: 'H', gx: 0, gy: 0, variant: 0, material: 'wood', wallColor: 'base', roofColor: 'black',
      rooms: [{ id: 'R/H', name: 'Main', notes: [] }, room],
    };
    const layout = computeDefaultLayout(house, room);
    for (const size of ['small', 'medium', 'large'] as const) {
      assert.equal(canResize(layout, CATALOG_BY_ID, size), true, `${room.id} -> ${size}`);
    }
  }
});

test('default furniture never blocks a note, the shelf, a doorway or the way out', () => {
  for (let i = 0; i < 60; i++) {
    const house: House = {
      id: `R/House ${i}`, name: `House ${i}`, gx: 0, gy: 0, variant: 0, material: 'wood', wallColor: 'base', roofColor: 'black',
      rooms: [{ id: `R/House ${i}`, name: 'Main', notes: [] }],
    };
    for (let r = 0; r < 4; r++) house.rooms.push({ id: `R/House ${i}/Room ${r}`, name: `Room ${r}`, notes: [] });
    for (const room of house.rooms) room.notes = Array.from({ length: 6 }, (_, n) => note(`${room.id}/${n}.md`));

    for (const room of house.rooms) {
      const base = computeDefaultLayout(house, room);
      const entrance = room.id === house.id;
      for (const size of ['small', 'medium', 'large'] as const) {
        const layout = { ...base, roomSize: size };
        const [w, h] = ROOM_SIZES[size];
        const slots = doorSlots(layout, CATALOG_BY_ID, entrance ? house.rooms.length - 1 : 0);
        if (entrance) assert.equal(slots.length, 4, `${room.id} ${size}`);
        assert.ok(doorSlots(layout, CATALOG_BY_ID, 99).length >= 6, `${room.id} ${size}: too few doorways`);

        const blocked = new Set<string>();
        for (let x = 0; x < w; x++) blocked.add(`${x},0`).add(`${x},1`).add(`${x},${h - 1}`);
        for (let y = 0; y < h; y++) blocked.add(`0,${y}`).add(`${w - 1},${y}`);
        for (const [x, y] of slots.flatMap((s) => s.inside)) blocked.delete(`${x},${y}`);
        for (let x = 0; x < SHELF_W; x++) blocked.add(`${layout.shelf.gx + x},2`);
        for (const p of layout.placements) {
          const [fw, fh] = CATALOG_BY_ID[p.item].footprint;
          for (let x = p.gx; x < p.gx + fw; x++) {
            for (let y = p.gy; y < p.gy + fh; y++) {
              if (p.item !== 'rug') assert.ok(!blocked.has(`${x},${y}`) || y === 1, `${room.id} ${size}: ${p.item} overlaps`);
              if (p.item !== 'rug') blocked.add(`${x},${y}`);
            }
          }
        }

        const [exitX] = doorPositionFor(w, h);
        const reached = new Set([`${exitX},${h - 2}`]);
        const queue: [number, number][] = [[exitX, h - 2]];
        while (queue.length) {
          const [x, y] = queue.shift()!;
          for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
            const key = `${nx},${ny}`;
            if (reached.has(key) || blocked.has(key)) continue;
            reached.add(key);
            queue.push([nx, ny]);
          }
        }
        const mustReach = [
          `${layout.shelf.gx},3`,
          ...slots.map((s) => s.inside.at(-1)!.join(',')),
          ...layout.placements.filter((p) => p.noteId).map((p) => {
            const [fw, fh] = CATALOG_BY_ID[p.item].footprint;
            return `${p.gx + Math.floor(fw / 2)},${p.gy + fh}`;
          }),
        ];
        for (const key of mustReach) assert.ok(reached.has(key), `${room.id} ${size}: can't reach ${key}`);
      }
    }
  }
});
