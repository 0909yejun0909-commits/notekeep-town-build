import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import type { Nodes, Parent } from 'mdast';
import { markTag, PHRASING_PARENTS, remarkMarks, type Range } from './noteMarks';

// The note editor shows a note without its highlight and underline tags (<mark ...>, <u>):
// they're drawn as colour behind the words instead. Everything else, Markdown included, shows
// as written. The tags stay in the note itself; edits to the shown text are carried over to
// it here, leaving every tag where it was.

export type Run = { text: string; hl?: string; hex?: string; u?: boolean };

export type Layout = {
  raw: string;
  hidden: Range[]; // the tags, in the note: never shown
  visible: string; // what the editor shows
  pos: number[]; // where each shown character is in the note
  marks: { kind: 'hl' | 'u'; start: number; end: number; hl?: string; hex?: string }[]; // shown text marked, in the note
};

const parser = unified().use(remarkParse).use(remarkGfm);
const applyMarks = remarkMarks();

// The same tags the note never shows as text (lib/noteMarks.ts tokenize()): inline HTML in
// running text. A tag on a line of its own is a block of HTML, not a mark, and stays shown.
function collectTags(node: Nodes, out: Range[]) {
  if (!('children' in node)) return;
  const parent = node as Parent;
  for (const child of parent.children as Nodes[]) {
    const s = child.position?.start.offset;
    const e = child.position?.end.offset;
    if (child.type === 'html' && PHRASING_PARENTS.has(parent.type) && markTag(child.value) && s !== undefined && e !== undefined) {
      out.push({ start: s, end: e });
    }
    collectTags(child, out);
  }
}

function collectMarks(node: Nodes, out: Layout['marks']) {
  if (!('children' in node)) return;
  for (const child of (node as Parent).children as Nodes[]) {
    if ((child.type as string) === 'noteMark') {
      const p = (child.data as any).hProperties;
      const hl = (p.className as string[] | undefined)?.find((c) => c.startsWith('hl-'))?.slice(3);
      const hex = /#[0-9a-f]{3,8}/i.exec(String(p.style ?? ''))?.[0];
      out.push({ kind: p.dataK, start: p.dataOe, end: p.dataCs, hl, hex });
    }
    collectMarks(child, out);
  }
}

let last: Layout | null = null;

export function layoutOf(raw: string): Layout {
  if (last?.raw === raw) return last;
  const tree = parser.parse(raw) as Nodes;
  const hidden: Range[] = [];
  collectTags(tree, hidden);
  hidden.sort((a, b) => a.start - b.start);
  applyMarks(tree, { value: raw });
  const marks: Layout['marks'] = [];
  collectMarks(tree, marks);
  const chars: string[] = [];
  const pos: number[] = [];
  for (let r = 0, h = 0; r < raw.length; ) {
    if (h < hidden.length && hidden[h].start === r) {
      r = hidden[h++].end;
      continue;
    }
    chars.push(raw[r]);
    pos.push(r);
    r++;
  }
  last = { raw, hidden, visible: chars.join(''), pos, marks };
  return last;
}

