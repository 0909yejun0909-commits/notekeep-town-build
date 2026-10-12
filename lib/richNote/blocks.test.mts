import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newId, parseNote, serializeNote, touched, type Block, type Note } from './blocks.ts';
import { DEMO_FILES } from '../vault/demo.ts';
import { runsKey, type Marks, type Run } from './inline.ts';

const TRICKY: Record<string, string> = {
  front: '---\ntitle: x\ntags: [a, b]\n---\n# Heading\n\nBody text.\n',
  nested: '- one\n  - two\n    - three\n- four\n\t- tabbed\n1. first\n2. second\n   1. sub\n',
  loose: '- a\n\n- b\n\n\n- c\n',
  tasks: '- [ ] todo\n- [x] done\n  - [ ] nested todo\n* star item\n+ plus item\n3) paren\n',
  quotes: '> plain quote\n> on two lines\n\n> [!note] A callout\n> body\n\n> - list in quote\n',
  code: '```js\nconst a = 1;\n```\n\n~~~\ntilde\n~~~\n\n    indented code\n',
  table: '| a | b |\n|:--|--:|\n| 1 | **2** |\n| x \\| y | `z` |\n',
  html: '<div>\nhtml block\n</div>\n\nText <span>inline</span>.\n',
  setext: 'Title\n=====\n\nSub\n---\n',
  footnote: 'Text[^1].\n\n[^1]: The note.\n\n[ref]: https://x.y\n',
  hrs: 'a\n\n---\n\n***\n\n___\nb',
  crlf: '# Win\r\n\r\nline one\r\nline two\r\n- item\r\n',
  spacing: '\n\n  leading blanks\n\n\n\nmany blanks\n\n\n',
  lazy: '- item\ncontinued lazily\n\n> quote\ncontinued\n',
  complex: '- item\n\n  second paragraph in item\n- next\n',
  embeds: '![[pic.png]]\n\nSee [[Note|alias]] and ![img](a.png "t").\n',
  noEnd: 'no trailing newline',
  empty: '',
};

const all = { ...DEMO_FILES, ...TRICKY };

test('a note nobody edits comes back byte for byte', () => {
  for (const [name, md] of Object.entries(all)) assert.equal(serializeNote(parseNote(md)), md, name);
});

test('notes split into the blocks the editor shows', () => {
  const kinds = (md: string) => parseNote(md).blocks.map((b) => (b.kind === 'li' ? `li${b.task === null ? '' : b.task ? '[x]' : '[ ]'}:${b.indent.length}` : b.kind));
  assert.deepEqual(kinds(TRICKY.front), ['raw', 'h', 'p']);
  assert.deepEqual(kinds(TRICKY.nested), ['li:0', 'li:2', 'li:4', 'li:0', 'li:1', 'li:0', 'li:0', 'li:3']);
  assert.deepEqual(kinds(TRICKY.tasks), ['li[ ]:0', 'li[x]:0', 'li[ ]:2', 'li:0', 'li:0', 'li:0']);
  assert.deepEqual(kinds(TRICKY.quotes), ['quote', 'raw', 'raw']);
  assert.deepEqual(kinds(TRICKY.code), ['code', 'code', 'raw']);
  assert.deepEqual(kinds(TRICKY.setext), ['raw', 'raw']);
  assert.deepEqual(kinds(TRICKY.complex), ['raw', 'li:0']);
  assert.deepEqual(kinds(TRICKY.hrs), ['p', 'hr', 'hr', 'hr', 'p']);
  const quote = parseNote(TRICKY.quotes).blocks[0] as Extract<Block, { kind: 'quote' }>;
  assert.equal(quote.runs.map((r) => r.text).join(''), 'plain quote\non two lines');
});

// What a note means to the editor: its blocks' kinds and contents, ids and spelling aside.
function meaning(note: Note) {
  return note.blocks
    // A paragraph of nothing but spaces is a blank line once written.
    .filter((b) => !(b.kind === 'p' && runsKey(b.runs) === '[]'))
    .map((b) => {
      const { id, src, gap, edited, was, ...rest } = b;
      void id; void src; void gap; void edited; void was;
      return JSON.stringify(rest, (k, v) => (k === 'runs' ? runsKey(v) : k === 'rows' ? v.map((r: Run[][]) => r.map(runsKey)) : v));
    });
}

test('every block, written afresh from what it holds, reads back the same', () => {
  for (const [name, md] of Object.entries(all)) {
    const note = parseNote(md);
    const rewritten = serializeNote({ ...note, blocks: note.blocks.map((b) => touched(b)) });
    assert.deepEqual(meaning(parseNote(rewritten)), meaning(note), `${name}:\n${rewritten}`);
  }
});

