import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bump, bumpDistinct, bumpMax, current, emptyState, parseState, progress } from './achievementState.ts';

const ach = (over = {}) => ({
  id: 'a', name: 'A', description: 'd', secret: false, stat: 'notesRead', target: 3,
  reward: { kind: 'pet', id: 'cat' }, ...over,
}) as any;

test('bump below the target unlocks nothing', () => {
  const r = bump(emptyState(), 'notesRead', 2, 100, [ach()]);
  assert.equal(r.state.stats.notesRead, 2);
  assert.deepEqual(r.newly, []);
});

test('crossing the target unlocks once, stamped with the time, and never again', () => {
  const first = bump(emptyState(), 'notesRead', 3, 111, [ach()]);
  assert.deepEqual(first.newly.map((a) => a.id), ['a']);
  assert.equal(first.state.unlocked.a, 111);
  const again = bump(first.state, 'notesRead', 5, 222, [ach()]);
  assert.deepEqual(again.newly, []);
  assert.equal(again.state.unlocked.a, 111);
});

test('one big jump unlocks every crossed threshold at once', () => {
  const list = [ach({ id: 'a', target: 10 }), ach({ id: 'b', target: 50 }), ach({ id: 'c', target: 5000 })];
  const r = bump(emptyState(), 'notesRead', 60, 1, list);
  assert.deepEqual(r.newly.map((a) => a.id), ['a', 'b']);
});

test('non-positive, NaN and Infinity amounts are ignored', () => {
  const s = emptyState();
  for (const amount of [0, -4, NaN, Infinity]) {
    const r = bump(s, 'notesRead', amount, 1, [ach({ target: 1 })]);
    assert.equal(r.state, s);
    assert.deepEqual(r.newly, []);
  }
});

test('bumpDistinct counts unique values only', () => {
  let s = emptyState();
  s = bumpDistinct(s, 'housesVisited', 'h1', 1, []).state;
  const dup = bumpDistinct(s, 'housesVisited', 'h1', 2, []);
  assert.equal(dup.state, s);
  s = bumpDistinct(s, 'housesVisited', 'h2', 3, []).state;
  assert.equal(s.stats.housesVisited, 2);
  assert.deepEqual(s.seen.housesVisited, ['h1', 'h2']);
});

test('bumpDistinct can unlock', () => {
  const list = [ach({ stat: 'housesVisited', target: 2 })];
  const s = bumpDistinct(emptyState(), 'housesVisited', 'h1', 1, list).state;
  const r = bumpDistinct(s, 'housesVisited', 'h2', 2, list);
  assert.deepEqual(r.newly.map((a) => a.id), ['a']);
});

test('bumpMax keeps the highest value and never lowers it', () => {
  let s = bumpMax(emptyState(), 'roomFurniture', 6, 1, []).state;
  const lower = bumpMax(s, 'roomFurniture', 3, 2, []);
  assert.equal(lower.state, s);
  s = bumpMax(s, 'roomFurniture', 9, 3, []).state;
  assert.equal(s.stats.roomFurniture, 9);
});

test('progress is clamped to 0..1 and current reads the stat', () => {
  const a = ach({ target: 4 });
  const s = bump(emptyState(), 'notesRead', 1, 1, [a]).state;
  assert.equal(progress(s, a), 0.25);
  assert.equal(current(s, a), 1);
  const done = bump(s, 'notesRead', 99, 1, [a]).state;
  assert.equal(progress(done, a), 1);
  assert.equal(progress(emptyState(), a), 0);
});

test('parseState survives garbage and keeps only valid parts', () => {
  for (const raw of [null, undefined, 5, 'x', [], { stats: 'nope' }]) {
    assert.deepEqual(parseState(raw), emptyState());
  }
  const s = parseState({
    stats: { notesRead: 4, bogusKey: 9, coinsEarned: -3, tilesWalked: NaN },
    seen: { housesVisited: ['a', 'b'], notesRead: [1, 2] },
    unlocked: { a: 100, b: 'later' },
  });
  assert.deepEqual(s.stats, { notesRead: 4 });
  assert.deepEqual(s.seen, { housesVisited: ['a', 'b'] });
  assert.deepEqual(s.unlocked, { a: 100 });
});
