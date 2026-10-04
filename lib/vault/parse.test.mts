import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVault } from './parse.ts';

const blank = async () => '';

async function roomsOf(houseId: string, paths: string[], folders: string[] = []) {
  const world = await parseVault('V', paths, blank, folders);
  const house = world.regions.flatMap((r) => r.houses).find((h) => h.id === houseId);
  return house?.rooms.map((r) => [r.id, r.name, r.notes.map((n) => n.id)]);
}

test('each folder inside a house is its own room, entrance first', async () => {
  assert.deepEqual(await roomsOf('R/H', ['R/H/Kitchen/soup.md', 'R/H/zeta.md', 'R/H/Attic/Old/box.md']), [
    ['R/H', 'Main', ['R/H/zeta.md']],
    ['R/H/Attic', 'Attic', ['R/H/Attic/Old/box.md']],
    ['R/H/Kitchen', 'Kitchen', ['R/H/Kitchen/soup.md']],
  ]);
});

test('a house with no loose notes still starts with an empty entrance', async () => {
  assert.deepEqual(await roomsOf('R/H', ['R/H/Kitchen/soup.md']), [
    ['R/H', 'Main', []],
    ['R/H/Kitchen', 'Kitchen', ['R/H/Kitchen/soup.md']],
  ]);
});

test('an empty folder is a room; a folder of only attachments is not', async () => {
  const paths = ['R/H/a.md', 'R/H/attachments/pic.png'];
  const folders = ['R', 'R/H', 'R/H/Study', 'R/H/attachments'];
  assert.deepEqual(await roomsOf('R/H', paths, folders), [
    ['R/H', 'Main', ['R/H/a.md']],
    ['R/H/Study', 'Study', []],
  ]);
});

test('a room whose only content is an empty subfolder is still a room', async () => {
  const folders = ['R', 'R/H', 'R/H/Study', 'R/H/Study/Drafts'];
  assert.deepEqual(await roomsOf('R/H', ['R/H/a.md'], folders), [
    ['R/H', 'Main', ['R/H/a.md']],
    ['R/H/Study', 'Study', []],
  ]);
});

test('empty folders never create a region or a house', async () => {
  const world = await parseVault('V', ['R/H/a.md'], blank, ['R/Empty', 'R/Empty/Room', 'Other/X/Y']);
  assert.deepEqual(world.regions.map((r) => r.id), ['R']);
  assert.deepEqual(world.regions[0].houses.map((h) => h.id), ['R/H']);
});

test('a big folder stays one room instead of splitting', async () => {
  const paths = Array.from({ length: 35 }, (_, i) => `R/H/Big/n${String(i).padStart(2, '0')}.md`);
  const rooms = await roomsOf('R/H', paths);
  assert.equal(rooms?.length, 2);
  assert.equal(rooms?.[1][2].length, 35);
});

test('the vault root and loose region notes get an entrance too', async () => {
  const world = await parseVault('V', ['Welcome.md', 'R/loose.md'], blank);
  const rooms = world.regions.flatMap((r) => r.houses).map((h) => h.rooms.map((r) => [r.id, r.name]));
  // Regions follow sorted note paths: "r/loose.md" sorts before "welcome.md".
  assert.deepEqual(rooms, [[['R', 'Main']], [['.', 'Main']]]);
});
