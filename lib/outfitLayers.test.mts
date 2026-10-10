import { test } from 'node:test';
import assert from 'node:assert/strict';
import { outfitLayerKeys, outfitLayerUrls } from './outfitLayers.ts';
import { SKINS } from './rewards.ts';

const look = { hairStyle: 3, hairColor: 'grey', shirtColor: 'red', pantsColor: 'brown', shoesColor: 'black' } as const;

test('armour is a fixed stack of outfit layers, bottom to top', () => {
  assert.deepEqual(outfitLayerKeys('knight-iron', look), [
    'outfit-knight-iron-0', 'outfit-knight-iron-1', 'outfit-knight-iron-2', 'outfit-knight-iron-3',
  ]);
});

test("the player's own hair slots in where the outfit says, and a hat goes over it", () => {
  const keys = outfitLayerKeys('wizard-purple', look);
  assert.equal(keys[3], 'player-hair-3-grey');
  assert.equal(keys.at(-1), 'outfit-wizard-purple-4');
});

test('an unknown outfit has no layers', () => {
  assert.deepEqual(outfitLayerKeys('nope' as never, look), []);
});

test('urls mirror the keys for the React preview', () => {
  const urls = outfitLayerUrls('wizard-purple', look);
  assert.equal(urls[3], '/assets/character/hair/3_grey.png');
  assert.equal(urls[0], '/assets/outfits/wizard-purple/0.png');
});

test('every outfit yields one key per layer', () => {
  for (const s of SKINS) assert.equal(outfitLayerKeys(s.id, look).length, s.layers.length, s.id);
});
