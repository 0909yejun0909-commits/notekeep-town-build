import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQuiz, isRight, normalizeAnswer, passed, shuffle, QUIZ_LENGTH } from './quiz.ts';
import type { Card } from './flashcards.ts';

let n = 0;
const card = (front: string, back: string, kind: Card['kind'] = 'pair', roomId = 'r1'): Card =>
  ({ id: `c${n++}`, noteId: 'n', noteTitle: 'N', roomId, kind, front, back });
const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

test('shuffle keeps every item', () => {
  assert.deepEqual(shuffle([1, 2, 3, 4, 5], seeded()).sort(), [1, 2, 3, 4, 5]);
});

test('choice questions have four unique options, one of them right', () => {
  const cards = ['a', 'b', 'c', 'd', 'e', 'f'].map((x) => card(x.toUpperCase(), `def ${x}`));
  for (const q of buildQuiz(cards, seeded(7))) {
    assert.equal(q.kind, 'choice');
    if (q.kind !== 'choice') continue;
    assert.equal(q.options.length, 4);
    assert.equal(new Set(q.options.map((o) => o.toLowerCase())).size, 4);
    assert.equal(q.options[q.answer], q.card.back);
    assert.equal(q.prompt, q.card.front);
  }
});

test('distractors never equal the answer, even with different case', () => {
  const cards = [card('A', 'Same'), card('B', 'same'), card('C', 'x'), card('D', 'y'), card('E', 'z')];
  const q = buildQuiz(cards, seeded(3)).find((x) => x.card.front === 'A')!;
  assert.equal(q.kind, 'choice');
  if (q.kind === 'choice') assert.equal(q.options.filter((o) => o.toLowerCase() === 'same').length, 1);
});

test('too few distractors: show the definition, type the term', () => {
  const cards = [card('Alpha', 'first'), card('Beta', 'second')];
  const q = buildQuiz(cards, seeded())[0];
  assert.equal(q.kind, 'type');
  if (q.kind === 'type') {
    assert.equal(q.prompt, q.card.back);
    assert.equal(q.answer, q.card.front);
  }
});

test('cloze cards are typed', () => {
  const q = buildQuiz([card('The ____ makes ATP.', 'mitochondria', 'cloze')], seeded())[0];
  assert.deepEqual([q.kind, q.prompt], ['type', 'The ____ makes ATP.']);
  assert.ok(isRight(q, '  Mitochondria! '));
  assert.ok(!isRight(q, 'ribosome'));
});

test('quiz length is capped and has no repeats', () => {
  const cards = Array.from({ length: 30 }, (_, i) => card(`T${i}`, `D${i}`));
  const quiz = buildQuiz(cards, seeded());
  assert.equal(quiz.length, QUIZ_LENGTH);
  assert.equal(new Set(quiz.map((q) => q.card.id)).size, QUIZ_LENGTH);
});

test('normalizeAnswer ignores case, punctuation and spacing', () => {
  assert.equal(normalizeAnswer(' DNA,  RNA. '), 'dna rna');
});

test('choice answers are checked by index', () => {
  const cards = ['a', 'b', 'c', 'd'].map((x) => card(x, `def ${x}`));
  const q = buildQuiz(cards, seeded())[0];
  if (q.kind !== 'choice') throw new Error('expected choice');
  assert.ok(isRight(q, q.answer));
  assert.ok(!isRight(q, (q.answer + 1) % 4));
});

test('passing needs at least 70%', () => {
  assert.equal(passed(7, 10), true);
  assert.equal(passed(6, 10), false);
  assert.equal(passed(3, 4), true);
  assert.equal(passed(0, 0), false);
});
