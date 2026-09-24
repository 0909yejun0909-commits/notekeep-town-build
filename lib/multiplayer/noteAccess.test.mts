import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_SHARED_BYTES, NOT_SHARED, noteIdsOf, resolveNoteRequest } from './noteAccess.ts';

const CELLS = '# Cells\n![[cell.png]] ![[big.png|200]] ![[tax.pdf]] ![[nope.png]]\n![diagram](img/d.png "Diagram") ![web](https://example.com/w.png)';

const files: Record<string, Blob> = {
  'Study/Bio/cells.md': new Blob([CELLS]),
  'Study/Bio/secret.md': new Blob(['not in the world']),
  'Study/Bio/cell.png': new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
  'Study/Bio/img/d.png': new Blob([new Uint8Array([4])], { type: 'image/png' }),
  'Study/Bio/big.png': new Blob([new Uint8Array(MAX_SHARED_BYTES + 1)], { type: 'image/png' }),
  'Study/Bio/tax.pdf': new Blob(['%PDF']),
  'Private/passport.jpg': new Blob([new Uint8Array([9])], { type: 'image/jpeg' }),
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

// A fresh host session: nothing opened yet, so no media allowed yet.
function host() {
  const allowed = new Set<string>();
  return {
    ask: (path: string, kind: 'text' | 'binary', share: 'notes' | 'town' = 'notes') =>
      resolveNoteRequest(vault, share, ids, allowed, req(path, kind)),
  };
}

test('nothing is served while the host shares the town only', async () => {
  const h = host();
  assert.deepEqual(await h.ask('Study/Bio/cells.md', 'text', 'town'), { ok: false, error: NOT_SHARED });
  assert.deepEqual(await h.ask('Study/Bio/cell.png', 'binary', 'town'), { ok: false, error: NOT_SHARED });
});

test('notes in the town are served as text', async () => {
  assert.deepEqual(await host().ask('Study/Bio/cells.md', 'text'), { ok: true, text: CELLS });
});

test('files outside the town are refused even if they exist on disk', async () => {
  assert.equal((await host().ask('Study/Bio/secret.md', 'text')).ok, false);
});

test('an image is refused until a note that embeds it has been opened', async () => {
  const h = host();
  assert.equal((await h.ask('Study/Bio/cell.png', 'binary')).ok, false);
  await h.ask('Study/Bio/cells.md', 'text');
  const img = await h.ask('Study/Bio/cell.png', 'binary');
  assert.ok(img.ok && 'bytes' in img);
  assert.deepEqual([...img.bytes], [1, 2, 3]);
  assert.equal(img.mime, 'image/png');
  assert.equal((await h.ask('Study/Bio/img/d.png', 'binary')).ok, true, 'markdown image embeds count too');
});

test('media no opened note embeds stays private, even by exact name', async () => {
  const h = host();
  await h.ask('Study/Bio/cells.md', 'text');
  assert.equal((await h.ask('Private/passport.jpg', 'binary')).ok, false);
  assert.equal((await h.ask('passport.jpg', 'binary')).ok, false);
});

test('embedded attachments that are not images or videos are not served', async () => {
  const h = host();
  await h.ask('Study/Bio/cells.md', 'text');
  assert.equal((await h.ask('Study/Bio/tax.pdf', 'binary')).ok, false);
});

test('a missing embedded image returns an error reply instead of throwing', async () => {
  const h = host();
  await h.ask('Study/Bio/cells.md', 'text');
  assert.equal((await h.ask('Study/Bio/nope.png', 'binary')).ok, false);
});

test('embedded files over the size cap are refused', async () => {
  const h = host();
  await h.ask('Study/Bio/cells.md', 'text');
  assert.equal((await h.ask('Study/Bio/big.png', 'binary')).ok, false);
});
