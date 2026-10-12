import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import type { Nodes, Parent } from 'mdast';
import { HIGHLIGHTS, remarkMarks } from '../noteMarks';

// The text of one block (a paragraph, a heading, a list item...) as runs: stretches of text
// with the same formatting. The editor shows and edits runs; they're turned back into
// Markdown for the note, and that Markdown is checked to read back as the same runs.

export type Marks = {
  b?: true; // bold
  i?: true; // italic
  s?: true; // strikethrough
  code?: true;
  u?: true; // underline
  hl?: string; // highlight: a colour from HIGHLIGHTS by id, or '#hex' for any other
  link?: string; // a link's destination
};

// An atom is a piece of the note the editor shows but doesn't edit inside: a [[wikilink]], an
// embed, a footnote, raw HTML. It's kept exactly as written.
export type Run = { text: string; m: Marks } | { atom: string; text: string; kind: AtomKind; m: Marks };
export type AtomKind = 'wikilink' | 'embed' | 'image' | 'other';

export const isAtom = (r: Run): r is Extract<Run, { atom: string }> => 'atom' in r;

const parser = unified().use(remarkParse).use(remarkGfm);
const pairMarks = remarkMarks();

const WIKI = /(!?)\[\[([^[\]\n]+)\]\]/g;

function atomOf(src: string, kind: AtomKind, m: Marks): Run {
  if (kind === 'wikilink' || kind === 'embed') {
    const inner = src.replace(/^!?\[\[|\]\]$/g, '');
    const [target, alias] = inner.split('|');
    const name = target.split('#')[0].split('/').pop()!.replace(/\.md$/i, '');
    return { atom: src, kind, text: alias ?? (name || target), m };
  }
  return { atom: src, kind, text: src, m };
}

// Text with any [[wikilinks]] and ![[embeds]] in it made atoms. Only text that's a straight
// copy of the note can hold one: an escaped \[\[ isn't a link.
function pushText(out: Run[], text: string, m: Marks, literal: boolean) {
  if (!literal) {
    if (text) out.push({ text, m });
    return;
  }
  let last = 0;
  for (const match of text.matchAll(WIKI)) {
    if (match.index! > last) out.push({ text: text.slice(last, match.index), m });
    out.push(atomOf(match[0], match[1] ? 'embed' : 'wikilink', m));
    last = match.index! + match[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), m });
}

function slice(md: string, node: Nodes): string | null {
  const s = node.position?.start.offset;
  const e = node.position?.end.offset;
  return s === undefined || e === undefined ? null : md.slice(s, e);
}

function walk(nodes: Nodes[], m: Marks, md: string, out: Run[]) {
  for (const node of nodes) {
    switch (node.type as string) {
      case 'text': {
        const value = (node as { value: string }).value;
        pushText(out, value, m, slice(md, node) === value);
        break;
      }
      case 'noteText': {
        // Text the highlight pass (remarkMarks) rewrapped: it says whether it's a straight copy.
        const p = (node.data as any)?.hProperties;
        const value = ((node as Parent).children as { value: string }[]).map((c) => c.value).join('');
        pushText(out, value, m, p?.dataLin === 1);
        break;
      }
      case 'paragraph':
        walk((node as Parent).children as Nodes[], m, md, out);
        break;
      case 'noteMark': {
        const p = (node.data as any).hProperties;
        let next: Marks;
        if (p.dataK === 'u') next = { ...m, u: true };
        else if (p.dataK === 'b') next = { ...m, b: true };
        else if (p.dataK === 'i') next = { ...m, i: true };
        else if (p.dataK === 's') next = { ...m, s: true };
        else {
          const id = (p.className as string[] | undefined)?.find((c) => c.startsWith('hl-'))?.slice(3);
          const hex = /#[0-9a-f]{3,8}/i.exec(String(p.style ?? ''))?.[0];
          next = { ...m, hl: id ?? hex ?? 'yellow' };
        }
        walk((node as Parent).children as Nodes[], next, md, out);
        break;
      }
      case 'strong':
        walk((node as Parent).children as Nodes[], { ...m, b: true }, md, out);
        break;
      case 'emphasis':
        walk((node as Parent).children as Nodes[], { ...m, i: true }, md, out);
        break;
      case 'delete':
        walk((node as Parent).children as Nodes[], { ...m, s: true }, md, out);
        break;
      case 'inlineCode':
        out.push({ text: (node as { value: string }).value, m: { ...m, code: true } });
        break;
      case 'break':
        out.push({ text: '\n', m });
        break;
      case 'link': {
        const src = slice(md, node) ?? '';
        const link = node as { url: string; title?: string | null; children: Nodes[] };
        // A bare web address (www.x.com, https://x) is a link only as it's read: it stays text.
        if (!src.startsWith('[') && !src.startsWith('<')) walk(link.children, m, md, out);
        else if (link.title || src.startsWith('<')) out.push(atomOf(src, 'other', m));
        else walk(link.children, { ...m, link: link.url }, md, out);
        break;
      }
      case 'image':
        out.push(atomOf(slice(md, node) ?? '', 'image', m));
        break;
      default:
        out.push(atomOf(slice(md, node) ?? '', 'other', m));
    }
  }
}

