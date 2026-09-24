import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_SHARED_BYTES, NOT_SHARED, noteIdsOf, resolveNoteRequest } from './noteAccess.ts';

const files: Record<string, Blob> = {
  'Study/Bio/cells.md': new Blob(['# Cells']),
  'Study/Bio/secret.md': new Blob(['not in the world']),
  'Study/Bio/cell.png': new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
  'Study/Bio/big.png': new Blob([new Uint8Array(MAX_SHARED_BYTES + 1)], { type: 'image/png' }),
  'Study/Bio/tax.pdf': new Blob(['%PDF']),
};
const vault = {
  readNote: async (id: string) => {
    if (!files[id]) throw new Error('missing');
    return files[id].text();
  },
  readBinary: async (path: string) => {
    if (!files[path]) throw new Error('missing');
    return files[path];
  },
};
const world = {
  name: 'V',
  regions: [{ id: 'Study', name: 'Study', biome: 'meadow' as const, houses: [{
    id: 'Study/Bio', name: 'Bio', gx: 0, gy: 0, variant: 0, material: 'wood' as const, wallColor: 'base' as const,
    roofColor: 'red' as const,
    rooms: [{ id: 'r', name: 'Main', notes: [{ id: 'Study/Bio/cells.md', title: 'cells', furniture: 'desk' as const, gx: 0, gy: 0, preview: '' }] }],
  }] }],
};
const ids = noteIdsOf(world);
const req = (path: string, kind: 'text' | 'binary') => ({ reqId: '1', path, kind });

test('nothing is served while the host shares the town only', async () => {
  assert.deepEqual(await resolveNoteRequest(vault, 'town', ids, req('Study/Bio/cells.md', 'text')), { ok: false, error: NOT_SHARED });
  assert.deepEqual(await resolveNoteRequest(vault, 'town', ids, req('Study/Bio/cell.png', 'binary')), { ok: false, error: NOT_SHARED });
});

test('notes in the town are served as text', async () => {
  assert.deepEqual(await resolveNoteRequest(vault, 'notes', ids, req('Study/Bio/cells.md', 'text')), { ok: true, text: '# Cells' });
});

test('files outside the town are refused even if they exist on disk', async () => {
  const reply = await resolveNoteRequest(vault, 'notes', ids, req('Study/Bio/secret.md', 'text'));
  assert.equal(reply.ok, false);
});

test('images are served as bytes with their type; other attachments are not', async () => {
  const img = await resolveNoteRequest(vault, 'notes', ids, req('Study/Bio/cell.png', 'binary'));
  assert.ok(img.ok && 'bytes' in img);
  assert.deepEqual([...img.bytes], [1, 2, 3]);
  assert.equal(img.mime, 'image/png');
  assert.equal((await resolveNoteRequest(vault, 'notes', ids, req('Study/Bio/tax.pdf', 'binary'))).ok, false);
});

test('missing binary returns an error reply instead of throwing', async () => {
  assert.equal((await resolveNoteRequest(vault, 'notes', ids, req('Study/Bio/nope.png', 'binary'))).ok, false);
});

test('files over the size cap are refused', async () => {
  assert.equal((await resolveNoteRequest(vault, 'notes', ids, req('Study/Bio/big.png', 'binary'))).ok, false);
});
