import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_WORDS, NOTE_REWARD, STARTER_GRANT, STREAK_BONUS_CAP, STUDY_REWARD, TIER_PRICE, applyLayoutChange, available,
  currentStreak, dayBefore, localDay, priceOf, qualifies, settle, settleStudy, unlockId, unlockPrice, withStreak, wordCount,
} from './wallet.ts';
import { CATALOG } from './catalog.ts';

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
  assert.deepEqual(data, { balance: STARTER_GRANT, record: 12, inventory: {}, streak: { days: 0, lastDay: null } });
});

test('new qualifying notes pay once, and only above the record', () => {
  const start = withStreak({ balance: 5, record: 12, inventory: {} });
  const up = settle(start, 15);
  assert.equal(up.earned, 3 * NOTE_REWARD);
  assert.deepEqual(up.data, withStreak({ balance: 5 + 3 * NOTE_REWARD, record: 15, inventory: {} }));

  const again = settle(up.data, 15);
  assert.equal(again.earned, 0);

  // Deleting notes lowers the count; refilling up to the old record pays nothing.
  const dipped = settle(again.data, 13);
  assert.equal(dipped.earned, 0);
  assert.equal(dipped.data.record, 15);
  assert.equal(settle(dipped.data, 16).earned, NOTE_REWARD);
});

test('priceOf prices by tier and is unknown for items not in the catalog', () => {
  assert.equal(priceOf('bed'), TIER_PRICE.common);
  assert.equal(priceOf('chest_ruby'), TIER_PRICE.treasure);
  assert.equal(priceOf('no_such_item'), null);
});

test('every catalog piece has a price, and rarer tiers cost more', () => {
  for (const e of CATALOG) assert.ok((priceOf(e.id) ?? 0) > 0, e.id);
  assert.ok(TIER_PRICE.common < TIER_PRICE.uncommon);
  assert.ok(TIER_PRICE.uncommon < TIER_PRICE.rare);
  assert.ok(TIER_PRICE.rare < TIER_PRICE.treasure);
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

test('unlock prices: biomes, house upgrades and outfit pieces cost coins; starters are free', () => {
  assert.equal(unlockPrice(unlockId('biome', 'forest')), 0);
  assert.ok(unlockPrice(unlockId('biome', 'snow')) > 0);
  assert.ok(unlockPrice(unlockId('biome', 'desert')) > 0);
  assert.equal(unlockPrice(unlockId('material', 'wood')), 0);
  assert.equal(unlockPrice(unlockId('wall', 'base')), 0);
  assert.ok(unlockPrice(unlockId('material', 'limestone')) > unlockPrice(unlockId('material', 'stone')));
  assert.ok(unlockPrice(unlockId('shape', 4)) > unlockPrice(unlockId('shape', 0)));
  assert.equal(unlockPrice(unlockId('roomSize', 'small')), 0);
  assert.ok(unlockPrice(unlockId('roomSize', 'large')) > unlockPrice(unlockId('roomSize', 'medium')));
  assert.ok(unlockPrice(unlockId('roomSize', 'medium')) > 0);
  const start = { hairStyle: 1, shirtColor: 'red' };
  assert.equal(unlockPrice(unlockId('hairStyle', 1), start), 0);
  assert.ok(unlockPrice(unlockId('hairStyle', 2), start) > 0);
  assert.equal(unlockPrice(unlockId('shirtColor', 'red'), start), 0);
  assert.ok(unlockPrice(unlockId('shirtColor', 'blue'), start) > 0);
});

test('first passed quiz starts a one-day streak and pays the base reward', () => {
  const start = settle(null, 0).data;
  const { data, earned } = settleStudy(start, '2026-10-08');
  assert.equal(earned, STUDY_REWARD);
  assert.deepEqual(data.streak, { days: 1, lastDay: '2026-10-08' });
  assert.equal(data.balance, start.balance + STUDY_REWARD);
});

test('a second quiz the same day pays nothing', () => {
  const once = settleStudy(settle(null, 0).data, '2026-10-08').data;
  const twice = settleStudy(once, '2026-10-08');
  assert.equal(twice.earned, 0);
  assert.equal(twice.data, once);
});

test('the next day grows the streak and pays one more', () => {
  const d1 = settleStudy(settle(null, 0).data, '2026-10-31').data;
  const d2 = settleStudy(d1, '2026-11-01');
  assert.equal(d2.earned, STUDY_REWARD + 1);
  assert.equal(d2.data.streak.days, 2);
});

test('missing a day starts over', () => {
  const d1 = settleStudy(settle(null, 0).data, '2026-10-08').data;
  const d3 = settleStudy(d1, '2026-10-10');
  assert.equal(d3.earned, STUDY_REWARD);
  assert.equal(d3.data.streak.days, 1);
});

test('the streak bonus is capped', () => {
  let data = { ...settle(null, 0).data, streak: { days: 30, lastDay: '2026-10-07' } };
  const r = settleStudy(data, '2026-10-08');
  assert.equal(r.earned, STUDY_REWARD + STREAK_BONUS_CAP);
  assert.equal(r.data.streak.days, 31);
});

test('currentStreak survives until the end of the next day', () => {
  const s = { days: 4, lastDay: '2026-10-08' };
  assert.equal(currentStreak(s, '2026-10-08'), 4);
  assert.equal(currentStreak(s, '2026-10-09'), 4);
  assert.equal(currentStreak(s, '2026-10-10'), 0);
  assert.equal(currentStreak({ days: 0, lastDay: null }, '2026-10-10'), 0);
});

test('day arithmetic crosses months and years', () => {
  assert.equal(dayBefore('2026-03-01'), '2026-02-28');
  assert.equal(dayBefore('2027-01-01'), '2026-12-31');
  assert.equal(localDay(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});

test('old saves without a streak load with none', () => {
  assert.deepEqual(withStreak({ balance: 80, record: 3, inventory: {} }), { balance: 80, record: 3, inventory: {}, streak: { days: 0, lastDay: null } });
});
