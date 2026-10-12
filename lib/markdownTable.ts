// Markdown tables in the note editor, kept easy to work in: the caret's table is found and
// its columns lined up, Tab and Enter move between cells, and rows and columns come and go
// from the editor's table bar. Everything here works on the editor's shown text and returns
// the whole new text with the selection to put in it. Moving to a cell selects its text, as a
// spreadsheet does, so typing replaces it.

export type Align = 'left' | 'center' | 'right' | null;

export type TableHere = {
  start: number; // where the table's first line starts
  end: number; // where its last line ends (before any newline)
  indent: string;
  rows: string[][]; // header first; the --- line isn't a row
  align: Align[];
  row: number; // the caret's cell
  col: number;
};

export type TableEdit = { text: string; sel: [number, number] };

const DELIM_CELL = /^\s*:?-+:?\s*$/;
const isRowLine = (line: string) => /^\s*\|/.test(line);

// A row's cells: split on the pipes that aren't escaped (\|), the outer ones dropped.
export function cellsOf(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') {
      cur += '\\|';
      i++;
    } else if (s[i] === '|') {
      cells.push(cur.trim());
      cur = '';
    } else cur += s[i];
  }
  cells.push(cur.trim());
  return cells;
}

// Which cell the caret is in: the unescaped pipes before it on its line.
function colOf(line: string, at: number): number {
  let pipes = 0;
  for (let i = 0; i < at; i++) {
    if (line[i] === '\\') i++;
    else if (line[i] === '|') pipes++;
  }
  return Math.max(0, pipes - (line.trimStart().startsWith('|') ? 1 : 0));
}

const alignOf = (cell: string): Align => {
  const c = cell.trim();
  return c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : c.startsWith(':') ? 'left' : null;
};

// The table the caret is in: pipe-led lines, the second of them a --- line.
export function tableAt(text: string, caret: number): TableHere | null {
  const lineStart = (i: number) => text.lastIndexOf('\n', i - 1) + 1;
  const lineEnd = (i: number) => {
    const e = text.indexOf('\n', i);
    return e === -1 ? text.length : e;
  };
  const here = lineStart(caret);
  if (!isRowLine(text.slice(here, lineEnd(here)))) return null;
  let start = here;
  while (start > 0) {
    const prev = lineStart(start - 1);
    if (!isRowLine(text.slice(prev, start - 1))) break;
    start = prev;
  }
  let end = lineEnd(here);
  while (end < text.length) {
    const next = lineEnd(end + 1);
    if (!isRowLine(text.slice(end + 1, next))) break;
    end = next;
  }
  const lines = text.slice(start, end).split('\n');
  if (lines.length < 2) return null;
  const delim = cellsOf(lines[1]);
  if (!delim.every((c) => DELIM_CELL.test(c))) return null;
  const lineNo = text.slice(start, here).split('\n').length - 1;
  const rows = [cellsOf(lines[0]), ...lines.slice(2).map(cellsOf)];
  const cols = Math.max(...rows.map((r) => r.length), delim.length);
  return {
    start,
    end,
    indent: /^\s*/.exec(lines[0])![0],
    rows,
    align: Array.from({ length: cols }, (_, i) => (i < delim.length ? alignOf(delim[i]) : null)),
    row: lineNo <= 1 ? 0 : lineNo - 1,
    col: Math.min(colOf(lines[lineNo], caret - here), cols - 1),
  };
}

const width = (s: string) => Array.from(s).length;

type Shape = Pick<TableHere, 'indent' | 'rows' | 'align'>;

// The table with every column padded to its widest cell, and where each cell's text is.
function layOut(t: Shape): { text: string; cellAt: (row: number, col: number) => [number, number] } {
  const cols = t.align.length;
  const rows = t.rows.map((r) => Array.from({ length: cols }, (_, i) => r[i] ?? ''));
  const widths = Array.from({ length: cols }, (_, c) => Math.max(3, ...rows.map((r) => width(r[c]))));
  const pad = (s: string, w: number) => s + ' '.repeat(w - width(s));
  const dashes = widths.map((w, i) => {
    const a = t.align[i];
    return a === 'center' ? `:${'-'.repeat(w - 2)}:` : a === 'left' ? `:${'-'.repeat(w - 1)}` : a === 'right' ? `${'-'.repeat(w - 1)}:` : '-'.repeat(w);
  });
  let text = '';
  const cells: [number, number][][] = [];
  const line = (row: string[], track: boolean) => {
    if (text) text += '\n';
    text += `${t.indent}| `;
    const at: [number, number][] = [];
    row.forEach((c, i) => {
      if (i) text += ' | ';
      at.push([text.length, text.length + c.length]);
      text += pad(c, widths[i]);
    });
    text += ' |';
    if (track) cells.push(at);
  };
  line(rows[0], true);
  line(dashes, false);
  for (const r of rows.slice(1)) line(r, true);
  return { text, cellAt: (row, col) => cells[row][col] };
}

