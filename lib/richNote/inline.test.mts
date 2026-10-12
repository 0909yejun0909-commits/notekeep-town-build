import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAtom, parseInline, serializeInline, type Marks, type Run } from './inline.ts';

const t = (text: string, m: Marks = {}): Run => ({ text, m });

test('running text reads as runs', () => {
  assert.deepEqual(parseInline('a **b** *c* ~~d~~ `e` ==f== <u>g</u> [h](http://x.y)'), [
    t('a '), t('b', { b: true }), t(' '), t('c', { i: true }), t(' '), t('d', { s: true }), t(' '), t('e', { code: true }),
    t(' '), t('f', { hl: 'yellow' }), t(' '), t('g', { u: true }), t(' '), t('h', { link: 'http://x.y' }),
  ]);
  assert.deepEqual(parseInline('x <mark style="background: #bfdbfe">y</mark>'), [t('x '), t('y', { hl: 'blue' })]);
  assert.deepEqual(parseInline('**bold *both***'), [t('bold ', { b: true }), t('both', { b: true, i: true })]);
});

test('wikilinks, embeds and the unusual are atoms, kept as written', () => {
  const runs = parseInline('see [[Notes/Plan|the plan]] and ![[pic.png]] and https://a.b/c')!;
  const atoms = runs.filter(isAtom);
  assert.deepEqual(atoms.map((a) => [a.atom, a.text, a.kind]), [
    ['[[Notes/Plan|the plan]]', 'the plan', 'wikilink'],
    ['![[pic.png]]', 'pic.png', 'embed'],
  ]);
  // A bare address stays text.
  assert.equal((runs[runs.length - 1] as { text: string }).text, ' and https://a.b/c');
  assert.equal(parseInline('\\[\\[not a link\\]\\]')!.some(isAtom), false);
});

test('only running text is inline: a heading, a list, two paragraphs are not', () => {
  assert.equal(parseInline('# x'), null);
  assert.equal(parseInline('- x'), null);
  assert.equal(parseInline('a\n\nb'), null);
  assert.deepEqual(parseInline(''), []);
});

test('runs back to Markdown, lightly escaped', () => {
  const md = (runs: Run[], o = {}) => {
    const r = serializeInline(runs, o);
    assert.ok(r.ok, r.md);
    return r.md;
  };
  assert.equal(md([t('plain text, with punctuation: e.g. 3 + 4 = 7!')]), 'plain text, with punctuation: e.g. 3 + 4 = 7!');
  assert.equal(md([t('a '), t('bold', { b: true }), t(' and '), t('code', { code: true })]), 'a **bold** and `code`');
  assert.equal(md([t('snake_case and 2*3 and [x]')]), 'snake_case and 2\\*3 and \\[x]');
  assert.equal(md([t('# not a heading')]), '\\# not a heading');
  assert.equal(md([t('1. not a list')]), '1\\. not a list');
  assert.equal(md([t('- no\n- list')]), '\\- no\n\\- list');
  assert.equal(md([t('bold ', { b: true }), t('next')]), '**bold** next');
  assert.equal(md([t('hi', { hl: 'pink' }), t('!', { u: true })]), '<mark style="background: #fbcfe8">hi</mark><u>!</u>');
  assert.equal(md([t('a`b', { code: true })]), '``a`b``');
  assert.equal(md([t('see '), t('docs', { link: 'https://x.y/a b' })]), 'see [docs](<https://x.y/a b>)');
  assert.equal(md([t('cells | here')], { table: true, lineStart: false }), 'cells \\| here');
});

test('whatever a note says, its runs save and read back the same', () => {
  const samples = [
    'Mix **bold _and italic_** with `code` and ==yellow== and <u>under</u>.',
    'A [link **with** bold](https://x.y) then text.',
    'Escapes: \\*not italic\\*, \\_not\\_, 5 \\< 6, a\\\\b',
    'Line one\nline two\nline three',
    'Emoji 🎉 and ünïcödé and 中文 text',
    'Edge **bold.** then *ital.* end',
    '~~struck **and bold**~~ plain',
    'html <span>kept</span> and &amp; entity',
    '<mark style="background: #123456">custom</mark> colour',
  ];
  for (const s of samples) {
    const runs = parseInline(s)!;
    assert.ok(runs, s);
    const { md, ok } = serializeInline(runs);
    assert.ok(ok, `${s} -> ${md}`);
    assert.deepEqual(parseInline(md), runs, `${s} -> ${md}`);
  }
});

test('random runs always save to Markdown that reads back as them', () => {
  let seed = 12345;
  const rand = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
  const chars = 'ab cd*_`~[]<>=#-+!&|\\.:1()';
  const palette: Marks[] = [{}, { b: true }, { i: true }, { s: true }, { code: true }, { u: true }, { hl: 'yellow' }, { hl: 'blue' }, { b: true, i: true }, { link: 'http://e.x' }, { b: true, hl: 'green' }];
  let failures = 0;
  for (let n = 0; n < 3000; n++) {
    const runs: Run[] = [];
    const count = 1 + rand(4);
    for (let k = 0; k < count; k++) {
      let text = '';
      const len = 1 + rand(6);
      for (let c = 0; c < len; c++) text += chars[rand(chars.length)];
      runs.push({ text, m: palette[rand(palette.length)] });
    }
    const { md, ok } = serializeInline(runs);
    if (!ok) {
      failures++;
      if (failures <= 5) console.log('not exact:', JSON.stringify(runs), '->', JSON.stringify(md));
    }
  }
  assert.equal(failures, 0);
});
