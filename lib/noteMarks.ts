import type { Html, InlineCode, Nodes, Parent, PhrasingContent, Text } from 'mdast';

// Highlights and underlines, stored the way Obsidian reads them: yellow is ==text==, other
// colours are <mark style="background: #hex">, underline is <u>. Nothing else in raw HTML renders.

export type HighlightId = 'yellow' | 'green' | 'blue' | 'pink' | 'orange';

export const HIGHLIGHTS: { id: HighlightId; hex: string; label: string }[] = [
  { id: 'yellow', hex: '#fde68a', label: 'Yellow' },
  { id: 'green', hex: '#bbf7d0', label: 'Green' },
  { id: 'blue', hex: '#bfdbfe', label: 'Blue' },
  { id: 'pink', hex: '#fbcfe8', label: 'Pink' },
  { id: 'orange', hex: '#fed7aa', label: 'Orange' },
];

export type MarkStyle = { kind: 'hl'; color: HighlightId } | { kind: 'u' };
export type Range = { start: number; end: number };
export type ExistingMark = { kind: 'hl' | 'u'; open: Range; close: Range };
// A run of rendered text and where it came from. Linear pieces are character-for-character
// copies of the source; anything else (escapes, inline code, wikilinks) can only be taken whole.
export type Piece = { s: number; e: number; lin: boolean };
export type SelectedPiece = Piece & { from: number; to: number };

// ---- Source maps for the string rewrites the reader does before rendering ----

type Edit = { ns: number; ne: number; os: number; oe: number };

export type SourceMap = {
  text: string;
  toSource(offset: number, side: 'start' | 'end'): number;
  toSourcePiece(p: Piece): Piece;
};

function makeMap(text: string, edits: Edit[], parent: SourceMap | null): SourceMap {
  const local = (o: number, side: 'start' | 'end') => {
    let delta = 0;
    for (const ed of edits) {
      if (o <= ed.ns) break;
      if (o < ed.ne) return side === 'start' ? ed.os : ed.oe;
      delta = ed.oe - ed.ne;
    }
    return o + delta;
  };
  const toSource = (o: number, side: 'start' | 'end') => {
    const here = local(o, side);
    return parent ? parent.toSource(here, side) : here;
  };
  return {
    text,
    toSource,
    toSourcePiece(p) {
      const s = toSource(p.s, 'start');
      const e = toSource(p.e, 'end');
      return { s, e, lin: p.lin && e - s === p.e - p.s };
    },
  };
}

export function trackedReplace(
  input: string | SourceMap,
  re: RegExp,
  fn: (m: RegExpExecArray) => string,
): SourceMap {
  const parent = typeof input === 'string' ? null : input;
  const src = typeof input === 'string' ? input : input.text;
  const edits: Edit[] = [];
  let out = '';
  let last = 0;
  re.lastIndex = 0;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    if (m[0] === '') {
      re.lastIndex++;
      continue;
    }
    const rep = fn(m);
    if (rep === m[0]) continue;
    out += src.slice(last, m.index);
    edits.push({ ns: out.length, ne: out.length + rep.length, os: m.index, oe: m.index + m[0].length });
    out += rep;
    last = m.index + m[0].length;
  }
  out += src.slice(last);
  return makeMap(out, edits, parent);
}

// ---- Rendering: a remark plugin that turns the tokens into <mark>/<u> ----

