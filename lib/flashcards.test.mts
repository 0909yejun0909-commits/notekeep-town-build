import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractCards } from './flashcards.ts';

const src = { id: 'Bio/Cells/Mitosis.md', title: 'Mitosis', roomId: 'Bio/Cells' };
const pairs = (md: string) => extractCards(src, md).map((c) => [c.kind, c.front, c.back]);

test('double colon lines', () => {
  assert.deepEqual(pairs('Mitosis :: cell division\n- **ATP** :: energy [[Currency|currency]]'), [
    ['pair', 'Mitosis', 'cell division'],
    ['pair', 'ATP', 'energy currency'],
  ]);
});

test('Q/A pairs', () => {
  assert.deepEqual(pairs('Q: What splits cells?\nA: Mitosis'), [['pair', 'What splits cells?', 'Mitosis']]);
});

test('bullets with a colon or a spaced dash', () => {
  assert.deepEqual(pairs('- Prophase: chromosomes condense\n* Anaphase – chromatids separate\n1. Telophase - nuclei reform'), [
    ['pair', 'Prophase', 'chromosomes condense'],
    ['pair', 'Anaphase', 'chromatids separate'],
    ['pair', 'Telophase', 'nuclei reform'],
  ]);
});

test('task items, URLs and long fronts are not cards', () => {
  assert.deepEqual(pairs('- [ ] Fix: the bracket\n- see: https://example.com\n- docs at https://a.b/c: x\n- ' + 'x'.repeat(81) + ': y'), []);
});

test('highlights become cloze cards, one per sentence', () => {
  assert.deepEqual(pairs('The ==mitochondria== makes ATP. Plain sentence. ==DNA== and ==RNA== carry code.'), [
    ['cloze', 'The ____ makes ATP.', 'mitochondria'],
    ['cloze', '____ and ____ carry code.', 'DNA, RNA'],
  ]);
});

test('a heading with no cards under it pairs with its first sentence', () => {
  assert.deepEqual(pairs('## Spindle\nThe spindle pulls chromosomes apart. It is made of microtubules.\n\n## Phases\n- Prophase: condense'), [
    ['pair', 'Spindle', 'The spindle pulls chromosomes apart.'],
    ['pair', 'Prophase', 'condense'],
  ]);
});

test('plain prose with no headings yields nothing', () => {
  assert.deepEqual(pairs('Just a journal entry about my day. Nothing to learn.'), []);
});

test('frontmatter, code fences and comments are ignored', () => {
  const md = '---\ntags: a\nalias: b\n---\n```\nkey :: value\n```\n%% secret :: hidden %%\n<!-- c :: d -->\nReal :: card';
  assert.deepEqual(pairs(md), [['pair', 'Real', 'card']]);
});

test('duplicate fronts keep the first; ids are stable', () => {
  const cards = extractCards(src, 'ATP :: energy\natp :: other\nNADH :: carrier');
  assert.deepEqual(cards.map((c) => c.back), ['energy', 'carrier']);
  assert.deepEqual(cards.map((c) => c.id), ['Bio/Cells/Mitosis.md#0', 'Bio/Cells/Mitosis.md#1']);
  assert.equal(cards[0].noteTitle, 'Mitosis');
  assert.equal(cards[0].roomId, 'Bio/Cells');
});

test('long heading answers are trimmed', () => {
  const [card] = extractCards(src, '## Long\n' + 'word '.repeat(60) + 'end.');
  assert.ok(card.back.length <= 160);
  assert.ok(card.back.endsWith('…'));
});

test('a paragraph that only introduces a list is not an answer', () => {
  assert.deepEqual(pairs('# Series\nOrder of tests to try:\n\n1. Divergence test first.'), []);
});
