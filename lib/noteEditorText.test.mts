import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editVisible, layoutOf, runsOf, toRaw, toVisible } from './noteEditorText.ts';
import { toggleBold } from './noteMarks.ts';

const BLUE = '<mark style="background: #bfdbfe">';

// Types `text` at shown offset `at` (deleting [at, end) first), like the textarea would.
function type(raw: string, at: number, text: string, end = at) {
  const shown = layoutOf(raw).visible;
  const next = shown.slice(0, at) + text + shown.slice(end);
  return editVisible(raw, next, at + text.length, at + text.length);
}

test('the editor shows a note without its mark tags, and nothing else goes', () => {
  const raw = `a ${BLUE}blue</mark> <u>under</u> ==yellow== **bold**`;
  assert.equal(layoutOf(raw).visible, 'a blue under ==yellow== **bold**');
});

test('tags in code, or on a line of their own, are shown as written', () => {
  assert.equal(layoutOf('`<u>x</u>`').visible, '`<u>x</u>`');
  assert.equal(layoutOf('```\n<u>x</u>\n```').visible, '```\n<u>x</u>\n```');
  assert.equal(layoutOf('<u>\n\ntext').visible, '<u>\n\ntext');
});

test('a tag without its partner is hidden, as the note never shows it either', () => {
  assert.equal(layoutOf('one <u>two').visible, 'one two');
});

test('typing inside a mark stays inside it, and the tags never move', () => {
  const raw = `x ${BLUE}word</mark> y`;
  assert.equal(type(raw, 4, 'Z').raw, `x ${BLUE}woZrd</mark> y`);
});

test('typed text takes the marks of the character before it', () => {
  const raw = `x ${BLUE}word</mark> y`;
  // At the end of the highlighted word: inside it.
  assert.equal(type(raw, 6, 's').raw, `x ${BLUE}words</mark> y`);
  // At its start: outside, with the plain text before it.
  assert.equal(type(raw, 2, 'a').raw, `x a${BLUE}word</mark> y`);
  // A repeated letter goes where the caret says, not where a diff would guess.
  const r = editVisible(`a${BLUE}b</mark>`, 'abb', 2, 2);
  assert.equal(r.raw, `ab${BLUE}b</mark>`);
  assert.deepEqual(r.sel, [2, 2]);
});

test('typing over a selection keeps the marks of its first character', () => {
  const raw = `x ${BLUE}word</mark> y`;
  assert.equal(type(raw, 2, 'new', 6).raw, `x ${BLUE}new</mark> y`);
});

test('deleting all of a mark\'s text deletes its tags too', () => {
  assert.equal(type(`a ${BLUE}word</mark> b`, 2, '', 6).raw, 'a  b');
  assert.equal(type(`a <u>${BLUE}w</mark></u> b`, 2, '', 3).raw, 'a  b');
  // Deleting across a mark's edge only takes the text; the mark keeps the rest.
  assert.equal(type(`ab ${BLUE}cd</mark>`, 1, '', 4).raw, `a${BLUE}d</mark>`);
});

test('backspace and forward delete next to a tag delete text, never the tag', () => {
  const raw = `ab${BLUE}cd</mark>ef`;
  const back = editVisible(raw, 'abcef', 3, 3); // backspace after "d"
  assert.equal(back.raw, `ab${BLUE}c</mark>ef`);
  assert.deepEqual(back.sel, [3, 3]);
  const first = editVisible(raw, 'abdef', 2, 2); // backspace after "c", the mark's first letter
  assert.equal(first.raw, `ab${BLUE}d</mark>ef`);
  const fwd = editVisible(raw, 'acdef', 1, 1); // delete "b"
  assert.equal(fwd.raw, `a${BLUE}cd</mark>ef`);
});

test('a tag typed by hand becomes a mark, and the caret stays after the text', () => {
  let raw = 'say hi';
  raw = type(raw, 4, '<u>').raw;
  const done = type(raw, 9, '</u>');
  assert.equal(done.raw, 'say <u>hi</u>');
  assert.equal(layoutOf(done.raw).visible, 'say hi');
  assert.deepEqual(done.sel, [6, 6]);
});

// Types `text` a key at a time at the end of the shown text, carrying the caret as the editor does.
function keys(raw: string, text: string) {
  let caret: number | null = null;
  for (const ch of text) {
    const shown = layoutOf(raw).visible;
    const at = caret === null ? shown.length : toVisible(layoutOf(raw), caret);
    const r = editVisible(raw, shown.slice(0, at) + ch + shown.slice(at), at + 1, at + 1, caret);
    raw = r.raw;
    caret = r.caret;
  }
  return raw;
}

test('typing a tag a key at a time goes where it was typed, even next to another tag', () => {
  assert.equal(keys('<u>delta</u>', ' <u>x</u>'), '<u>delta <u>x</u></u>');
  assert.equal(keys('plain', ' <u>x</u> y'), 'plain <u>x</u> y');
  assert.equal(keys(`${BLUE}hi</mark>`, ' there'), `${BLUE}hi there</mark>`);
});

test('newlines and pastes over marks keep every tag', () => {
  const raw = `${BLUE}one two</mark>`;
  const r = type(raw, 3, '\n');
  assert.equal(r.raw, `${BLUE}one\n two</mark>`);
  assert.equal(type(raw, 0, 'pasted ').raw, `pasted ${BLUE}one two</mark>`);
});

test('shown offsets and note offsets map both ways', () => {
  const raw = `x${BLUE}y</mark>z`;
  const l = layoutOf(raw);
  const y = raw.indexOf('</mark>') - 1;
  assert.deepEqual(toRaw(l, 1, 2), { start: y, end: y + 1 });
  assert.equal(toVisible(l, raw.length - 1), 2);
  assert.equal(toVisible(l, raw.length), 3);
});

test('the colour behind the editor follows the marks, innermost highlight first', () => {
  const runs = runsOf(layoutOf(`a ${BLUE}b <u>c</u></mark> ==d==`));
  assert.deepEqual(runs, [
    { text: 'a ', hl: undefined, hex: undefined, u: false },
    { text: 'b ', hl: 'blue', hex: undefined, u: false },
    { text: 'c', hl: 'blue', hex: undefined, u: true },
    { text: ' ==', hl: undefined, hex: undefined, u: false },
    { text: 'd', hl: 'yellow', hex: undefined, u: false },
    { text: '==', hl: undefined, hex: undefined, u: false },
  ]);
});

test('bold wraps a selection, and unwraps or splits a bold one', () => {
  assert.equal(toggleBold('a word b', [{ start: 2, end: 6 }], []).text, 'a **word** b');
  assert.equal(toggleBold('a **word** b', [{ start: 4, end: 8 }], [{ start: 2, end: 10 }]).text, 'a word b');
  assert.equal(toggleBold('**bold text**', [{ start: 7, end: 11 }], [{ start: 0, end: 13 }]).text, '**bold** text');
  assert.equal(toggleBold('**one two three**', [{ start: 6, end: 9 }], [{ start: 0, end: 17 }]).text, '**one** two **three**');
  // Partly bold: only what isn't bold yet is wrapped.
  assert.equal(toggleBold('a **b** c', [{ start: 0, end: 1 }, { start: 4, end: 5 }], [{ start: 2, end: 7 }]).text, '**a** **b** c');
});
