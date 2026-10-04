import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foldersOf } from './paths.ts';

test('foldersOf lists every folder above the files, once each', () => {
  assert.deepEqual(foldersOf(['a/b/c.md', 'a/b/d.png', 'a/e.md', 'root.md']), ['a', 'a/b']);
});
