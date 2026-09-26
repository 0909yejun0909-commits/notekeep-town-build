import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_WORDS, NOTE_REWARD, STARTER_GRANT, applyLayoutChange, available, priceOf, qualifies, settle, wordCount,
} from './wallet.ts';

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');

test('wordCount ignores frontmatter and markdown syntax', () => {
  assert.equal(wordCount('---\ntags: [a, b, c]\ncreated: 2026-09-26\n---\n# Hello there\n- one *two*'), 4);
  assert.equal(wordCount(''), 0);
  assert.equal(wordCount("don't stop"), 2);
});

test('wordCount counts each CJK character and Hangul words', () => {
  assert.equal(wordCount('日本語'), 3);
  assert.equal(wordCount('안녕하세요 세계'), 2);
});

test('qualifies at exactly MIN_WORDS', () => {
  assert.equal(qualifies(words(MIN_WORDS - 1)), false);
  assert.equal(qualifies(words(MIN_WORDS)), true);
});

test('first open grants the starter coins and counts every existing note as seen', () => {
  const { data, earned, fresh } = settle(null, 12);
  assert.equal(fresh, true);
  assert.equal(earned, 0);
  assert.deepEqual(data, { balance: STARTER_GRANT, record: 12, inventory: {} });
});

test('new qualifying notes pay once, and only above the record', () => {
  const start = { balance: 5, record: 12, inventory: {} };
  const up = settle(start, 15);
  assert.equal(up.earned, 3 * NOTE_REWARD);
  assert.deepEqual(up.data, { balance: 5 + 3 * NOTE_REWARD, record: 15, inventory: {} });

  const again = settle(up.data, 15);
  assert.equal(again.earned, 0);

  // Deleting notes lowers the count; refilling up to the old record pays nothing.
  const dipped = settle(again.data, 13);
  assert.equal(dipped.earned, 0);
  assert.equal(dipped.data.record, 15);
  assert.equal(settle(dipped.data, 16).earned, NOTE_REWARD);
});

test('priceOf prices by category and is unknown for items not in the catalog', () => {
  assert.equal(priceOf('bed_blue'), priceOf('bed'));
  assert.ok((priceOf('painting') ?? 0) > 0);
  assert.equal(priceOf('no_such_item'), null);
});

test('available counts inventory plus pieces freed from the saved layout', () => {
  const inv = { lamp: 1 };
  const saved = [{ item: 'lamp' }, { item: 'bed' }];
  assert.equal(available(inv, saved, saved, 'lamp'), 1);
  assert.equal(available(inv, saved, [{ item: 'bed' }], 'lamp'), 2);
  assert.equal(available(inv, saved, [...saved, { item: 'lamp' }], 'lamp'), 0);
  assert.equal(available(inv, saved, saved, 'plant'), 0);
});

test('applyLayoutChange returns removed pieces and takes placed ones', () => {
  const inv = { lamp: 1, plant: 2 };
  const saved = [{ item: 'lamp' }, { item: 'bed' }];
  const draft = [{ item: 'bed_blue' }, { item: 'lamp' }, { item: 'lamp' }, { item: 'plant' }];
  assert.deepEqual(applyLayoutChange(inv, saved, draft), { plant: 1, bed: 1 });
});
