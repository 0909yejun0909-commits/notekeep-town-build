import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  addMark,
  clearMarks,
  piecesInRange,
  remarkMarks,
  selectSegments,
  toggleUnderline,
  trackedReplace,
  type ExistingMark,
  type Piece,
} from './noteMarks.ts';

const render = (md: string) =>
  renderToStaticMarkup(createElement(ReactMarkdown, { remarkPlugins: [remarkGfm, remarkMarks] }, md));

function marksIn(html: string): ExistingMark[] {
  return [...html.matchAll(/data-k="(hl|u)" data-os="(\d+)" data-oe="(\d+)" data-cs="(\d+)" data-ce="(\d+)"/g)].map((m) => ({
    kind: m[1] as 'hl' | 'u',
    open: { start: +m[2], end: +m[3] },
    close: { start: +m[4], end: +m[5] },
  }));
}

function piecesIn(html: string): Piece[] {
  return [...html.matchAll(/data-s="(\d+)" data-e="(\d+)" data-lin="([01])"/g)].map((m) => ({
    s: +m[1],
    e: +m[2],
    lin: m[3] === '1',
  }));
}

// Select raw[a, b) the way the reader does: through the rendered pieces.
function select(raw: string, a: number, b: number) {
  const html = render(raw);
  return { segs: selectSegments(raw, piecesInRange(piecesIn(html), a, b)), existing: marksIn(html) };
}

function selectText(raw: string, text: string) {
  const a = raw.indexOf(text);
  assert.ok(a >= 0, `"${text}" not in note`);
  return select(raw, a, a + text.length);
}

test('renders ==text== as a yellow highlight', () => {
  const html = render('a ==bright idea== b');
  assert.match(html, /<mark class="hl hl-yellow"[^>]*>.*bright idea.*<\/mark>/);
  assert.doesNotMatch(html, /==/);
});

test('renders <mark> highlights in palette and custom colours, and <u> underlines', () => {
  assert.match(render('<mark style="background: #BBF7D0">go</mark>'), /<mark class="hl hl-green"/);
  assert.match(render('<mark style="background: #FFB86CA6;">x</mark>'), /<mark class="hl" style="background-color:#FFB86CA6"/);
  assert.match(render('<mark>x</mark>'), /<mark class="hl hl-yellow"/);
  assert.match(render('<u>under</u>'), /<u data-k="u"[^>]*>.*under.*<\/u>/);
});

test('does not let a highlight colour inject other CSS', () => {
  const html = render('<mark style="background: red; position: fixed">x</mark>');
  assert.doesNotMatch(html, /position|red/);
  assert.match(html, /hl-yellow/);
});

test('leaves spaced or unpaired == alone', () => {
  assert.doesNotMatch(render('if a == b then'), /<mark/);
  assert.doesNotMatch(render('a ==b'), /<mark/);
  assert.equal(render('a ==b').replace(/<[^>]+>/g, ''), 'a ==b');
  assert.doesNotMatch(render('`==x==`'), /<mark/);
});

test('still drops other raw HTML', () => {
  const html = render('<script>alert(1)</script> and <b>bold</b>');
  assert.doesNotMatch(html, /<script|<b>/);
});

test('highlights span inline formatting', () => {
  const html = render('==a **b** c==');
  assert.match(html, /<mark[^>]*>.*<strong>.*b.*<\/strong>.*<\/mark>/);
});

test('marks record where their tokens sit in the source', () => {
  const raw = 'x ==hi== <u>there</u>';
  const [hl, u] = marksIn(render(raw));
  assert.equal(raw.slice(hl.open.start, hl.open.end), '==');
  assert.equal(raw.slice(hl.close.start, hl.close.end), '==');
  assert.equal(raw.slice(u.open.start, u.open.end), '<u>');
  assert.equal(raw.slice(u.close.start, u.close.end), '</u>');
});

test('highlights a plain selection in yellow and other colours', () => {
  const raw = 'The quick brown fox';
  const { segs, existing } = selectText(raw, 'quick brown');
  assert.equal(addMark(raw, segs, { kind: 'hl', color: 'yellow' }, existing).text, 'The ==quick brown== fox');
  assert.equal(
    addMark(raw, segs, { kind: 'hl', color: 'blue' }, existing).text,
    'The <mark style="background: #bfdbfe">quick brown</mark> fox',
  );
});

test('trims whitespace off the ends of a selection', () => {
  const raw = 'one two three';
  const { segs, existing } = select(raw, 3, 8);
  assert.equal(addMark(raw, segs, { kind: 'hl', color: 'yellow' }, existing).text, 'one ==two== three');
});

