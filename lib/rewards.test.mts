import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PETS, SKINS, SKIN_CLASSES, petAssetPath, rewardName, skinAssetPath, skinTextureKey } from './rewards.ts';

test('skin and pet ids are unique and kebab-case', () => {
  for (const list of [SKINS, PETS]) {
    const ids = list.map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) assert.match(id, /^[a-z]+(-[a-z0-9]+)*$/);
  }
});

test('every skin belongs to a known class', () => {
  for (const s of SKINS) assert.ok(SKIN_CLASSES.includes(s.cls), s.id);
});

test('asset paths and keys are derived from the id', () => {
  assert.equal(skinAssetPath('knight'), 'assets/skins/knight.png');
  assert.equal(petAssetPath('cat'), 'assets/pets/cat.png');
  assert.equal(skinTextureKey('knight'), 'skin-knight');
});

test('rewardName looks up display names and tolerates unknown ids', () => {
  assert.equal(rewardName('skin', 'knight'), 'Knight');
  assert.equal(rewardName('pet', 'cat'), 'Tabby Cat');
  assert.equal(rewardName('pet', 'nope'), 'nope');
});
