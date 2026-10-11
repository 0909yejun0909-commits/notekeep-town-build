import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GROUND_PRICE, PLOT_MARGIN, PLOT_PRICE, TOWN_PROPS, emptyTownEdits, parseTownEdits } from './townEdits.ts';

test('saved village edits survive a round trip', () => {
  const edits = {
    cut: ['3,4', '10,2'],
    plots: ['-1,0', '4,-2'],
    ground: { '5,5': 'path', '6,5': 'tall', '7,5': 'grass' },
    props: [{ item: 'bench', gx: 8, gy: 9 }, { item: 'lamp', gx: 1, gy: 1 }],
    bag: { fountain: 1 },
    v: 2,
  };
  assert.deepEqual(parseTownEdits(JSON.parse(JSON.stringify(edits))), edits);
});

test('bad entries are dropped one by one, never the whole save', () => {
  const parsed = parseTownEdits({
    cut: ['3,4', 'x', 7],
    ground: { '5,5': 'lava', '6,5': 'path', nope: 'path' },
    props: [{ item: 'castle', gx: 1, gy: 1 }, { item: 'rock', gx: 1.5, gy: 1 }, { item: 'rock', gx: 2, gy: 3 }],
    bag: { bench: -1, well: 2, castle: 4 },
    v: 2,
  });
  assert.deepEqual(parsed, { cut: ['3,4'], plots: [], ground: { '6,5': 'path' }, props: [{ item: 'rock', gx: 2, gy: 3 }], bag: { well: 2 }, v: 2 });
  assert.deepEqual(parseTownEdits(null), emptyTownEdits());
  assert.deepEqual(parseTownEdits('junk'), emptyTownEdits());
});

test('a save from before the band of plots moves in by its width, once', () => {
  const old = { cut: ['3,4'], ground: { '5,5': 'path' }, props: [{ item: 'bench', gx: 8, gy: 9 }], bag: {} };
  const d = PLOT_MARGIN;
  const moved = parseTownEdits(old);
  assert.deepEqual(moved.cut, [`${3 + d},${4 + d}`]);
  assert.deepEqual(moved.ground, { [`${5 + d},${5 + d}`]: 'path' });
  assert.deepEqual(moved.props, [{ item: 'bench', gx: 8 + d, gy: 9 + d }]);
  assert.deepEqual(parseTownEdits(JSON.parse(JSON.stringify(moved))), moved);
});

test('everything costs coins except painting grass back', () => {
  for (const p of TOWN_PROPS) assert.ok(p.price > 0, p.id);
  assert.ok(GROUND_PRICE.path > 0 && GROUND_PRICE.tall > 0);
  assert.equal(GROUND_PRICE.grass, 0);
  assert.equal(PLOT_PRICE, 15);
  const fountain = TOWN_PROPS.find((p) => p.id === 'fountain')!;
  assert.ok(TOWN_PROPS.every((p) => p.price <= fountain.price));
});
