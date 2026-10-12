import { isAtom, normalize, type Marks, type Run } from './inline';

// Editing runs by position. A position counts characters as the editor shows them: each
// character of text is one, and so is each atom (a link chip, an embed).

export const ATOM_CHAR = '￼';

export const lengthOf = (r: Run) => (isAtom(r) ? 1 : r.text.length);
export const runsLength = (runs: Run[]) => runs.reduce((n, r) => n + lengthOf(r), 0);

// The runs' text as the editor shows it, an atom as one placeholder character.
export const visibleText = (runs: Run[]) => runs.map((r) => (isAtom(r) ? ATOM_CHAR : r.text)).join('');

export function splitRuns(runs: Run[], at: number): [Run[], Run[]] {
  const left: Run[] = [];
  const right: Run[] = [];
  let pos = 0;
  for (const r of runs) {
    const len = lengthOf(r);
    if (pos + len <= at) left.push(r);
    else if (pos >= at) right.push(r);
    else if (!isAtom(r)) {
      left.push({ text: r.text.slice(0, at - pos), m: r.m });
      right.push({ text: r.text.slice(at - pos), m: r.m });
    }
    pos += len;
  }
  return [normalize(left), normalize(right)];
}

export function sliceRuns(runs: Run[], a: number, b: number): Run[] {
  return splitRuns(splitRuns(runs, b)[0], a)[1];
}

export function deleteRange(runs: Run[], a: number, b: number): Run[] {
  const [left] = splitRuns(runs, a);
  const [, right] = splitRuns(runs, b);
  return normalize([...left, ...right]);
}

export function insertRuns(runs: Run[], at: number, ins: Run[]): Run[] {
  const [left, right] = splitRuns(runs, at);
  return normalize([...left, ...ins, ...right]);
}

// The formatting typing at `at` takes on: the character before it's, or at the very start the
// one after. Never a link: typing next to a link isn't more link.
export function marksAt(runs: Run[], at: number): Marks {
  let pos = 0;
  for (const r of runs) {
    const len = lengthOf(r);
    if ((at > pos && at <= pos + len) || (at === 0 && pos === 0)) {
      const { link, ...rest } = r.m;
      void link;
      return rest;
    }
    pos += len;
  }
  return {};
}

// Every character in [a, b) passes `test`; false for an empty range.
export function everyChar(runs: Run[], a: number, b: number, test: (m: Marks) => boolean): boolean {
  const inside = sliceRuns(runs, a, b).filter((r) => !isAtom(r));
  return inside.length > 0 && inside.every((r) => test(r.m));
}

// [a, b) with its formatting changed by `change`.
export function restyle(runs: Run[], a: number, b: number, change: (m: Marks) => Marks): Run[] {
  const [left, rest] = splitRuns(runs, a);
  const [mid, right] = splitRuns(rest, b - a);
  return normalize([...left, ...mid.map((r) => ({ ...r, m: change(r.m) })), ...right]);
}

export type Toggle = 'b' | 'i' | 's' | 'u' | 'code';

// Bold (italic, ...) on for all of [a, b), or off if it's all on already.
export function toggleMark(runs: Run[], a: number, b: number, mark: Toggle): Run[] {
  const on = everyChar(runs, a, b, (m) => !!m[mark]);
  return restyle(runs, a, b, (m) => {
    const next = { ...m };
    if (on) delete next[mark];
    else next[mark] = true;
    return next;
  });
}

// A highlight colour on [a, b); the same colour again takes it off.
export function highlight(runs: Run[], a: number, b: number, color: string): Run[] {
  const same = everyChar(runs, a, b, (m) => m.hl === color);
  return restyle(runs, a, b, (m) => {
    const next = { ...m };
    if (same) delete next.hl;
    else next.hl = color;
    return next;
  });
}

// Highlights, underline, bold, italic and strikethrough off [a, b); links and code stay.
export function clearMarks(runs: Run[], a: number, b: number): Run[] {
  return restyle(runs, a, b, (m) => {
    const next = { ...m };
    delete next.hl;
    delete next.u;
    delete next.b;
    delete next.i;
    delete next.s;
    return next;
  });
}

// Markdown shortcuts as you type, Notion style: a closing delimiter typed just before the caret
// formats what it closes and the delimiters go. Returns the new runs and caret, or null.
const INLINE_RULES: { re: RegExp; delim: number; apply: (m: Marks) => Marks }[] = [
  { re: /\*\*([^*\s￼](?:[^*￼]*[^*\s￼])?)\*\*$/, delim: 2, apply: (m) => ({ ...m, b: true }) },
  { re: /__([^_\s￼](?:[^_￼]*[^_\s￼])?)__$/, delim: 2, apply: (m) => ({ ...m, b: true }) },
  { re: /~~([^~\s￼](?:[^~￼]*[^~\s￼])?)~~$/, delim: 2, apply: (m) => ({ ...m, s: true }) },
  { re: /==([^=\s￼](?:[^=￼]*[^=\s￼])?)==$/, delim: 2, apply: (m) => ({ ...m, hl: 'yellow' }) },
  { re: /(?<![*\w])\*([^*\s￼](?:[^*￼]*[^*\s￼])?)\*$/, delim: 1, apply: (m) => ({ ...m, i: true }) },
  { re: /(?<![_\w])_([^_\s￼](?:[^_￼]*[^_\s￼])?)_$/, delim: 1, apply: (m) => ({ ...m, i: true }) },
  { re: /`([^`￼]+)`$/, delim: 1, apply: (m) => ({ ...m, code: true }) },
];

export function inlineShortcut(runs: Run[], caret: number): { runs: Run[]; caret: number } | null {
  const before = visibleText(runs).slice(0, caret);
  for (const rule of INLINE_RULES) {
    const m = rule.re.exec(before);
    if (!m) continue;
    const start = m.index;
    const end = caret;
    // Code can't hold formatting, and what's already code isn't re-read.
    if (sliceRuns(runs, start, end).some((r) => !isAtom(r) && r.m.code)) continue;
    let next = deleteRange(runs, end - rule.delim, end);
    next = deleteRange(next, start, start + rule.delim);
    const innerEnd = end - 2 * rule.delim;
    next = restyle(next, start, innerEnd, rule.apply);
    return { runs: next, caret: innerEnd };
  }
  return null;
}

// Two run lists hold exactly the same text and formatting.
export function equalRuns(a: Run[], b: Run[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((r, i) => {
    const s = b[i];
    if (isAtom(r) || isAtom(s)) return isAtom(r) && isAtom(s) && r.atom === s.atom && sameMarks(r.m, s.m);
    return r.text === s.text && sameMarks(r.m, s.m);
  });
}

const sameMarks = (x: Marks, y: Marks) =>
  !!x.b === !!y.b && !!x.i === !!y.i && !!x.s === !!y.s && !!x.code === !!y.code && !!x.u === !!y.u && x.hl === y.hl && x.link === y.link;