// How many shown characters come before `rawPos` in the note.
export function toVisible(layout: Layout, rawPos: number): number {
  let lo = 0;
  let hi = layout.pos.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (layout.pos[mid] < rawPos) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// The note's text behind shown characters [a, b): from the first to just after the last.
export function toRaw(layout: Layout, a: number, b: number): Range {
  return {
    start: a < layout.pos.length ? layout.pos[a] : layout.raw.length,
    end: b > 0 ? layout.pos[Math.min(b, layout.pos.length) - 1] + 1 : 0,
  };
}

const closes = { u: '/u', mark: '/mark' } as const;

// A tag pair left with nothing between (its text deleted) goes too; not one whose tags take
// in `typed`, though (in `raw`): that's a tag being typed by hand.
function dropEmptyPairs(raw: string, typed: Range): { raw: string; removed: Range[] } {
  const removed: Range[] = [];
  let text = raw;
  for (;;) {
    const { hidden } = layoutOf(text);
    const ta = afterRemoval(typed.start, removed);
    const tb = afterRemoval(typed.end, removed);
    const gone: Range[] = [];
    for (let i = 0; i + 1 < hidden.length; i++) {
      const open = markTag(text.slice(hidden[i].start, hidden[i].end));
      const close = markTag(text.slice(hidden[i + 1].start, hidden[i + 1].end));
      const handTyped = ta < tb && hidden[i].start < tb && hidden[i + 1].end > ta;
      if ((open === 'u' || open === 'mark') && close === closes[open] && hidden[i].end === hidden[i + 1].start && !handTyped) {
        gone.push({ start: hidden[i].start, end: hidden[i + 1].end });
        i++;
      }
    }
    if (gone.length === 0) return { raw: text, removed };
    let out = '';
    let at = 0;
    for (const g of gone) {
      out += text.slice(at, g.start);
      at = g.end;
    }
    text = out + text.slice(at);
    // Recorded against the original text, so positions in it can be carried through. A pair
    // emptied by removing one inside it covers that one, so the two merge.
    const before = [...removed];
    for (const g of gone) removed.push(mapRange(g, before));
    removed.sort((x, y) => x.start - y.start);
    for (let i = 1; i < removed.length; i++) {
      if (removed[i].start <= removed[i - 1].end) {
        removed[i - 1] = { start: removed[i - 1].start, end: Math.max(removed[i - 1].end, removed[i].end) };
        removed.splice(i--, 1);
      }
    }
  }
}

// A range in text that already had `removed` taken out, as a range in the text before that.
function mapRange(r: Range, removed: Range[]): Range {
  let start = r.start;
  let end = r.end;
  for (const g of removed) {
    const len = g.end - g.start;
    if (g.start <= start) {
      start += len;
      end += len;
    } else if (g.start < end) end += len;
  }
  return { start, end };
}

function afterRemoval(pos: number, removed: Range[]): number {
  let shift = 0;
  for (const g of removed) {
    if (g.end <= pos) shift += g.end - g.start;
    else if (g.start < pos) shift += pos - g.start;
  }
  return pos - shift;
}

// The editor's text went from layoutOf(raw).visible to `next`, with the caret or selection
// now at [selStart, selEnd]. Returns the note with the same change made, where the selection
// is in what the editor will show for it, and where the caret is in the note itself.
// Typed text goes where the caret was left in the note (`caret`, from the last edit), so
// typing carries on inside or outside a mark as it was; a caret moved since goes after the
// character before it, taking its marks. Text typed over a selection takes the marks of the
// selection's first character.
export function editVisible(
  raw: string,
  next: string,
  selStart: number,
  selEnd: number,
  caret: number | null = null,
): { raw: string; sel: [number, number]; caret: number | null } {
  const layout = layoutOf(raw);
  const old = layout.visible;
  if (next === old) return { raw, sel: [selStart, selEnd], caret };
  // What changed: the caret sits at the end of what was typed, which settles where the
  // change is when the same letter repeats ("ab" -> "abb").
  let s = 0;
  while (s < old.length && s < next.length - selEnd && old[old.length - 1 - s] === next[next.length - 1 - s]) s++;
  let a = 0;
  while (a < old.length - s && a < next.length - s && old[a] === next[a]) a++;
  const b = old.length - s;
  const ins = next.slice(a, next.length - s);
  const { pos } = layout;
  const kept = caret !== null && a === b && caret <= raw.length && toVisible(layout, caret) === a;
  const at = kept ? caret! : a < b ? pos[a] : a === 0 ? 0 : pos[a - 1] + 1;

  // Rebuilt from the note: shown characters [a, b) out, `ins` in, every tag kept. `shown`
  // tracks where each of the editor's characters lands.
  let out = '';
  const shown: number[] = [];
  let vi = 0;
  for (let r = 0; r <= raw.length; r++) {
    if (r === at) {
      for (let k = 0; k < ins.length; k++) shown.push(out.length + k);
      out += ins;
    }
    if (r === raw.length) break;
    if (vi < pos.length && pos[vi] === r) {
      const deleted = vi >= a && vi < b;
      vi++;
      if (deleted) continue;
      shown.push(out.length);
    }
    out += raw[r];
  }

  const { raw: result, removed } = dropEmptyPairs(out, { start: at, end: at + ins.length });
  const after = layoutOf(result);
  const place = (v: number) => toVisible(after, afterRemoval(v < shown.length ? shown[v] : out.length, removed));
  // The caret sits after what was typed (or where text was deleted), when that's where the
  // editor shows it.
  const end = afterRemoval(at + ins.length, removed);
  const sel: [number, number] = [place(selStart), place(selEnd)];
  return { raw: result, sel, caret: sel[0] === sel[1] && toVisible(after, end) === sel[0] ? end : null };
}

// The shown text cut into runs of the same marks, for the colour drawn behind the editor.
export function runsOf(layout: Layout): Run[] {
  const marks = layout.marks.map((m) => ({ ...m, a: toVisible(layout, m.start), b: toVisible(layout, m.end) }));
  const cuts = new Set([0, layout.visible.length]);
  for (const m of marks) cuts.add(m.a).add(m.b);
  const points = [...cuts].filter((c) => c >= 0 && c <= layout.visible.length).sort((x, y) => x - y);
  const runs: Run[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const [a, b] = [points[i], points[i + 1]];
    if (a === b) continue;
    const over = marks.filter((m) => m.a <= a && b <= m.b);
    // The innermost highlight wins: the one that starts last.
    const hl = over.filter((m) => m.kind === 'hl').sort((x, y) => x.a - y.a).pop();
    runs.push({ text: layout.visible.slice(a, b), hl: hl?.hl, hex: hl && !hl.hl ? hl.hex : undefined, u: over.some((m) => m.kind === 'u') });
  }
  return runs;
}
