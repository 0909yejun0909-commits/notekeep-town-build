import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex, searchIndex } from './noteSearch.ts';
import type { WorldModel } from './types.ts';

const note = (id: string, title: string, preview = '') => ({ id, title, furniture: 'desk' as const, gx: 0, gy: 0, preview });
const world = {
  regions: [{
    id: 'Bio', name: 'Bio',
    houses: [{ id: 'Bio/Cells', name: 'Cells', rooms: [{ id: 'Bio/Cells', name: 'Main', notes: [note('a.md', 'Mitosis', 'cells divide'), note('b.md', 'Meiosis', 'mitosis twice')] }] }],
  }],
} as unknown as WorldModel;

test('a title hit beats a preview hit', () => {
  const hits = searchIndex(buildIndex(world), 'mitosis', 8);
  assert.deepEqual(hits.map((d) => d.title), ['Mitosis', 'Meiosis']);
});

test('every word must match somewhere', () => {
  assert.deepEqual(searchIndex(buildIndex(world), 'mitosis banana', 8), []);
  assert.deepEqual(searchIndex(buildIndex(world), '   ', 8), []);
});