// A table's Markdown, columns lined up: rows of cell text (header first) and their alignment.
export function tableMarkdown(rows: string[][], align: Align[]): string {
  return layOut({ indent: '', rows, align }).text;
}

// The new text with the table replaced by `shape`, and cell (row, col)'s text selected.
function put(text: string, t: TableHere, shape: Shape, row: number, col: number): TableEdit {
  const { text: table, cellAt } = layOut(shape);
  const [from, to] = cellAt(row, col);
  return { text: text.slice(0, t.start) + table + text.slice(t.end), sel: [t.start + from, t.start + to] };
}

const blankRow = (cols: number) => Array.from({ length: cols }, () => '');

// Tab: the next cell (a new row after the last one). Shift+Tab: the one before.
export function nextCell(text: string, caret: number, back: boolean): TableEdit | null {
  const t = tableAt(text, caret);
  if (!t) return null;
  const cols = t.align.length;
  let { row, col } = t;
  const rows = t.rows.map((r) => [...r]);
  if (back) {
    if (col > 0) col--;
    else if (row > 0) [row, col] = [row - 1, cols - 1];
  } else if (col < cols - 1) col++;
  else {
    row++;
    col = 0;
    if (row >= rows.length) rows.push(blankRow(cols));
  }
  return put(text, t, { ...t, rows }, row, col);
}

// Enter: the start of the next row (a new row after the last one). On an empty last row, the
// row goes and the caret leaves the table, like Enter on an empty list item, onto a new line
// with a blank one before it: a line straight under a table would be read as another row.
export function nextRow(text: string, caret: number): TableEdit | null {
  const t = tableAt(text, caret);
  if (!t) return null;
  const rows = t.rows.map((r) => [...r]);
  const last = t.row === rows.length - 1;
  if (last && t.row > 0 && rows[t.row].every((c) => c === '')) {
    rows.pop();
    const { text: table } = layOut({ ...t, rows });
    const before = text.slice(0, t.start) + table;
    const tail = text.slice(t.end + 1).replace(/^\n/, '');
    const caret = before.length + 2;
    return { text: `${before}\n\n${tail ? `\n${tail}` : ''}`, sel: [caret, caret] };
  }
  if (last) rows.push(blankRow(t.align.length));
  return put(text, t, { ...t, rows }, t.row + 1, 0);
}

export type TableOp = 'row-above' | 'row-below' | 'col-left' | 'col-right' | 'del-row' | 'del-col' | 'tidy';

// The table bar's buttons. A table keeps at least its header row and one column.
export function editTable(text: string, caret: number, op: TableOp): TableEdit | null {
  const t = tableAt(text, caret);
  if (!t) return null;
  const cols = t.align.length;
  let rows = t.rows.map((r) => Array.from({ length: cols }, (_, i) => r[i] ?? ''));
  let align = [...t.align];
  let { row, col } = t;
  switch (op) {
    case 'row-above':
      // Above the header, the new row becomes the header.
      rows.splice(row, 0, blankRow(cols));
      break;
    case 'row-below':
      rows.splice(row + 1, 0, blankRow(cols));
      row++;
      break;
    case 'col-left':
    case 'col-right': {
      const at = op === 'col-left' ? col : col + 1;
      rows = rows.map((r) => [...r.slice(0, at), '', ...r.slice(at)]);
      align.splice(at, 0, null);
      col = at;
      break;
    }
    case 'del-row':
      if (rows.length === 1) return null;
      rows.splice(row, 1);
      row = Math.min(row, rows.length - 1);
      break;
    case 'del-col':
      if (cols === 1) return null;
      rows = rows.map((r) => r.filter((_, i) => i !== col));
      align = align.filter((_, i) => i !== col);
      col = Math.min(col, cols - 2);
      break;
    case 'tidy':
      break;
  }
  return put(text, t, { ...t, rows, align }, row, col);
}

// A new table for "/table" and the table bar: two columns, a header and one row, the caret in
// the first heading with its placeholder selected, ready to type over.
export const NEW_TABLE = '| Column 1 | Column 2 |\n| -------- | -------- |\n|          |          |\n';
export const NEW_TABLE_SELECT: [number, number] = [2, 10];