// The runs inside a node of a note already read (marks paired) from `md`.
export function runsOfNode(node: Parent, md: string): Run[] {
  const out: Run[] = [];
  walk(node.children as Nodes[], {}, md, out);
  return normalize(out);
}

// A note read as Markdown, with highlights and underlines paired up.
export function readMarkdown(md: string): Parent {
  const tree = parser.parse(md) as Parent;
  pairMarks(tree as Nodes, { value: md });
  return tree;
}

// A block's text as runs, or null when it isn't plain running text (it's a heading, a list,
// several paragraphs...): such a block is kept as it was written.
export function parseInline(md: string): Run[] | null {
  if (md.trim() === '') return [];
  const tree = readMarkdown(md);
  if (tree.children.length !== 1 || tree.children[0].type !== 'paragraph') return null;
  return runsOfNode(tree.children[0] as Parent, md);
}

const sameMarks = (a: Marks, b: Marks) =>
  !!a.b === !!b.b && !!a.i === !!b.i && !!a.s === !!b.s && !!a.code === !!b.code && !!a.u === !!b.u && a.hl === b.hl && a.link === b.link;

// Neighbouring runs with the same formatting joined, empty ones dropped.
export function normalize(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const r of runs) {
    if (!isAtom(r) && r.text === '') continue;
    const prev = out[out.length - 1];
    if (prev && !isAtom(prev) && !isAtom(r) && sameMarks(prev.m, r.m)) out[out.length - 1] = { text: prev.text + r.text, m: prev.m };
    else out.push(r);
  }
  return out;
}

export const runsText = (runs: Run[]) => runs.map((r) => r.text).join('');

// ---- Back to Markdown ----