const PHRASING_PARENTS = new Set(['paragraph', 'heading', 'tableCell', 'emphasis', 'strong', 'delete', 'link', 'noteMark']);
const OPEN_MARK = /^<mark(?:\s+style\s*=\s*"([^"]*)")?\s*>$/i;
const HEX = /background(?:-color)?\s*:\s*(#[0-9a-f]{3,8})\b/i;

type Tok =
  | { t: 'node'; node: PhrasingContent }
  | { t: 'text'; value: string; s: number; e: number; lin: boolean }
  | { t: 'eq'; s: number; e: number; canOpen: boolean; canClose: boolean }
  | { t: 'open'; tag: 'u' | 'mark'; s: number; e: number; hex?: string }
  | { t: 'close'; tag: 'u' | 'mark'; s: number; e: number };

type Frame = { open: Extract<Tok, { t: 'eq' | 'open' }> | null; children: PhrasingContent[] };

function textNode(value: string, s: number, e: number, lin: boolean): PhrasingContent {
  return {
    type: 'noteText',
    data: { hName: 'span', hProperties: { dataS: s, dataE: e, dataLin: lin ? 1 : 0 } },
    children: [{ type: 'text', value }],
  } as unknown as PhrasingContent;
}

function splitText(node: Text, src: string): Tok[] {
  const s = node.position?.start.offset;
  const e = node.position?.end.offset;
  if (s === undefined || e === undefined) return [{ t: 'node', node }];
  const value = node.value;
  const lin = src.slice(s, e) === value;
  const toks: Tok[] = [];
  const eqs = [...value.matchAll(/(?<!=)==(?!=)/g)].map((m) => m.index!);
  // In a text that isn't a straight copy of its source, == can only be placed if the source
  // has exactly as many of them.
  const srcEqs = lin ? eqs.map((i) => s + i) : [...src.slice(s, e).matchAll(/(?<!=)==(?!=)/g)].map((m) => s + m.index!);
  const usable = srcEqs.length === eqs.length;
  let last = 0;
  let lastSrc = s;
  eqs.forEach((i, k) => {
    if (!usable) return;
    const before = i === 0 ? '' : value[i - 1];
    const after = i + 2 >= value.length ? '' : value[i + 2];
    if (i > last) toks.push({ t: 'text', value: value.slice(last, i), s: lin ? s + last : lastSrc, e: lin ? s + i : srcEqs[k], lin });
    toks.push({ t: 'eq', s: srcEqs[k], e: srcEqs[k] + 2, canOpen: !/\s/.test(after), canClose: !/\s/.test(before) });
    last = i + 2;
    lastSrc = srcEqs[k] + 2;
  });
  if (last < value.length || toks.length === 0) {
    toks.push({ t: 'text', value: value.slice(last), s: lin ? s + last : lastSrc, e, lin });
  }
  return toks;
}

function tokenize(node: PhrasingContent, src: string): Tok[] {
  if (node.type === 'text') return splitText(node, src);
  if (node.type === 'html') {
    const h = node as Html;
    const s = h.position?.start.offset;
    const e = h.position?.end.offset;
    if (s === undefined || e === undefined) return [{ t: 'node', node }];
    const v = h.value.trim();
    if (/^<u>$/i.test(v)) return [{ t: 'open', tag: 'u', s, e }];
    if (/^<\/u>$/i.test(v)) return [{ t: 'close', tag: 'u', s, e }];
    if (/^<\/mark>$/i.test(v)) return [{ t: 'close', tag: 'mark', s, e }];
    const m = OPEN_MARK.exec(v);
    if (m) return [{ t: 'open', tag: 'mark', s, e, hex: m[1] ? HEX.exec(m[1])?.[1] : undefined }];
  }
  if (node.type === 'inlineCode') {
    const c = node as InlineCode;
    const s = c.position?.start.offset;
    const e = c.position?.end.offset;
    if (s !== undefined && e !== undefined) c.data = { ...c.data, hProperties: { dataS: s, dataE: e, dataLin: 0 } } as InlineCode['data'];
  }
  return [{ t: 'node', node }];
}

function markNode(open: Extract<Tok, { t: 'eq' | 'open' }>, close: { s: number; e: number }, children: PhrasingContent[]): PhrasingContent {
  const pos = { dataOs: open.s, dataOe: open.e, dataCs: close.s, dataCe: close.e };
  if (open.t === 'open' && open.tag === 'u') {
    return { type: 'noteMark', data: { hName: 'u', hProperties: { dataK: 'u', ...pos } }, children } as unknown as PhrasingContent;
  }
  const hex = open.t === 'open' ? open.hex : undefined;
  const known = hex ? HIGHLIGHTS.find((h) => h.hex.toLowerCase() === hex.toLowerCase()) : HIGHLIGHTS[0];
  const props = known ? { className: ['hl', `hl-${known.id}`] } : { className: ['hl'], style: `background-color: ${hex}` };
  return {
    type: 'noteMark',
    data: { hName: 'mark', hProperties: { ...props, dataK: 'hl', ...pos } },
    children,
  } as unknown as PhrasingContent;
}

function literal(f: Frame): PhrasingContent[] {
  // An unclosed == shows as written; an unclosed tag disappears, as raw HTML always has here.
  const o = f.open!;
  return o.t === 'eq' ? [textNode('==', o.s, o.e, true), ...f.children] : f.children;
}

function pairUp(children: PhrasingContent[], src: string): PhrasingContent[] {
  const stack: Frame[] = [{ open: null, children: [] }];
  const top = () => stack[stack.length - 1];
  const closeTop = (close: { s: number; e: number }) => {
    const f = stack.pop()!;
    top().children.push(markNode(f.open!, close, f.children));
  };
  for (const tok of children.flatMap((c) => tokenize(c, src))) {
    if (tok.t === 'node') top().children.push(tok.node);
    else if (tok.t === 'text') top().children.push(textNode(tok.value, tok.s, tok.e, tok.lin));
    else if (tok.t === 'eq') {
      if (top().open?.t === 'eq' && tok.canClose) closeTop(tok);
      else if (tok.canOpen) stack.push({ open: tok, children: [] });
      else top().children.push(textNode('==', tok.s, tok.e, true));
    } else if (tok.t === 'open') stack.push({ open: tok, children: [] });
    else {
      const at = stack.findLastIndex((f) => f.open?.t === 'open' && f.open.tag === tok.tag);
      if (at < 1) continue;
      while (stack.length - 1 > at) {
        const f = stack.pop()!;
        top().children.push(...literal(f));
      }
      closeTop(tok);
    }
  }
  while (stack.length > 1) {
    const f = stack.pop()!;
    top().children.push(...literal(f));
  }
  return stack[0].children;
}

function walk(node: Nodes, src: string) {
  if (!('children' in node)) return;
  const parent = node as Parent;
  if (PHRASING_PARENTS.has(parent.type)) parent.children = pairUp(parent.children as PhrasingContent[], src);
  for (const child of parent.children) walk(child as Nodes, src);
}

export function remarkMarks() {
  return (tree: Nodes, file: { value?: unknown }) => {
    walk(tree, String(file.value ?? ''));
  };
}

// ---- Turning a selection into source ranges ----

export function piecesInRange(pieces: Piece[], a: number, b: number): SelectedPiece[] {
  const out: SelectedPiece[] = [];
  for (const p of pieces) {
    if (p.e <= a || p.s >= b) continue;
    if (p.lin) out.push({ ...p, from: Math.max(0, a - p.s), to: Math.min(p.e, b) - p.s });
    else out.push({ ...p, from: 0, to: p.e - p.s });
  }
  return out;
}

const gapJoins = (raw: string, a: number, b: number) => b <= a || /^[ \t]*$/.test(raw.slice(a, b));

function mergeRanges(raw: string, ranges: Range[]): Range[] {
  const sorted = [...ranges].sort((x, y) => x.start - y.start);
  const out: Range[] = [];
  for (const r of sorted) {
    const prev = out[out.length - 1];
    if (prev && gapJoins(raw, prev.end, r.start)) prev.end = Math.max(prev.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

export function selectSegments(raw: string, pieces: SelectedPiece[]): Range[] {
  const ranges: Range[] = [];
  for (const p of pieces) {
    if (p.to <= p.from) continue;
    let start = p.lin ? p.s + p.from : p.s;
    let end = p.lin ? p.s + p.to : p.e;
    while (start < end && /\s/.test(raw[start])) start++;
    while (end > start && /\s/.test(raw[end - 1])) end--;
    if (end > start) ranges.push({ start, end });
  }
  return mergeRanges(raw, ranges);
}

// ---- Rewriting the source ----

export type MarkEdit = { text: string; map(pos: number, side: 'start' | 'end'): number };

type Insert = { at: number; text: string; close: boolean };

function rewrite(raw: string, deletes: Range[], inserts: Insert[]): MarkEdit {
  const dels = [...deletes].sort((a, b) => a.start - b.start);
  const ins = [...inserts].sort((a, b) => a.at - b.at || Number(b.close) - Number(a.close));
  let out = '';
  let i = 0;
  let d = 0;
  for (let pos = 0; pos <= raw.length; pos++) {
    while (i < ins.length && ins[i].at === pos) out += ins[i++].text;
    if (pos === raw.length) break;
    while (d < dels.length && dels[d].end <= pos) d++;
    if (d < dels.length && dels[d].start <= pos) continue;
    out += raw[pos];
  }
  return {
    text: out,
    map(pos, side) {
      let shift = 0;
      for (const n of ins) if (n.at < pos || (n.at === pos && side === 'start')) shift += n.text.length;
      for (const r of dels) shift -= Math.max(0, Math.min(r.end, pos) - r.start);
      return pos + shift;
    },
  };
}

const tokensOf = (m: ExistingMark) => [m.open, m.close];
const contentOverlaps = (r: Range, m: ExistingMark) => r.start < m.close.start && r.end > m.open.end;
const touches = (r: Range, m: ExistingMark) => r.start <= m.close.end && r.end >= m.open.start;

function tokensFor(style: MarkStyle): [string, string] {
  if (style.kind === 'u') return ['<u>', '</u>'];
  if (style.color === 'yellow') return ['==', '=='];
  return [`<mark style="background: ${HIGHLIGHTS.find((h) => h.id === style.color)!.hex}">`, '</mark>'];
}

// Wraps each segment. A segment that meets a mark of the same kind swallows it, so
// highlighting inside a highlight recolours it and extending one doesn't nest.
export function addMark(raw: string, segments: Range[], style: MarkStyle, existing: ExistingMark[]): MarkEdit {
  const same = existing.filter((m) => m.kind === style.kind);
  const consumed = new Set<ExistingMark>();
  let segs = segments.map((s) => ({ ...s }));
  for (let changed = true; changed; ) {
    changed = false;
    for (const seg of segs) {
      for (const m of same) {
        if (consumed.has(m) || !touches(seg, m)) continue;
        consumed.add(m);
        seg.start = Math.min(seg.start, m.open.start);
        seg.end = Math.max(seg.end, m.close.end);
        changed = true;
      }
    }
    segs = mergeRanges(raw, segs);
  }
  const [open, close] = tokensFor(style);
  return rewrite(
    raw,
    [...consumed].flatMap(tokensOf),
    segs.flatMap((s) => [
      { at: s.start, text: open, close: false },
      { at: s.end, text: close, close: true },
    ]),
  );
}

export function toggleUnderline(raw: string, segments: Range[], existing: ExistingMark[]): MarkEdit {
  const us = existing.filter((m) => m.kind === 'u');
  const holders = segments.map((s) => us.find((m) => m.open.end <= s.start && s.end <= m.close.start));
  if (segments.length > 0 && holders.every(Boolean)) return rewrite(raw, [...new Set(holders)].flatMap((m) => tokensOf(m!)), []);
  return addMark(raw, segments, { kind: 'u' }, existing);
}

export function clearMarks(raw: string, segments: Range[], existing: ExistingMark[]): MarkEdit {
  const hit = existing.filter((m) => segments.some((s) => contentOverlaps(s, m)));
  return rewrite(raw, hit.flatMap(tokensOf), []);
}
