import type { Nodes, Parent } from 'mdast';
import { readMarkdown, runsOfNode, serializeInline, type Run } from './inline';
import { tableMarkdown, type Align } from '../markdownTable';

// A note as blocks, the way the editor shows it: paragraphs, headings, list items (to-dos
// among them), quotes, code, tables and dividers, each its own block. Anything else (front
// matter, HTML, callouts, footnotes, a list item holding more than a line of text) is a raw
// block, shown as the note shows it and kept exactly as written.
//
// The note is split where Markdown itself splits it (remark, as the note view reads it). Every
// block keeps its own text from the note and what separated it from the block before, so a
// note nobody edited comes back byte for byte, and an edit rewrites only the blocks it touched.

export type TextKind = 'p' | 'h' | 'li' | 'quote';

type Base = {
  id: number;
  src: string; // the block's Markdown as it is in the note
  gap: string; // what's between the block before and this one ('' for the first)
  edited: boolean; // src no longer matches what's in the block: it's written afresh
  was: { prev: number | null; kind: string } | null; // its neighbour and kind when read, for its gap
};

export type Block = Base &
  (
    | { kind: 'p'; runs: Run[] }
    | { kind: 'h'; level: number; runs: Run[] }
    | { kind: 'li'; indent: string; marker: string; task: boolean | null; runs: Run[] }
    | { kind: 'quote'; runs: Run[] }
    | { kind: 'code'; lang: string; code: string }
    | { kind: 'table'; align: Align[]; rows: Run[][][] }
    | { kind: 'hr' }
    | { kind: 'raw' }
  );

export type Note = { blocks: Block[]; tail: string };

let nextId = 1;
export const newId = () => nextId++;

type Positioned = { position?: { start: { offset?: number }; end: { offset?: number } } };
const start = (n: Positioned) => n.position!.start.offset!;
const end = (n: Positioned) => n.position!.end.offset!;
const lineStart = (md: string, at: number) => md.lastIndexOf('\n', at - 1) + 1;

type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type Draft = DistOmit<Block, 'id' | 'gap' | 'edited' | 'was'> & { from: number; to: number };

// List items, one block each with any items nested in them after it. An item holding anything
// but one line of text (and its nested list) goes raw, nested items and all.
function listItems(list: Parent, md: string, out: Draft[]) {
  for (const item of list.children as Parent[]) {
    const from = lineStart(md, start(item));
    const kids = item.children as Nodes[];
    const para = kids[0]?.type === 'paragraph' ? (kids[0] as Parent) : null;
    const rest = para ? kids.slice(1) : kids;
    const nested = rest.length === 1 && rest[0].type === 'list' ? (rest[0] as Parent) : null;
    if (rest.length > (nested ? 1 : 0)) {
      out.push({ kind: 'raw', src: md.slice(from, end(item)), from, to: end(item) });
      continue;
    }
    const head = /^([ \t]*)([-*+]|\d{1,9}[.)])/.exec(md.slice(from))!;
    const checked = (item as { checked?: boolean | null }).checked;
    const to = para ? end(para) : from + md.slice(from).split('\n')[0].trimEnd().length;
    out.push({
      kind: 'li',
      indent: head[1],
      marker: head[2],
      task: checked === undefined || checked === null ? null : checked,
      runs: para ? runsOfNode(para, md) : [],
      src: md.slice(from, to),
      from,
      to,
    });
    if (nested) listItems(nested, md, out);
  }
}