test('wraps each side of bold text separately so the markdown stays valid', () => {
  const raw = 'one **two three** four';
  const { segs, existing } = selectText(raw, 'three** four');
  assert.equal(addMark(raw, segs, { kind: 'hl', color: 'yellow' }, existing).text, 'one **two ==three==** ==four==');
});

test('wraps each paragraph of a multi-paragraph selection', () => {
  const raw = 'first para\n\nsecond para';
  const { segs, existing } = select(raw, 6, 18);
  assert.equal(addMark(raw, segs, { kind: 'hl', color: 'yellow' }, existing).text, 'first ==para==\n\n==second== para');
});

test('recolours a highlight when the selection is inside it', () => {
  const raw = 'a ==big idea== b';
  const { segs, existing } = selectText(raw, 'idea');
  assert.equal(
    addMark(raw, segs, { kind: 'hl', color: 'pink' }, existing).text,
    'a <mark style="background: #fbcfe8">big idea</mark> b',
  );
});

test('extending into a highlight merges with it instead of nesting', () => {
  const raw = 'a ==big== idea b';
  const { segs, existing } = selectText(raw, 'big== idea');
  assert.equal(addMark(raw, segs, { kind: 'hl', color: 'yellow' }, existing).text, 'a ==big idea== b');
});

test('underline toggles on and off', () => {
  const raw = 'plain words here';
  const on = toggleUnderline(raw, ...args(selectText(raw, 'words'))).text;
  assert.equal(on, 'plain <u>words</u> here');
  assert.equal(toggleUnderline(on, ...args(selectText(on, 'words'))).text, raw);
});

test('underline and highlight nest', () => {
  const raw = 'a ==bc== d';
  const { segs, existing } = selectText(raw, 'bc');
  assert.equal(toggleUnderline(raw, segs, existing).text, 'a ==<u>bc</u>== d');
});

test('clear removes every mark the selection touches', () => {
  const raw = 'a ==b== <u>c</u> <mark style="background: #bbf7d0">d</mark> ==e==';
  const { segs, existing } = selectText(raw, 'b== <u>c</u> <mark style="background: #bbf7d0">d');
  assert.equal(clearMarks(raw, segs, existing).text, 'a b c d ==e==');
});

test('link text is wrapped inside the link, wikilinks are wrapped whole', () => {
  const raw = 'see [the docs](https://x.y) now';
  const { segs, existing } = selectText(raw, 'docs');
  assert.equal(addMark(raw, segs, { kind: 'hl', color: 'yellow' }, existing).text, 'see [the ==docs==](https://x.y) now');

  const wiki = 'go to [[Garden Plan|the plan]] today';
  const mapped = trackedReplace(wiki, /\[\[([^\]|]+)\|([^\]]+)\]\]/g, (m) => `[${m[2]}](wikilink:${encodeURIComponent(m[1])})`);
  const html = render(mapped.text);
  const pieces = piecesIn(html).map((p) => mapped.toSourcePiece(p));
  const a = wiki.indexOf('[[');
  const segs2 = selectSegments(wiki, piecesInRange(pieces, a + 3, a + 6));
  assert.equal(addMark(wiki, segs2, { kind: 'hl', color: 'yellow' }, []).text, 'go to ==[[Garden Plan|the plan]]== today');
});

test('trackedReplace maps positions outside replacements exactly', () => {
  const m = trackedReplace('ab[[X]]cd', /\[\[X\]\]/g, () => '[X](wikilink:X)');
  assert.equal(m.text, 'ab[X](wikilink:X)cd');
  assert.equal(m.toSource(1, 'start'), 1);
  assert.equal(m.toSource(m.text.indexOf('cd'), 'start'), 7);
  assert.equal(m.toSource(4, 'start'), 2);
  assert.equal(m.toSource(4, 'end'), 7);
  const twice = trackedReplace(m, /cd/g, () => 'CDE');
  assert.equal(twice.text, 'ab[X](wikilink:X)CDE');
  assert.equal(twice.toSource(twice.text.length, 'end'), 9);
});

test('edit results map the old selection onto the new text', () => {
  const raw = 'one two three';
  const { segs, existing } = selectText(raw, 'two');
  const r = addMark(raw, segs, { kind: 'hl', color: 'yellow' }, existing);
  assert.equal(r.text.slice(r.map(4, 'start'), r.map(7, 'end')), 'two');
});

function args(sel: { segs: ReturnType<typeof selectSegments>; existing: ExistingMark[] }) {
  return [sel.segs, sel.existing] as const;
}
