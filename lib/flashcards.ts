// Study cards pulled out of a note's own structure: `term :: definition` lines, Q:/A: pairs,
// `- term: definition` bullets, ==highlights== (fill in the blank), and a heading with no other
// cards under it paired with the first sentence of its paragraph. No AI.

export type Card = {
  id: string;
  noteId: string;
  noteTitle: string;
  roomId: string;
  kind: 'pair' | 'cloze';
  front: string;
  back: string;
};

export type CardSource = { id: string; title: string; roomId: string };

export const MAX_FRONT = 80;
const MAX_HEADING_BACK = 160;

const LIST = /^(?:[-*+]|\d+[.)])\s+/;
const TASK = /^(?:[-*+]|\d+[.)])\s+\[.\]/;
const URL_RE = /\bhttps?:\/\//i;

function body(md: string): string[] {
  const text = md
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/^---\n[\s\S]*?\n(?:---|\.\.\.)(?:\n|$)/, '')
    .replace(/%%[\s\S]*?(?:%%|$)/g, '')
    .replace(/<!--[\s\S]*?(?:-->|$)/g, '');
  const out: string[] = [];
  let fence: string | null = null;
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*(```|~~~)/);
    if (m) {
      fence = fence === null ? m[1] : fence === m[1] ? null : fence;
      out.push('');
    } else out.push(fence === null ? line : '');
  }
  return out;
}

function clean(s: string): string {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/!\[\[[^\]]*\]\]/g, '')
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2')
    .replace(/\[\[([^\]]*)\]\]/g, (_, l: string) => l.split('#').pop()!)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/==([^=]+)==/g, '$1')
    .replace(/(\*\*|__|~~)(.+?)\1/g, '$2')
    .replace(/(^|[^\w*])[*_]([^*_]+)[*_](?=[^\w*]|$)/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstSentence(para: string): string {
  const s = para.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? para;
  return s.length <= MAX_HEADING_BACK ? s : `${s.slice(0, MAX_HEADING_BACK - 1).trimEnd()}…`;
}

function pairOf(front: string, back: string): [string, string] | null {
  const f = clean(front);
  const b = clean(back);
  if (!f || !b || f.length > MAX_FRONT || f.toLowerCase() === b.toLowerCase() || /^https?:\/\/\S+$/i.test(b)) return null;
  return [f, b];
}

function bulletPair(line: string): [string, string] | null {
  if (!LIST.test(line) || TASK.test(line)) return null;
  const item = line.replace(LIST, '');
  const m = item.match(/^(.+?)(?::\s+|\s[-–—]\s)(.+)$/);
  if (!m || URL_RE.test(m[1]) || /^https?$/i.test(m[1].trim())) return null;
  return pairOf(m[1], m[2]);
}

function clozes(line: string): Array<[string, string]> {
  const text = line.replace(LIST, '');
  const out: Array<[string, string]> = [];
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    const answers = [...sentence.matchAll(/==([^=]+)==/g)].map((m) => clean(m[1]));
    if (answers.length === 0 || answers.some((a) => !a)) continue;
    const front = clean(sentence.replace(/==([^=]+)==/g, '\u0000')).replace(/\u0000/g, '____');
    if (front.replace(/____/g, '').trim()) out.push([front, answers.join(', ')]);
  }
  return out;
}

export function extractCards(src: CardSource, md: string): Card[] {
  const found: Array<['pair' | 'cloze', string, string]> = [];
  const lines = body(md);
  let section: { heading: string; cards: number; para: string[]; paraDone: boolean } | null = null;

  const closeSection = () => {
    if (section && section.cards === 0 && section.para.length > 0) {
      const pair = pairOf(section.heading, firstSentence(clean(section.para.join(' '))));
      if (pair) found.push(['pair', ...pair]);
    }
  };
  const add = (kind: 'pair' | 'cloze', pair: [string, string] | null) => {
    if (!pair) return false;
    found.push([kind, ...pair]);
    if (section) section.cards++;
    return true;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      closeSection();
      section = { heading: heading[1], cards: 0, para: [], paraDone: false };
      continue;
    }
    if (!line) {
      if (section && section.para.length > 0) section.paraDone = true;
      continue;
    }
    if (section && section.para.length > 0 && !section.paraDone && !LIST.test(line)) {
      section.para.push(line);
    }

    const colon = line.replace(LIST, '').match(/^(.+?)\s*::\s*(.+)$/);
    if (colon && add('pair', pairOf(colon[1], colon[2]))) continue;

    const q = line.replace(LIST, '').match(/^Q:\s*(.+)$/i);
    const a = lines[i + 1]?.trim().replace(LIST, '').match(/^A:\s*(.+)$/i);
    if (q && a && add('pair', pairOf(q[1], a[1]))) {
      i++;
      continue;
    }

    if (add('pair', bulletPair(line))) continue;

    const cl = clozes(line);
    if (cl.length > 0) {
      for (const c of cl) add('cloze', c);
      continue;
    }

    if (section && section.para.length === 0 && !section.paraDone && !LIST.test(line) && !line.startsWith('>') && !line.startsWith('|')) {
      section.para.push(line);
    }
  }
  closeSection();

  const seen = new Set<string>();
  const cards: Card[] = [];
  for (const [kind, front, back] of found) {
    const key = front.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cards.push({ id: `${src.id}#${cards.length}`, noteId: src.id, noteTitle: src.title, roomId: src.roomId, kind, front, back });
  }
  return cards;
}