// The text inside a quote holding one paragraph, "> " taken off each line. Callouts
// ("> [!note]") aren't plain quotes.
function quoteOf(node: Parent, md: string): Draft | null {
  if (node.children.length !== 1 || node.children[0].type !== 'paragraph') return null;
  const para = node.children[0] as Parent;
  const text = md.slice(start(para), end(para));
  if (/^\[!/.test(text)) return null;
  return { kind: 'quote', runs: runsOfNode(para, md), src: md.slice(start(node), end(node)), from: start(node), to: end(node) };
}

function tableOf(node: Parent, md: string): Draft {
  const rows = (node.children as Parent[]).map((row) => (row.children as Parent[]).map((cell) => runsOfNode(cell, md)));
  const align = ((node as { align?: (Align | undefined)[] }).align ?? []).map((a) => a ?? null);
  return { kind: 'table', align, rows, src: md.slice(start(node), end(node)), from: start(node), to: end(node) };
}

function blocksOf(md: string, offset: number, out: Draft[]) {
  const tree = readMarkdown(md);
  const at = (d: Draft): Draft => ({ ...d, from: d.from + offset, to: d.to + offset });
  for (const node of tree.children as Nodes[]) {
    const from = start(node);
    const to = end(node);
    const src = md.slice(from, to);
    const raw = (): Draft => ({ kind: 'raw', src, from, to });
    let d: Draft | Draft[];
    switch (node.type) {
      case 'paragraph':
        d = { kind: 'p', runs: runsOfNode(node as Parent, md), src, from, to };
        break;
      case 'heading': {
        // Only "# Heading" ones; underlined (setext) headings stay as written.
        d = /^ {0,3}#/.test(src) ? { kind: 'h', level: node.depth, runs: runsOfNode(node as Parent, md), src, from, to } : raw();
        break;
      }
      case 'thematicBreak':
        d = { kind: 'hr', src, from, to };
        break;
      case 'code':
        d = /^(`{3,}|~{3,})/.test(src) ? { kind: 'code', lang: node.lang ?? '', code: node.value, src, from, to } : raw();
        break;
      case 'table':
        d = tableOf(node as Parent, md);
        break;
      case 'blockquote':
        d = quoteOf(node as Parent, md) ?? raw();
        break;
      case 'list': {
        const items: Draft[] = [];
        listItems(node as Parent, md, items);
        // Items must follow one another down the page ("- - x" puts two on one line): else the
        // list stays as written.
        const tidy = items.every((x, i) => x.from >= (i ? items[i - 1].to : from) && x.to >= x.from);
        d = tidy ? items : raw();
        break;
      }
      default:
        d = raw();
    }
    for (const x of Array.isArray(d) ? d : [d]) out.push(at(x));
  }
}

// Front matter (--- at the very top) is the note's own: kept raw, and the rest read without it.
const FRONT = /^---[ \t]*\n[\s\S]*?\n(---|\.\.\.)[ \t]*(\n|$)/;

export function parseNote(md: string): Note {
  const drafts: Draft[] = [];
  const front = FRONT.exec(md);
  let body = 0;
  if (front) {
    const to = front[0].endsWith('\n') ? front[0].length - 1 : front[0].length;
    drafts.push({ kind: 'raw', src: md.slice(0, to), from: 0, to });
    body = to;
  }
  blocksOf(md.slice(body), body, drafts);
  const blocks: Block[] = [];
  let last = 0;
  for (const d of drafts) {
    const { from, to, ...rest } = d;
    const id = newId();
    blocks.push({ ...(rest as Block), id, gap: md.slice(last, from), edited: false, was: { prev: blocks.at(-1)?.id ?? null, kind: rest.kind } });
    last = to;
  }
  return { blocks, tail: md.slice(last) };
}

// ---- Writing blocks back ----

const ORDERED = /^\d{1,9}[.)]$/;

function listPrefix(b: Extract<Block, { kind: 'li' }>): string {
  return `${b.indent}${b.marker} ${b.task === null ? '' : b.task ? '[x] ' : '[ ] '}`;
}

// A block that reads back as one list item, quote, heading..., its text as runs: for checking.
function readOne(md: string, check: (node: Nodes) => Parent | null): Run[] | null {
  const tree = readMarkdown(md);
  if (tree.children.length !== 1) return null;
  const node = check(tree.children[0] as Nodes);
  return node ? runsOfNode(node, md) : null;
}

const indentRest = (text: string, pad: string) => text.split('\n').join(`\n${pad}`);

// The Markdown for a block, written from what's in it.
export function writeBlock(b: Block): string {
  switch (b.kind) {
    case 'p':
      return serializeInline(b.runs).md;
    case 'h': {
      const hashes = `${'#'.repeat(b.level)} `;
      const runs = b.runs.map((r) => ({ ...r, text: r.text.replace(/\n/g, ' ') }));
      const { md } = serializeInline(runs, {
        lineStart: false,
        read: (md) => readOne(hashes + md, (n) => (n.type === 'heading' && n.depth === b.level ? (n as Parent) : null)),
      });
      return (hashes + md).trimEnd();
    }
    case 'li': {
      const prefix = listPrefix(b);
      const pad = ' '.repeat(prefix.length);
      const lead = b.indent.length;
      const { md } = serializeInline(b.runs, {
        read: (md) =>
          readOne(prefix.slice(lead) + indentRest(md, pad.slice(lead)), (n) => {
            if (n.type !== 'list' || n.children.length !== 1) return null;
            const item = n.children[0] as Parent & { checked?: boolean | null };
            if ((item.checked ?? null) !== b.task || item.children.length > 1) return null;
            return item.children.length === 0 ? { type: 'paragraph', children: [] } : item.children[0].type === 'paragraph' ? (item.children[0] as Parent) : null;
          }),
      });
      return (prefix + indentRest(md, pad)).trimEnd();
    }
    case 'quote': {
      const { md } = serializeInline(b.runs, {
        read: (md) =>
          readOne(indentRest(`> ${md}`, '> '), (n) =>
            n.type === 'blockquote' && n.children.length === 1 && n.children[0].type === 'paragraph' ? (n.children[0] as Parent) : null,
          ),
      });
      return indentRest(`> ${md}`, '> ').replace(/> $/gm, '>');
    }
    case 'code': {
      const longest = Math.max(2, ...[...b.code.matchAll(/^[ \t]*(`+|~+)/gm)].map((m) => m[1].length));
      const fence = '`'.repeat(longest + 1);
      return `${fence}${b.lang}\n${b.code}${b.code ? '\n' : ''}${fence}`;
    }
    case 'table': {
      const cells = b.rows.map((row) => row.map((cell) => serializeInline(cell.map((r) => ({ ...r, text: r.text.replace(/\n/g, ' ') })), { table: true, lineStart: false }).md));
      return tableMarkdown(cells, b.align);
    }
    case 'hr':
      return '---';
    case 'raw':
      return b.src;
  }
}

