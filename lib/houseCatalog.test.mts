import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exteriorChanged } from './houseCatalog.ts';

const before = { variant: 2, material: 'wood', wallColor: 'green', roofColor: 'red' } as const;

test('saving an exterior without changing anything is not a change', () => {
  assert.equal(exteriorChanged(before, { ...before }), false);
});

test('changing any one of shape, material, wall or roof colour is a change', () => {
  assert.equal(exteriorChanged(before, { ...before, variant: 3 }), true);
  assert.equal(exteriorChanged(before, { ...before, material: 'stone' }), true);
  assert.equal(exteriorChanged(before, { ...before, wallColor: 'base' }), true);
  assert.equal(exteriorChanged(before, { ...before, roofColor: 'blue' }), true);
});
