import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AMBIENCES, BREATHS, DAILY_CALM_CAP, PLAYLIST, breathAt, calmPayout, clock, dayKey, meditationCoins, nextTrack, restCoins, tabFor,
} from './chill.ts';
import { TRACKS } from './tracks.ts';
import { CATALOG, FURNITURE_ACTIONS } from './catalog.ts';

test('every playlist entry is one of the town tracks, once', () => {
  const places = PLAYLIST.map((t) => t.place);
  assert.equal(new Set(places).size, places.length);
  for (const p of places) assert.ok(TRACKS[p], p);
});

test('next and previous wrap around the playlist', () => {
  const first = PLAYLIST[0].place;
  const last = PLAYLIST[PLAYLIST.length - 1].place;
  assert.equal(nextTrack(last, 1), first);
  assert.equal(nextTrack(first, -1), last);
  assert.equal(nextTrack(null, 1), PLAYLIST[0].place);
});

test('ambience ids are unique', () => {
  const ids = AMBIENCES.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('breathing grows on the in-breath, holds full, shrinks on the out-breath', () => {
  const calm = BREATHS[0];
  assert.deepEqual(breathAt(calm, 0), { phase: 'in', size: 0, left: 4 });
  assert.equal(breathAt(calm, 2).size, 0.5);
  assert.equal(breathAt(calm, 4).phase, 'hold');
  assert.equal(breathAt(calm, 4).size, 1);
  assert.equal(breathAt(calm, 6).phase, 'out');
  assert.equal(breathAt(calm, 9).size, 0.5);
  assert.equal(breathAt(calm, 12).phase, 'in');
});

test('the box breath rests empty before the next one', () => {
  const box = BREATHS[1];
  assert.equal(breathAt(box, 13).phase, 'rest');
  assert.equal(breathAt(box, 13).size, 0);
});

test('clock formats minutes and seconds', () => {
  assert.equal(clock(0), '0:00');
  assert.equal(clock(65), '1:05');
  assert.equal(clock(-3), '0:00');
});

test('a minute of meditating or two of resting earns a coin', () => {
  assert.equal(meditationCoins(59), 0);
  assert.equal(meditationCoins(180), 3);
  assert.equal(restCoins(119), 0);
  assert.equal(restCoins(240), 2);
});

test('calm coins stop at the daily cap and start over tomorrow', () => {
  const today = '2026-10-10';
  assert.deepEqual(calmPayout(null, 5, today), { grant: 5, next: { day: today, coins: 5 } });
  assert.equal(calmPayout({ day: today, coins: DAILY_CALM_CAP - 2 }, 5, today).grant, 2);
  assert.equal(calmPayout({ day: today, coins: DAILY_CALM_CAP }, 5, today).grant, 0);
  assert.equal(calmPayout({ day: '2026-10-09', coins: DAILY_CALM_CAP }, 5, today).grant, 5);
});

test('dayKey is the local calendar date', () => {
  assert.equal(dayKey(new Date(2026, 9, 3)), '2026-10-03');
});

test('sound devices open the player, noise machines on the ambience tab', () => {
  for (const c of ['speaker', 'headphones', 'earphones', 'radio', 'record_player', 'noise_machine']) {
    assert.equal(FURNITURE_ACTIONS[c as keyof typeof FURNITURE_ACTIONS], 'listen', c);
  }
  assert.equal(tabFor('noise_machine'), 'ambience');
  assert.equal(tabFor('speaker'), 'music');
  assert.equal(FURNITURE_ACTIONS.cushion, 'meditate');
  assert.equal(FURNITURE_ACTIONS.beanbag, 'sit');
});

test('the chill pieces are all in the catalogue, sold in the Chill tab', () => {
  const chill = CATALOG.filter((e) => e.textureKey === 'furn_chill');
  assert.ok(chill.length >= 15);
  for (const e of chill) assert.ok(FURNITURE_ACTIONS[e.category], e.id);
});