// What goes between two blocks that weren't neighbours as written (or changed kind): a list's
// items stay together; anything else gets a blank line, so nothing runs into the block before.
function gapFor(prev: Block, b: Block): string {
  return prev.kind === 'li' && b.kind === 'li' ? '\n' : '\n\n';
}

const emptyItem = (b: Block) => b.kind === 'li' && b.runs.length === 0;

// An edited paragraph left empty (a line typed and deleted, the blank line the editor keeps at
// the end) isn't written at all.
const blank = (b: Block) => b.edited && b.kind === 'p' && b.runs.every((r) => !('atom' in r) && r.text.trim() === '');

export function serializeNote(note: Note): string {
  let out = '';
  const blocks = note.blocks.filter((b) => !blank(b));
  blocks.forEach((b, i) => {
    const prev = blocks[i - 1];
    if (!prev) out += b.was?.prev === null ? b.gap : '';
    else {
      // Kept as written while the two were neighbours of these kinds; an emptied list item
      // ("-") right under a paragraph would underline it into a heading, so not that.
      const same = b.was?.prev === prev.id && b.was.kind === b.kind && prev.was?.kind === prev.kind;
      out += same && !(emptyItem(b) && prev.kind !== 'li') ? b.gap : gapFor(prev, b);
    }
    out += b.edited ? writeBlock(b) : b.src;
  });
  return out + note.tail;
}

// A block changed: written afresh from now on.
export function touched<B extends Block>(b: B): B {
  return { ...b, edited: true };
}

export { ORDERED };
