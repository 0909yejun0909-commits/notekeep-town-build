import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearMarks, deleteRange, highlight, inlineShortcut, insertRuns, marksAt, runsLength, splitRuns, toggleMark, visibleText } from './runs.ts';
import type { Marks, Run } from './inline.ts';

const t = (text: string, m: Marks = {}): Run => ({ text, m });
const link: Run = { atom: '[[Plan]]', text: 'Plan', kind: 'wikilink', m: {} };

test('positions count text and atoms', () => {
  const runs = [t('ab'), link, t('cd', { b: true })];
  assert.equal(runsLength(runs), 5);
  assert.equal(visibleText(runs), 'ab￼cd');
  assert.deepEqual(splitRuns(runs, 3), [[t('ab'), link], [t('cd', { b: true })]]);
  assert.deepEqual(splitRuns(runs, 4), [[t('ab'), link, t('c', { b: true })], [t('d', { b: true })]]);
  assert.deepEqual(deleteRange(runs, 1, 4), [t('a'), t('d', { b: true })]);
  assert.deepEqual(insertRuns([t('ac')], 1, [t('b')]), [t('abc')]);
});

test('typing takes the formatting before it, never a link', () => {
  const runs = [t('a'), t('b', { b: true, link: 'x' })];
  assert.deepEqual(marksAt(runs, 2), { b: true });
  assert.deepEqual(marksAt(runs, 1), {});
  assert.deepEqual(marksAt([t('x', { i: true })], 0), { i: true });
});

test('formatting toggles on a range, and off when it\'s all there', () => {
  const runs = [t('hello world')];
  const bolded = toggleMark(runs, 0, 5, 'b');
  assert.deepEqual(bolded, [t('hello', { b: true }), t(' world')]);
  assert.deepEqual(toggleMark(bolded, 0, 5, 'b'), runs);
  assert.deepEqual(toggleMark(bolded, 0, 8, 'b'), [t('hello wo', { b: true }), t('rld')]);
  const hl = highlight(runs, 6, 11, 'blue');
  assert.deepEqual(hl, [t('hello '), t('world', { hl: 'blue' })]);
  assert.deepEqual(highlight(hl, 6, 11, 'pink'), [t('hello '), t('world', { hl: 'pink' })]);
  assert.deepEqual(highlight(hl, 6, 11, 'blue'), runs);
  assert.deepEqual(clearMarks([t('x', { b: true, hl: 'blue', code: true, link: 'l' })], 0, 1), [t('x', { code: true, link: 'l' })]);
});

test('closing a delimiter formats what it closes, Notion style', () => {
  assert.deepEqual(inlineShortcut([t('say **hi**')], 10), { runs: [t('say '), t('hi', { b: true })], caret: 6 });
  assert.deepEqual(inlineShortcut([t('an *idea*')], 9), { runs: [t('an '), t('idea', { i: true })], caret: 7 });
  assert.deepEqual(inlineShortcut([t('run `npm i`')], 11), { runs: [t('run '), t('npm i', { code: true })], caret: 9 });
  assert.deepEqual(inlineShortcut([t('==key==')], 7), { runs: [t('key', { hl: 'yellow' })], caret: 3 });
  assert.deepEqual(inlineShortcut([t('~~old~~ new')], 7), { runs: [t('old', { s: true }), t(' new')], caret: 3 });
  // Not a closing delimiter: a lone star, spaces inside, the middle of **, snake_case.
  assert.equal(inlineShortcut([t('2 * 3 *')], 7), null);
  assert.equal(inlineShortcut([t('a ** b **')], 9), null);
  assert.equal(inlineShortcut([t('snake_case_')], 11), null);
  assert.equal(inlineShortcut([t('**bold*')], 7), null);
});