const ESCAPE_ALL = /[!-/:-@[-`{-~]/g; // every ASCII punctuation mark

// Literal text, escaped wherever it would otherwise read as formatting.
function escapeText(text: string, all: boolean, inTable: boolean): string {
  if (all) return text.replace(ESCAPE_ALL, (c) => `\\${c}`);
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const prev = text[i - 1] ?? ' ';
    const next = text[i + 1] ?? ' ';
    if (c === '\\' || c === '*' || c === '`' || c === '~' || c === '[') out += `\\${c}`;
    else if (c === '_') out += /\w/.test(prev) && /\w/.test(next) ? c : '\\_';
    else if (c === '<') out += /[A-Za-z/!?]/.test(next) ? '\\<' : c;
    else if (c === '=') out += prev === '=' || next === '=' ? '\\=' : c;
    else if (c === '&') out += /^#?[A-Za-z0-9]+;/.test(text.slice(i + 1)) ? '\\&' : c;
    else if (c === '|' && inTable) out += '\\|';
    else out += c;
  }
  return out;
}

// A line of running text mustn't start like a block (a heading, a list, a quote, a fence...).
function escapeLineStart(line: string): string {
  if (/^(#{1,6}(?=[ \t]|$)|>|[-+*](?=[ \t]|$)|(=+|-+)[ \t]*$|`{3,}|~{3,}|\||\[\^|\$\$)/.test(line)) return `\\${line}`;
  const n = /^(\d{1,9})([.)])(?=[ \t]|$)/.exec(line);
  return n ? `${n[1]}\\${line.slice(n[1].length)}` : line;
}

function codeSpan(text: string): string {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = '`'.repeat(longest + 1);
  const pad = text.startsWith('`') || text.endsWith('`') || (text.startsWith(' ') && text.endsWith(' ') && text.trim() !== '') ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
}

const highlightHex = (hl: string) => (hl.startsWith('#') ? hl : HIGHLIGHTS.find((h) => h.id === hl)?.hex ?? hl);

// A run's formatting as keys; the order breaks ties when choosing which mark goes outside.
const ORDER = ['link', 'hl', 'u', 'b', 'i', 's'] as const;
function keysOf(r: Run): string[] {
  const m = r.m;
  const keys: string[] = [];
  if (m.link !== undefined) keys.push(`link\u0000${m.link}`);
  if (m.hl !== undefined) keys.push(`hl\u0000${m.hl}`);
  if (m.u) keys.push('u');
  if (m.b) keys.push('b');
  if (m.i) keys.push('i');
  if (m.s) keys.push('s');
  return keys;
}
const rank = (k: string) => ORDER.indexOf(k.split('\u0000')[0] as (typeof ORDER)[number]);

// Bold, italic, strikethrough and ==highlight== are delimiters that only work hugging text;
// spaces at a run's edges lose them unless they sit inside the stretch (between two runs that
// both have them). The spaces still show; bold or italic on a space never did.
const DELIMITED = (k: string) => k === 'b' || k === 'i' || k === 's' || k === 'hl\u0000yellow';
function prepare(input: Run[]): Run[] {
  const split: Run[] = [];
  for (const r of normalize(input)) {
    if (isAtom(r) || r.m.code) {
      split.push(r);
      continue;
    }
    const lead = /^\s*/.exec(r.text)![0];
    const trail = r.text.length > lead.length ? /\s*$/.exec(r.text)![0] : '';
    const core = r.text.slice(lead.length, r.text.length - trail.length);
    if (lead) split.push({ text: lead, m: r.m });
    if (core) split.push({ text: core, m: r.m });
    if (trail) split.push({ text: trail, m: r.m });
  }
  const has = (r: Run | undefined, k: string) => !!r && keysOf(r).includes(k);
  const out = split.map((r, i) => {
    if (isAtom(r) || r.m.code || r.text.trim() !== '') return r;
    const m: Marks = { ...r.m };
    for (const k of keysOf(r).filter(DELIMITED)) {
      if (has(split[i - 1], k) && has(split[i + 1], k)) continue;
      if (k === 'hl\u0000yellow') delete m.hl;
      else delete m[k as 'b' | 'i' | 's'];
    }
    return { text: r.text, m };
  });
  return normalize(out);
}

type Mode = { tags: boolean; all: boolean; table: boolean };

function opener(k: string, mode: Mode): string {
  const [kind, v] = k.split('\u0000');
  if (kind === 'link') return '[';
  if (kind === 'hl') return v === 'yellow' ? (mode.tags ? '<mark>' : '==') : `<mark style="background: ${highlightHex(v)}">`;
  if (kind === 'u') return '<u>';
  return mode.tags ? `<${kind}>` : { b: '**', i: '*', s: '~~' }[kind as 'b' | 'i' | 's'];
}

function closer(k: string, mode: Mode): string {
  const [kind, v] = k.split('\u0000');
  if (kind === 'link') return `](${/[\s()<>]/.test(v) ? `<${v}>` : v})`;
  if (kind === 'hl') return v === 'yellow' && !mode.tags ? '==' : '</mark>';
  if (kind === 'u') return '</u>';
  return mode.tags ? `</${kind}>` : { b: '**', i: '*', s: '~~' }[kind as 'b' | 'i' | 's'];
}

// Formatting opens and closes like a stack: at each run, what stops is closed (and anything
// opened inside it), and what starts is opened, the longest-running outermost.
function emit(runs: Run[], mode: Mode): string {
  const stack: string[] = [];
  let out = '';
  const reach = (k: string, i: number) => {
    let j = i;
    while (j < runs.length && keysOf(runs[j]).includes(k)) j++;
    return j - i;
  };
  runs.forEach((r, i) => {
    const want = keysOf(r);
    let keep = 0;
    while (keep < stack.length && want.includes(stack[keep])) keep++;
    for (let k = stack.length - 1; k >= keep; k--) out += closer(stack[k], mode);
    stack.length = keep;
    const opening = want.filter((k) => !stack.includes(k)).sort((a, b) => reach(b, i) - reach(a, i) || rank(a) - rank(b));
    for (const k of opening) {
      out += opener(k, mode);
      stack.push(k);
    }
    out += isAtom(r) ? r.atom : r.m.code ? codeSpan(r.text) : escapeText(r.text, mode.all, mode.table);
  });
  for (let k = stack.length - 1; k >= 0; k--) out += closer(stack[k], mode);
  return out;
}

// lineStart false: the text follows something on its line (a heading's #), so its start can't
// be read as a block. table: it's in a table cell. read: how to read it back, when it isn't
// read as a paragraph of its own.
export type InlineOptions = { lineStart?: boolean; table?: boolean; read?: (md: string) => Run[] | null };

function render(runs: Run[], mode: Mode, opts: InlineOptions): string {
  // Line ends: no trailing spaces (two would be a line break) or leading ones (ignored anyway).
  const lines = emit(runs, mode).split('\n').map((l) => l.trim());
  return lines.map((l, i) => (opts.lineStart === false && i === 0 ? l : escapeLineStart(l))).join('\n');
}

// Runs made comparable: spaces around line ends and at the edges don't count.
function comparable(runs: Run[]): string {
  const flat = normalize(runs.map((r) => (isAtom(r) ? r : { text: r.text.replace(/\r\n?/g, '\n').replace(/[ \t]*\n[ \t]*/g, '\n'), m: r.m })));
  if (flat.length && !isAtom(flat[0])) flat[0] = { text: flat[0].text.replace(/^\s+/, ''), m: flat[0].m };
  const last = flat.length - 1;
  if (last >= 0 && !isAtom(flat[last])) flat[last] = { text: flat[last].text.replace(/\s+$/, ''), m: flat[last].m };
  return JSON.stringify(normalize(flat).map((r) => [isAtom(r) ? `@${r.atom}` : r.text, keysOf(r).sort().join(','), !isAtom(r) && r.m.code ? 1 : 0]));
}

// A key that's equal for runs that mean the same once written (spacing at the edges, bold
// spaces and the way runs are cut up don't count).
export const runsKey = (runs: Run[]) => comparable(prepare(runs));

// The runs as Markdown, proven to read back as the same runs: plain Markdown, escaped as
// lightly as works; else every punctuation mark escaped; else bold, italic and strikethrough
// written as tags. `ok` is false only if none of those reads back.
export function serializeInline(runs: Run[], opts: InlineOptions = {}): { md: string; ok: boolean } {
  const prepared = prepare(runs);
  const want = comparable(prepared);
  const read = opts.read ?? parseInline;
  const table = !!opts.table;
  let md = '';
  for (const mode of [
    { tags: false, all: false, table },
    { tags: false, all: true, table },
    { tags: true, all: false, table },
    { tags: true, all: true, table },
  ]) {
    md = render(prepared, mode, opts);
    const back = read(md);
    if (back !== null && comparable(back) === want) return { md, ok: true };
  }
  return { md, ok: false };
}