test('edits rewrite only their block, and new neighbours get a safe gap', () => {
  const md = '# Title\n\nFirst para.\n\n- a\n- b\n\nLast.\n';
  const note = parseNote(md);
  const [h, p, a, b, last] = note.blocks as Extract<Block, { kind: 'h' | 'p' | 'li' }>[];
  const edited = { ...touched(p), runs: [{ text: 'Changed ', m: {} }, { text: 'text', m: { b: true } }] } as Block;
  assert.equal(serializeNote({ ...note, blocks: [h, edited, a, b, last] }), '# Title\n\nChanged **text**\n\n- a\n- b\n\nLast.\n');
  const item = { ...touched(a), id: newId(), was: null, runs: [{ text: 'new', m: {} }] } as Block;
  assert.equal(serializeNote({ ...note, blocks: [h, p, a, item, b, last] }), '# Title\n\nFirst para.\n\n- a\n- new\n- b\n\nLast.\n');
  const para = { kind: 'p', id: newId(), src: '', gap: '', edited: true, was: null, runs: [{ text: 'between', m: {} }] } as Block;
  assert.equal(serializeNote({ ...note, blocks: [h, p, a, para, b, last] }), '# Title\n\nFirst para.\n\n- a\n\nbetween\n\n- b\n\nLast.\n');
  assert.equal(serializeNote({ ...note, blocks: [p, a, b, last] }), 'First para.\n\n- a\n- b\n\nLast.\n');
  const emptied = { ...touched(p), runs: [] } as Block;
  const spare = { kind: 'p', id: newId(), src: '', gap: '', edited: true, was: null, runs: [] } as Block;
  assert.equal(serializeNote({ ...note, blocks: [h, emptied, a, b, last, spare] }), '# Title\n\n- a\n- b\n\nLast.\n');
  const ticked = { ...touched(a), task: true } as Block;
  assert.equal(serializeNote({ ...note, blocks: [h, p, ticked, b, last] }), '# Title\n\nFirst para.\n\n- [x] a\n- b\n\nLast.\n');
});

test('random notes, written from their blocks, read back as the same blocks', () => {
  let seed = 777;
  const rand = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
  const chars = 'ab cd*_`~[]<>=#-+!&|\\.:1()';
  const palette: Marks[] = [{}, {}, { b: true }, { i: true }, { code: true }, { u: true }, { hl: 'yellow' }, { hl: 'pink' }, { link: 'http://e.x' }];
  const runs = (): Run[] => {
    const out: Run[] = [];
    for (let k = 0, n = 1 + rand(3); k < n; k++) {
      let text = '';
      for (let c = 0, len = 1 + rand(6); c < len; c++) text += chars[rand(chars.length)];
      out.push({ text, m: palette[rand(palette.length)] });
    }
    return out;
  };
  const base = { src: '', gap: '', edited: true, was: null };
  let failures = 0;
  for (let n = 0; n < 400; n++) {
    const blocks: Block[] = [];
    for (let k = 0, count = 1 + rand(6); k < count; k++) {
      const kind = rand(8);
      const id = newId();
      if (kind === 0) blocks.push({ ...base, id, kind: 'p', runs: runs() });
      else if (kind === 1) blocks.push({ ...base, id, kind: 'h', level: 1 + rand(3), runs: runs() });
      else if (kind === 2) blocks.push({ ...base, id, kind: 'li', indent: '', marker: '-', task: null, runs: runs() });
      else if (kind === 3) blocks.push({ ...base, id, kind: 'li', indent: '', marker: '-', task: rand(2) === 0, runs: runs() });
      else if (kind === 4) blocks.push({ ...base, id, kind: 'quote', runs: runs() });
      else if (kind === 5) blocks.push({ ...base, id, kind: 'code', lang: '', code: 'x = 1\n```\ny' });
      else if (kind === 6) blocks.push({ ...base, id, kind: 'hr' });
      else blocks.push({ ...base, id, kind: 'table', align: [null, 'right'], rows: [[runs(), runs()], [runs(), runs()]] });
    }
    const note: Note = { blocks, tail: '\n' };
    const md = serializeNote(note);
    const back = parseNote(md);
    const want = meaning(note);
    const got = meaning(back);
    if (JSON.stringify(want) !== JSON.stringify(got)) {
      failures++;
      if (failures <= 3) console.log('differs:\n' + md + '\nwant ' + want.join('\n     ') + '\ngot  ' + got.join('\n     '));
    }
  }
  assert.equal(failures, 0);
});
