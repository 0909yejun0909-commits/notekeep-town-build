import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HAIR_LAYER, PETS, SKINS, SKIN_CLASSES, outfitAssetPath, outfitTextureKey, petAssetPath, rewardName,
} from './rewards.ts';

test('skin and pet ids are unique and kebab-case', () => {
  for (const list of [SKINS, PETS]) {
    const ids = list.map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) assert.match(id, /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
  }
});

test('every outfit belongs to a known class and has at least one drawn layer', () => {
  for (const s of SKINS) {
    assert.ok(SKIN_CLASSES.includes(s.cls), s.id);
    assert.ok(s.layers.some((l) => l !== HAIR_LAYER), s.id);
  }
});

test('every outfit layer is the player hair marker, a generated hat, or a Kenmi player-kit png', () => {
  for (const s of SKINS) {
    for (const l of s.layers) {
      assert.match(l, /^(@hair|@gen\/wizard-hat-[a-z]+|(Feet|Legs|Chest|Head|Accessories)(\/[A-Za-z0-9_]+)+\.png)$/, `${s.id}: ${l}`);
    }
  }
});

test('asset paths and keys are derived from the id and layer index', () => {
  assert.equal(outfitAssetPath('knight-iron', 2), 'assets/outfits/knight-iron/2.png');
  assert.equal(outfitTextureKey('knight-iron', 2), 'outfit-knight-iron-2');
  assert.equal(petAssetPath('cat'), 'assets/pets/cat.png');
});

test('rewardName looks up display names and tolerates unknown ids', () => {
  assert.equal(rewardName('skin', 'knight-iron'), 'Iron Knight');
  assert.equal(rewardName('pet', 'cat'), 'Tabby Cat');
  assert.equal(rewardName('pet', 'nope'), 'nope');
});
