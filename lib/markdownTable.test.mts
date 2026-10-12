import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editTable, nextCell, nextRow, tableAt, NEW_TABLE, NEW_TABLE_SELECT } from './markdownTable.ts';
import { layoutOf, rewriteVisible } from './noteEditorText.ts';
import { toggleTaskAt } from './noteTasks.ts';

const messy = 'Intro\n|Name|Qty|\n|-|-:|\n|apples|3|\n|kiwi|12|\nOutro';
const at = (text: string, needle: string) => text.indexOf(needle) + needle.length;

test('the caret\'s table, cell and alignment are found, and prose is left alone', () => {
  const t = tableAt(messy, at(messy, 'kiw'))!;
  assert.deepEqual(t.rows, [['Name', 'Qty'], ['apples', '3'], ['kiwi', '12']]);
  assert.deepEqual(t.align, [null, 'right']);
  assert.deepEqual([t.row, t.col], [2, 0]);
  assert.deepEqual([tableAt(messy, at(messy, '|12'))!.col, tableAt(messy, 2)], [1, null]);
  assert.equal(tableAt('| just a pipe line |', 3), null);
});

test('Tab lines the table up and moves to the next cell, adding a row after the last', () => {
  const r = nextCell(messy, at(messy, 'Name'), false)!;
  assert.equal(r.text, 'Intro\n| Name   | Qty |\n| ------ | --: |\n| apples | 3   |\n| kiwi   | 12  |\nOutro');
  assert.equal(r.text.slice(...r.sel), 'Qty');
  const end = nextCell(r.text, at(r.text, '12'), false)!;
  assert.match(end.text, /\| kiwi {3}\| 12 {2}\|\n\| {8}\| {5}\|\nOutro$/);
  assert.equal(tableAt(end.text, end.sel[0])!.row, 3);
  const back = nextCell(r.text, at(r.text, '| apples'), true)!;
  assert.equal(r.text.slice(...back.sel), 'Qty');
});

test('Enter goes to the start of the next row, and leaves the table from an empty last row', () => {
  const down = nextRow(messy, at(messy, '|3'))!;
  assert.deepEqual([tableAt(down.text, down.sel[0])!.row, tableAt(down.text, down.sel[0])!.col], [2, 0]);
  assert.equal(down.text.slice(...down.sel), 'kiwi');
  const grown = nextRow(down.text, at(down.text, 'kiwi'))!;
  assert.equal(tableAt(grown.text, grown.sel[0])!.rows.length, 4);
  const out = nextRow(grown.text, grown.sel[0])!;
  assert.equal(tableAt(out.text, out.sel[0]), null);
  // A blank line, then the caret on a line of its own, then the rest of the note.
  assert.match(out.text, /\| kiwi {3}\| 12 {2}\|\n\n\nOutro$/);
  assert.equal(out.text.slice(out.sel[0]), '\nOutro');
  // At the very end of a note too.
  const atEnd = nextRow('|a|\n|-|\n|b|\n| |', 16)!;
  assert.equal(atEnd.text, '| a   |\n| --- |\n| b   |\n\n');
  assert.equal(atEnd.sel[0], atEnd.text.length);
});

test('rows and columns are added and removed around the caret', () => {
  const c = at(messy, 'appl');
  assert.deepEqual(tableAt(editTable(messy, c, 'col-right')!.text, 0 + 7)!.rows[0], ['Name', '', 'Qty']);
  assert.deepEqual(tableAt(editTable(messy, c, 'del-col')!.text, 7)!.rows, [['Qty'], ['3'], ['12']]);
  assert.deepEqual(tableAt(editTable(messy, c, 'row-above')!.text, 7)!.rows[1], ['', '']);
  assert.deepEqual(tableAt(editTable(messy, c, 'del-row')!.text, 7)!.rows, [['Name', 'Qty'], ['kiwi', '12']]);
  assert.equal(editTable('|a|\n|-|\n', 1, 'del-col'), null);
});

test('a new table starts with its first heading selected', () => {
  assert.equal(NEW_TABLE.slice(...NEW_TABLE_SELECT), 'Column 1');
  assert.ok(tableAt(NEW_TABLE, 3));
});

test('lining up a table keeps highlights on their words, not the padding', () => {
  const blue = '<mark style="background: #bfdbfe">';
  const raw = `|Name|Qty|\n|-|-|\n|${blue}apples</mark>|<u>3</u>|`;
  const shown = layoutOf(raw).visible;
  const tidy = editTable(shown, 1, 'tidy')!;
  const result = rewriteVisible(raw, tidy.text)!;
  assert.equal(result, `| Name   | Qty |\n| ------ | --- |\n| ${blue}apples</mark> | <u>3</u>   |`);
});

test('a rewrite that can\'t be shown exactly is refused', () => {
  assert.equal(rewriteVisible('a <u>b</u>', 'a <u>b'), null);
});

test('a to-do is ticked and unticked on its own line, in lists and quotes', () => {
  const text = 'Shop\n- [ ] milk\n  - [x] eggs\n> 1. [ ] tea\n- not a task';
  assert.equal(toggleTaskAt(text, text.indexOf('- [ ] milk')), 'Shop\n- [x] milk\n  - [x] eggs\n> 1. [ ] tea\n- not a task');
  assert.equal(toggleTaskAt(text, text.indexOf('  - [x]')), 'Shop\n- [ ] milk\n  - [ ] eggs\n> 1. [ ] tea\n- not a task');
  assert.equal(toggleTaskAt(text, text.indexOf('tea')), 'Shop\n- [ ] milk\n  - [x] eggs\n> 1. [x] tea\n- not a task');
  assert.equal(toggleTaskAt(text, text.indexOf('not')), null);
});
