import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GROUND_PRICE, TOWN_PROPS, TREE_CUT_PRICE, emptyTownEdits, parseTownEdits } from './townEdits.ts';

test('saved village edits survive a round trip', () => {
  const edits = {
    cut: ['3,4', '10,2'],
    ground: { '5,5': 'path', '6,5': 'tall', '7,5': 'grass' },
    props: [{ item: 'bench', gx: 8, gy: 9 }, { item: 'lamp', gx: 1, gy: 1 }],
    bag: { fountain: 1 },
  };
  assert.deepEqual(parseTownEdits(JSON.parse(JSON.stringify(edits))), edits);
});

test('bad entries are dropped one by one, never the whole save', () => {
  const parsed = parseTownEdits({
    cut: ['3,4', 'x', 7],
    ground: { '5,5': 'lava', '6,5': 'path', nope: 'path' },
    props: [{ item: 'castle', gx: 1, gy: 1 }, { item: 'rock', gx: 1.5, gy: 1 }, { item: 'rock', gx: 2, gy: 3 }],
    bag: { bench: -1, well: 2, castle: 4 },
  });
  assert.deepEqual(parsed, { cut: ['3,4'], ground: { '6,5': 'path' }, props: [{ item: 'rock', gx: 2, gy: 3 }], bag: { well: 2 } });
  assert.deepEqual(parseTownEdits(null), emptyTownEdits());
  assert.deepEqual(parseTownEdits('junk'), emptyTownEdits());
});

test('everything costs coins except painting grass back', () => {
  for (const p of TOWN_PROPS) assert.ok(p.price > 0, p.id);
  assert.ok(GROUND_PRICE.path > 0 && GROUND_PRICE.tall > 0);
  assert.equal(GROUND_PRICE.grass, 0);
  assert.ok(TREE_CUT_PRICE > 0);
  const fountain = TOWN_PROPS.find((p) => p.id === 'fountain')!;
  assert.ok(TOWN_PROPS.every((p) => p.price <= fountain.price));
});
