# Furniture Functions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Desks and writing desks open flashcards/quiz built from the house's notes (with a daily coin reward and streak), a new computer opens a productivity browser with an editable site blocklist, and a new TV console / arcade cabinet plays note-powered games.

**Architecture:** `FURNITURE_ACTIONS` gains `study`, `computer` and `arcade`; `InteriorScene` keeps a list of actions per approach tile and either runs the only option or opens the existing `ChoiceMenu`. Each action emits its own bus event, and a self-contained React overlay (`StudyDesk`, `Computer`, `Arcade`) answers it. All logic that can be pure (card extraction, quiz building, blocklist matching, streak settling, note search) lives in `lib/` with `node --test` tests.

**Tech Stack:** Next.js App Router, React, TypeScript, Phaser 3.90, CSS modules, `node --test` (`npm test`), Python 3 + Pillow for the art script.

**Spec:** `docs/superpowers/specs/2026-10-08-furniture-functions-design.md`

## Global Constraints

- Phaser stays `^3.90.0`; no new npm dependencies.
- All UI is React over the canvas; nothing is drawn as UI inside Phaser.
- Overlay `<input>`s stop key propagation (`onKeyDown`/`onKeyUp` → `e.stopPropagation()`) or Phaser's window-level capture eats Space and the arrow keys.
- Closing an overlay must lead to `this.input.keyboard?.resetKeys()` in `InteriorScene` (JustDown fix).
- Quiz pass threshold **≥ 70%**; quiz length **10**; `STUDY_REWARD = 5`, `STREAK_BONUS_CAP = 10`, earned = `5 + min(days − 1, 10)`; one reward per local day, town-wide.
- Default blocklist: youtube.com, tiktok.com, instagram.com, x.com, reddit.com, facebook.com, twitch.tv, netflix.com, discord.com, snapchat.com, pinterest.com.
- Games pay no coins and don't touch the streak. Word Rain needs 4 pair cards, Match needs 8.
- Our own art is committed at `public/art/tech.png` (`/public/assets` is gitignored).
- Commit titles are specific, imperative sentences, like the existing history; every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- No README or docs changes beyond this plan; comments only where the surrounding code has them.

## Review Focus

1. **A house with no card-shaped notes** (the usual real vault): every app must show the "write `term :: definition`" help, never an empty quiz or a crash. → Task 6 (StudyDesk empty state) and Task 8 (greyed cartridges); Task 1 test that plain prose yields only heading cards.
2. **Task lists and URLs in bullets** (`- [ ] Fix: thing`, `- see: https://x`) must not become junk cards. → Task 1 tests.
3. **Searching for something innocent that contains a blocked name** (`redditch weather`, `xylophone`) must not be blocked; `x` alone must not block. → Task 3 tests.
4. **Old saved wallets without `streak`** must load (not reset to the starter grant). → Task 4 test.
5. **Typing in the computer's search box or Word Rain**: Space, W/A/S/D must type, not move the player. → Tasks 7 and 8 use `stopKeys` on every input; covered by the Task 10 browser check.

---

### Task 1: Flashcard extraction

**Files:**
- Create: `lib/flashcards.ts`
- Test: `lib/flashcards.test.mts`

**Interfaces:**
- Produces: `type Card = { id: string; noteId: string; noteTitle: string; roomId: string; kind: 'pair' | 'cloze'; front: string; back: string }`, `type CardSource = { id: string; title: string; roomId: string }`, `extractCards(src: CardSource, md: string): Card[]`, `MAX_FRONT = 80`.

- [ ] **Step 1: Write the failing tests** in `lib/flashcards.test.mts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractCards } from './flashcards.ts';

const src = { id: 'Bio/Cells/Mitosis.md', title: 'Mitosis', roomId: 'Bio/Cells' };
const pairs = (md: string) => extractCards(src, md).map((c) => [c.kind, c.front, c.back]);

test('double colon lines', () => {
  assert.deepEqual(pairs('Mitosis :: cell division\n- **ATP** :: energy [[Currency|currency]]'), [
    ['pair', 'Mitosis', 'cell division'],
    ['pair', 'ATP', 'energy currency'],
  ]);
});

test('Q/A pairs', () => {
  assert.deepEqual(pairs('Q: What splits cells?\nA: Mitosis'), [['pair', 'What splits cells?', 'Mitosis']]);
});

test('bullets with a colon or a spaced dash', () => {
  assert.deepEqual(pairs('- Prophase: chromosomes condense\n* Anaphase – chromatids separate\n1. Telophase - nuclei reform'), [
    ['pair', 'Prophase', 'chromosomes condense'],
    ['pair', 'Anaphase', 'chromatids separate'],
    ['pair', 'Telophase', 'nuclei reform'],
  ]);
});

test('task items, URLs and long fronts are not cards', () => {
  assert.deepEqual(pairs('- [ ] Fix: the bracket\n- see: https://example.com\n- docs at https://a.b/c: x\n- ' + 'x'.repeat(81) + ': y'), []);
});

test('highlights become cloze cards, one per sentence', () => {
  assert.deepEqual(pairs('The ==mitochondria== makes ATP. Plain sentence. ==DNA== and ==RNA== carry code.'), [
    ['cloze', 'The ____ makes ATP.', 'mitochondria'],
    ['cloze', '____ and ____ carry code.', 'DNA, RNA'],
  ]);
});

test('a heading with no cards under it pairs with its first sentence', () => {
  assert.deepEqual(pairs('## Spindle\nThe spindle pulls chromosomes apart. It is made of microtubules.\n\n## Phases\n- Prophase: condense'), [
    ['pair', 'Spindle', 'The spindle pulls chromosomes apart.'],
    ['pair', 'Prophase', 'condense'],
  ]);
});

test('plain prose with no headings yields nothing', () => {
  assert.deepEqual(pairs('Just a journal entry about my day. Nothing to learn.'), []);
});

test('frontmatter, code fences and comments are ignored', () => {
  const md = '---\ntags: a\nalias: b\n---\n```\nkey :: value\n```\n%% secret :: hidden %%\n<!-- c :: d -->\nReal :: card';
  assert.deepEqual(pairs(md), [['pair', 'Real', 'card']]);
});

test('duplicate fronts keep the first; ids are stable', () => {
  const cards = extractCards(src, 'ATP :: energy\natp :: other\nNADH :: carrier');
  assert.deepEqual(cards.map((c) => c.back), ['energy', 'carrier']);
  assert.deepEqual(cards.map((c) => c.id), ['Bio/Cells/Mitosis.md#0', 'Bio/Cells/Mitosis.md#1']);
  assert.equal(cards[0].noteTitle, 'Mitosis');
  assert.equal(cards[0].roomId, 'Bio/Cells');
});

test('long heading answers are trimmed', () => {
  const [card] = extractCards(src, '## Long\n' + 'word '.repeat(60) + 'end.');
  assert.ok(card.back.length <= 160);
  assert.ok(card.back.endsWith('…'));
});
```

- [ ] **Step 2: Run** `npm test -- lib/flashcards.test.mts` (or `npm test`). Expected: FAIL, module not found.

- [ ] **Step 3: Implement** `lib/flashcards.ts`:

```ts
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
  if (!f || !b || f.length > MAX_FRONT || f.toLowerCase() === b.toLowerCase()) return null;
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
```

Note on ordering: the heading card is pushed when the section closes, i.e. after any cards found in a later part of the file would have been pushed if they came first. To keep cards in reading order, `closeSection` runs at the next heading, so the Spindle card lands before the Phases cards (the test pins this).

- [ ] **Step 4: Run** `npm test`. Expected: all pass. Fix the regexes, not the tests, if one fails (except where a test was itself wrong about Markdown).

- [ ] **Step 5: Commit**: `git add lib/flashcards.ts lib/flashcards.test.mts && git commit -m "Pull study cards out of notes: double-colon lines, Q/A pairs, bullets, highlights and headings"`

---

### Task 2: Quiz building

**Files:**
- Create: `lib/quiz.ts`
- Test: `lib/quiz.test.mts`

**Interfaces:**
- Consumes: `Card` from Task 1.
- Produces: `type Question = { card: Card; kind: 'choice'; prompt: string; options: string[]; answer: number } | { card: Card; kind: 'type'; prompt: string; answer: string }`, `QUIZ_LENGTH = 10`, `PASS_RATIO = 0.7`, `MIN_CARDS = 4`, `shuffle<T>(items: T[], rng?: () => number): T[]`, `buildQuiz(cards: Card[], rng?: () => number, n?: number): Question[]`, `normalizeAnswer(s: string): string`, `isRight(q: Question, given: number | string): boolean`, `passed(correct: number, total: number): boolean`.

A pair card with fewer than 3 distractors becomes a typed question that shows the **definition** and asks for the **term** (typing a whole definition would be unfair). This refines the spec's "becomes a type-the-answer question".

- [ ] **Step 1: Write the failing tests** in `lib/quiz.test.mts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQuiz, isRight, normalizeAnswer, passed, shuffle, QUIZ_LENGTH } from './quiz.ts';
import type { Card } from './flashcards.ts';

let n = 0;
const card = (front: string, back: string, kind: Card['kind'] = 'pair', roomId = 'r1'): Card =>
  ({ id: `c${n++}`, noteId: 'n', noteTitle: 'N', roomId, kind, front, back });
const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

test('shuffle keeps every item', () => {
  assert.deepEqual(shuffle([1, 2, 3, 4, 5], seeded()).sort(), [1, 2, 3, 4, 5]);
});

test('choice questions have four unique options, one of them right', () => {
  const cards = ['a', 'b', 'c', 'd', 'e', 'f'].map((x) => card(x.toUpperCase(), `def ${x}`));
  for (const q of buildQuiz(cards, seeded(7))) {
    assert.equal(q.kind, 'choice');
    if (q.kind !== 'choice') continue;
    assert.equal(q.options.length, 4);
    assert.equal(new Set(q.options.map((o) => o.toLowerCase())).size, 4);
    assert.equal(q.options[q.answer], q.card.back);
    assert.equal(q.prompt, q.card.front);
  }
});

test('distractors never equal the answer, even with different case', () => {
  const cards = [card('A', 'Same'), card('B', 'same'), card('C', 'x'), card('D', 'y'), card('E', 'z')];
  const q = buildQuiz(cards, seeded(3)).find((x) => x.card.front === 'A')!;
  assert.equal(q.kind, 'choice');
  if (q.kind === 'choice') assert.equal(q.options.filter((o) => o.toLowerCase() === 'same').length, 1);
});

test('too few distractors: show the definition, type the term', () => {
  const cards = [card('Alpha', 'first'), card('Beta', 'second')];
  const q = buildQuiz(cards, seeded())[0];
  assert.equal(q.kind, 'type');
  if (q.kind === 'type') {
    assert.equal(q.prompt, q.card.back);
    assert.equal(q.answer, q.card.front);
  }
});

test('cloze cards are typed', () => {
  const q = buildQuiz([card('The ____ makes ATP.', 'mitochondria', 'cloze')], seeded())[0];
  assert.deepEqual([q.kind, q.prompt], ['type', 'The ____ makes ATP.']);
  assert.ok(isRight(q, '  Mitochondria! '));
  assert.ok(!isRight(q, 'ribosome'));
});

test('quiz length is capped and has no repeats', () => {
  const cards = Array.from({ length: 30 }, (_, i) => card(`T${i}`, `D${i}`));
  const quiz = buildQuiz(cards, seeded());
  assert.equal(quiz.length, QUIZ_LENGTH);
  assert.equal(new Set(quiz.map((q) => q.card.id)).size, QUIZ_LENGTH);
});

test('normalizeAnswer ignores case, punctuation and spacing', () => {
  assert.equal(normalizeAnswer(' DNA,  RNA. '), 'dna rna');
});

test('choice answers are checked by index', () => {
  const cards = ['a', 'b', 'c', 'd'].map((x) => card(x, `def ${x}`));
  const q = buildQuiz(cards, seeded())[0];
  if (q.kind !== 'choice') throw new Error('expected choice');
  assert.ok(isRight(q, q.answer));
  assert.ok(!isRight(q, (q.answer + 1) % 4));
});

test('passing needs at least 70%', () => {
  assert.equal(passed(7, 10), true);
  assert.equal(passed(6, 10), false);
  assert.equal(passed(3, 4), true);
  assert.equal(passed(0, 0), false);
});
```

- [ ] **Step 2: Run** `npm test`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `lib/quiz.ts`:

```ts
import type { Card } from './flashcards';

export type Question =
  | { card: Card; kind: 'choice'; prompt: string; options: string[]; answer: number }
  | { card: Card; kind: 'type'; prompt: string; answer: string };

export const QUIZ_LENGTH = 10;
export const PASS_RATIO = 0.7;
// Fewer cards than this and the desk asks for more instead of quizzing.
export const MIN_CARDS = 4;

export function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function normalizeAnswer(s: string): string {
  return s.toLowerCase().replace(/[\p{P}\p{S}]/gu, ' ').replace(/\s+/g, ' ').trim();
}

// Wrong options are other cards' definitions, from the same room first.
function distractors(card: Card, pool: Card[], rng: () => number): string[] {
  const taken = new Set([card.back.toLowerCase()]);
  const out: string[] = [];
  const others = shuffle(pool.filter((c) => c.kind === 'pair' && c !== card), rng);
  others.sort((a, b) => Number(b.roomId === card.roomId) - Number(a.roomId === card.roomId));
  for (const c of others) {
    const key = c.back.toLowerCase();
    if (taken.has(key)) continue;
    taken.add(key);
    out.push(c.back);
    if (out.length === 3) break;
  }
  return out;
}

export function buildQuiz(cards: Card[], rng: () => number = Math.random, n = QUIZ_LENGTH): Question[] {
  return shuffle(cards, rng).slice(0, n).map((card): Question => {
    if (card.kind === 'cloze') return { card, kind: 'type', prompt: card.front, answer: card.back };
    const wrong = distractors(card, cards, rng);
    if (wrong.length < 3) return { card, kind: 'type', prompt: card.back, answer: card.front };
    const options = shuffle([card.back, ...wrong], rng);
    return { card, kind: 'choice', prompt: card.front, options, answer: options.indexOf(card.back) };
  });
}

export function isRight(q: Question, given: number | string): boolean {
  if (q.kind === 'choice') return given === q.answer;
  return typeof given === 'string' && normalizeAnswer(given) === normalizeAnswer(q.answer);
}

export function passed(correct: number, total: number): boolean {
  return total > 0 && correct / total >= PASS_RATIO;
}
```

- [ ] **Step 4: Run** `npm test`. Expected: PASS.

- [ ] **Step 5: Commit**: `git add lib/quiz.ts lib/quiz.test.mts && git commit -m "Build multiple-choice and typed quizzes from study cards"`

---

### Task 3: Blocklist matching

**Files:**
- Create: `lib/blocklist.ts`
- Test: `lib/blocklist.test.mts`

**Interfaces:**
- Produces: `DEFAULT_BLOCKLIST: string[]`, `normalizeDomain(input: string): string | null`, `type Target = { kind: 'url'; url: string; host: string } | { kind: 'search'; query: string }`, `parseTarget(input: string): Target | null`, `blockedBy(target: Target, list: string[]): string | null` (returns the listed domain that blocks it), `type Engine = 'google' | 'wikipedia' | 'scholar'`, `ENGINES: Record<Engine, { name: string; home: string; search: (q: string) => string }>`.

- [ ] **Step 1: Write the failing tests** in `lib/blocklist.test.mts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BLOCKLIST, ENGINES, blockedBy, normalizeDomain, parseTarget } from './blocklist.ts';

const check = (input: string, list = DEFAULT_BLOCKLIST) => blockedBy(parseTarget(input)!, list);

test('normalizeDomain strips scheme, www, path and port', () => {
  assert.equal(normalizeDomain('https://www.YouTube.com/watch?v=1'), 'youtube.com');
  assert.equal(normalizeDomain('m.reddit.com:443/r/x'), 'm.reddit.com');
  assert.equal(normalizeDomain('not a domain'), null);
  assert.equal(normalizeDomain('localhost'), null);
});

test('parseTarget tells URLs from searches', () => {
  assert.deepEqual(parseTarget('wikipedia.org'), { kind: 'url', url: 'https://wikipedia.org', host: 'wikipedia.org' });
  assert.deepEqual(parseTarget('https://en.wikipedia.org/wiki/Cell'), { kind: 'url', url: 'https://en.wikipedia.org/wiki/Cell', host: 'en.wikipedia.org' });
  assert.deepEqual(parseTarget('cell biology'), { kind: 'search', query: 'cell biology' });
  assert.equal(parseTarget('   '), null);
  assert.deepEqual(parseTarget('javascript:alert(1)'), { kind: 'search', query: 'javascript:alert(1)' });
});

test('blocked domains and their subdomains', () => {
  assert.equal(check('youtube.com'), 'youtube.com');
  assert.equal(check('https://m.youtube.com/watch?v=1'), 'youtube.com');
  assert.equal(check('twitter.com'), 'x.com');
  assert.equal(check('youtu.be/abc'), 'youtube.com');
  assert.equal(check('notyoutube.com'), null);
});

test('searches naming a blocked site', () => {
  assert.equal(check('youtube cats'), 'youtube.com');
  assert.equal(check('Reddit: best study tips'), 'reddit.com');
  assert.equal(check('twitter elon'), 'x.com');
  assert.equal(check('instagram.com login'), 'instagram.com');
});

test('innocent searches are not blocked', () => {
  assert.equal(check('redditch weather'), null);
  assert.equal(check('x ray diffraction'), null);
  assert.equal(check('xylophone'), null);
  assert.equal(check('facebookish'), null);
});

test('a custom list replaces the defaults', () => {
  assert.equal(check('youtube cats', ['wikipedia.org']), null);
  assert.equal(check('wikipedia cells', ['wikipedia.org']), 'wikipedia.org');
  assert.equal(check('https://en.wikipedia.org', ['wikipedia.org']), 'wikipedia.org');
});

test('search engines build https URLs with the query encoded', () => {
  assert.equal(ENGINES.google.search('a&b c'), 'https://www.google.com/search?q=a%26b%20c');
  assert.ok(ENGINES.wikipedia.search('cell').startsWith('https://en.wikipedia.org/'));
  assert.ok(ENGINES.scholar.search('cell').startsWith('https://scholar.google.com/'));
});
```

- [ ] **Step 2: Run** `npm test`. Expected: FAIL.

- [ ] **Step 3: Implement** `lib/blocklist.ts`:

```ts
// The computer's distraction blocker. It only governs what the computer itself opens: a page
// can't block sites in the rest of the browser.

export const DEFAULT_BLOCKLIST = [
  'youtube.com', 'tiktok.com', 'instagram.com', 'x.com', 'reddit.com', 'facebook.com',
  'twitch.tv', 'netflix.com', 'discord.com', 'snapchat.com', 'pinterest.com',
];

// Other domains and names that mean the same site.
const ALIASES: Record<string, string[]> = {
  'x.com': ['twitter.com', 't.co', 'twitter'],
  'youtube.com': ['youtu.be'],
  'facebook.com': ['fb.com'],
  'discord.com': ['discord.gg'],
};

export function normalizeDomain(input: string): string | null {
  const host = input.trim().toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/:\d+$/, '')
    .replace(/^www\./, '');
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
}

export type Target = { kind: 'url'; url: string; host: string } | { kind: 'search'; query: string };

export function parseTarget(input: string): Target | null {
  const text = input.trim();
  if (!text) return null;
  if (/^https?:\/\/\S+$/i.test(text)) {
    try {
      const url = new URL(text);
      return { kind: 'url', url: url.href.replace(/\/$/, text.endsWith('/') ? '/' : ''), host: url.hostname.toLowerCase() };
    } catch {
      return { kind: 'search', query: text };
    }
  }
  if (!/\s/.test(text) && normalizeDomain(text) && /\.[a-z]{2,}(?:[/?#:]|$)/i.test(text)) {
    return { kind: 'url', url: `https://${text}`, host: text.toLowerCase().replace(/[/?#:].*$/, '') };
  }
  return { kind: 'search', query: text };
}

const bare = (host: string) => host.toLowerCase().replace(/^www\./, '');
const coversHost = (domain: string, host: string) => host === domain || host.endsWith(`.${domain}`);
// 'youtube.com' -> 'youtube'. Names under 3 letters ('x') would block ordinary words.
const nameOf = (domain: string) => domain.split('.').slice(0, -1).join('.');

export function blockedBy(target: Target, list: string[]): string | null {
  for (const listed of list) {
    const domain = normalizeDomain(listed);
    if (!domain) continue;
    const aliases = ALIASES[domain] ?? [];
    const domains = [domain, ...aliases.filter((a) => a.includes('.'))];
    const names = [nameOf(domain), ...aliases.filter((a) => !a.includes('.'))].filter((n) => n.length >= 3);
    if (target.kind === 'url') {
      if (domains.some((d) => coversHost(d, bare(target.host)))) return domain;
      continue;
    }
    for (const word of target.query.toLowerCase().split(/[^\p{L}\p{N}.-]+/u)) {
      const w = word.replace(/^[.-]+|[.-]+$/g, '');
      if (!w) continue;
      const asDomain = normalizeDomain(w);
      if (asDomain && domains.some((d) => coversHost(d, asDomain))) return domain;
      if (names.includes(w)) return domain;
    }
  }
  return null;
}

export type Engine = 'google' | 'wikipedia' | 'scholar';
export const ENGINES: Record<Engine, { name: string; home: string; search: (q: string) => string }> = {
  google: { name: 'Google', home: 'https://www.google.com', search: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
  wikipedia: { name: 'Wikipedia', home: 'https://en.wikipedia.org', search: (q) => `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(q)}` },
  scholar: { name: 'Scholar', home: 'https://scholar.google.com', search: (q) => `https://scholar.google.com/scholar?q=${encodeURIComponent(q)}` },
};
```

- [ ] **Step 4: Run** `npm test`. Expected: PASS. (If the `parseTarget` URL test fails on trailing slashes, simplify to `url: text` for `http(s)://` input; the test expects the input back unchanged.)

- [ ] **Step 5: Commit**: `git add lib/blocklist.ts lib/blocklist.test.mts && git commit -m "Match URLs and searches against a distraction blocklist"`

---

### Task 4: Study reward and streak in the wallet

**Files:**
- Modify: `lib/wallet.ts` (add `Streak`, constants, `localDay`, `dayBefore`, `currentStreak`, `settleStudy`; `WalletData` gains `streak`; `settle(null, …)` starts with no streak)
- Modify: `lib/walletStore.ts` (load old saves; `studyPassed()`; view gains `streak` and `studiedToday`; export `vaultStorageKey(suffix)`)
- Modify: `lib/wallet.test.mts`

**Interfaces:**
- Produces: `type Streak = { days: number; lastDay: string | null }`, `STUDY_REWARD = 5`, `STREAK_BONUS_CAP = 10`, `NO_STREAK: Streak`, `localDay(d: Date): string`, `dayBefore(day: string): string`, `currentStreak(s: Streak, today: string): number`, `settleStudy(data: WalletData, today: string): { data: WalletData; earned: number }`, `withStreak(d: Omit<WalletData, 'streak'> & { streak?: Streak }): WalletData`; from walletStore: `studyPassed(): number`, `WalletView.streak: number`, `WalletView.studiedToday: boolean`, `vaultStorageKey(suffix: string): string | null`.

- [ ] **Step 1: Write the failing tests**: append to `lib/wallet.test.mts` (and add the new names to its import from `./wallet.ts`), and change the existing starter test's expectation to include `streak: { days: 0, lastDay: null }`:

```ts
test('first passed quiz starts a one-day streak and pays the base reward', () => {
  const start = settle(null, 0).data;
  const { data, earned } = settleStudy(start, '2026-10-08');
  assert.equal(earned, STUDY_REWARD);
  assert.deepEqual(data.streak, { days: 1, lastDay: '2026-10-08' });
  assert.equal(data.balance, start.balance + STUDY_REWARD);
});

test('a second quiz the same day pays nothing', () => {
  const once = settleStudy(settle(null, 0).data, '2026-10-08').data;
  const twice = settleStudy(once, '2026-10-08');
  assert.equal(twice.earned, 0);
  assert.equal(twice.data, once);
});

test('the next day grows the streak and pays one more', () => {
  const d1 = settleStudy(settle(null, 0).data, '2026-10-31').data;
  const d2 = settleStudy(d1, '2026-11-01');
  assert.equal(d2.earned, STUDY_REWARD + 1);
  assert.equal(d2.data.streak.days, 2);
});

test('missing a day starts over', () => {
  const d1 = settleStudy(settle(null, 0).data, '2026-10-08').data;
  const d3 = settleStudy(d1, '2026-10-10');
  assert.equal(d3.earned, STUDY_REWARD);
  assert.equal(d3.data.streak.days, 1);
});

test('the streak bonus is capped', () => {
  let data = { ...settle(null, 0).data, streak: { days: 30, lastDay: '2026-10-07' } };
  const r = settleStudy(data, '2026-10-08');
  assert.equal(r.earned, STUDY_REWARD + STREAK_BONUS_CAP);
  assert.equal(r.data.streak.days, 31);
});

test('currentStreak survives until the end of the next day', () => {
  const s = { days: 4, lastDay: '2026-10-08' };
  assert.equal(currentStreak(s, '2026-10-08'), 4);
  assert.equal(currentStreak(s, '2026-10-09'), 4);
  assert.equal(currentStreak(s, '2026-10-10'), 0);
  assert.equal(currentStreak({ days: 0, lastDay: null }, '2026-10-10'), 0);
});

test('day arithmetic crosses months and years', () => {
  assert.equal(dayBefore('2026-03-01'), '2026-02-28');
  assert.equal(dayBefore('2027-01-01'), '2026-12-31');
  assert.equal(localDay(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});

test('old saves without a streak load with none', () => {
  assert.deepEqual(withStreak({ balance: 80, record: 3, inventory: {} }), { balance: 80, record: 3, inventory: {}, streak: { days: 0, lastDay: null } });
});
```

- [ ] **Step 2: Run** `npm test`. Expected: FAIL.

- [ ] **Step 3: Implement** in `lib/wallet.ts`. Add after `STARTER_GRANT`:

```ts
// Passing a quiz at a desk pays once a day, a coin more for each day in a row.
export const STUDY_REWARD = 5;
export const STREAK_BONUS_CAP = 10;

// days in a row a quiz was passed, through lastDay (the player's local YYYY-MM-DD).
export type Streak = { days: number; lastDay: string | null };
export const NO_STREAK: Streak = { days: 0, lastDay: null };
```

Change `WalletData` to `{ balance: number; record: number; inventory: Inventory; streak: Streak }`, make `settle(null, …)` return `{ balance: STARTER_GRANT, record: qualifyingCount, inventory: {}, streak: NO_STREAK }`, and add:

```ts
export function withStreak(d: Omit<WalletData, 'streak'> & { streak?: Streak }): WalletData {
  return { ...d, streak: d.streak ?? NO_STREAK };
}

const pad = (n: number) => String(n).padStart(2, '0');
export function localDay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function dayBefore(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return localDay(new Date(y, m - 1, d - 1));
}

export function currentStreak(s: Streak, today: string): number {
  return s.lastDay === today || s.lastDay === dayBefore(today) ? s.days : 0;
}

export function settleStudy(data: WalletData, today: string): { data: WalletData; earned: number } {
  if (data.streak.lastDay === today) return { data, earned: 0 };
  const days = data.streak.lastDay === dayBefore(today) ? data.streak.days + 1 : 1;
  const earned = STUDY_REWARD + Math.min(days - 1, STREAK_BONUS_CAP);
  return { data: { ...data, balance: data.balance + earned, streak: { days, lastDay: today } }, earned };
}
```

In `lib/walletStore.ts`:
- import `currentStreak, localDay, settleStudy, withStreak` from `./wallet`;
- `load()` returns `withStreak(d)` instead of `d as WalletData` (validate `d.streak` only if present: `d.streak === undefined || (typeof d.streak.days === 'number')`, otherwise ignore it by deleting it before `withStreak`);
- `WalletView` gains `streak: number; studiedToday: boolean`; `INACTIVE` gets `streak: 0, studiedToday: false`; in `publish()` compute `const today = localDay(new Date())` and set `streak: currentStreak(session.data.streak, today)`, `studiedToday: session.data.streak.lastDay === today`;
- add:

```ts
// Passing a quiz at a desk. Returns the coins paid: 0 when today's reward is already taken.
export function studyPassed(): number {
  if (!session) return 0;
  const { data, earned } = settleStudy(session.data, localDay(new Date()));
  session.data = data;
  if (earned > 0) {
    const days = data.streak.days;
    publish(notice(earned, days === 1 ? 'Studied today! Come back tomorrow to start a streak.' : `Study streak: ${days} days!`));
  }
  return earned;
}

// Per-vault storage for things that aren't money (the computer's blocklist, arcade scores),
// next to the wallet. Null in the demo town, whose wallet doesn't persist either.
export function vaultStorageKey(suffix: string): string | null {
  return session?.key ? `${session.key}:${suffix}` : null;
}
```

- [ ] **Step 4: Run** `npm test` and `npx tsc --noEmit`. Expected: PASS, and no type errors (any other `WalletData` literal in the codebase now needs `streak`; fix each).

- [ ] **Step 5: Commit**: `git add lib/wallet.ts lib/walletStore.ts lib/wallet.test.mts && git commit -m "Pay a daily study reward that grows with a streak of days in a row"`

---

### Task 5: Shared note search, per-vault prefs, and house cards

**Files:**
- Create: `lib/noteSearch.ts` (moved from `components/FastTravel.tsx`: `Destination`, `buildIndex`, `score`, `escapeRe`, plus a new `searchIndex`)
- Modify: `components/FastTravel.tsx` (import from `lib/noteSearch`; its results `useMemo` calls `searchIndex`)
- Test: `lib/noteSearch.test.mts`
- Create: `lib/vaultPrefs.ts`
- Create: `lib/houseCards.ts`

**Interfaces:**
- Produces: `type Destination` (unchanged shape), `buildIndex(world: WorldModel): Destination[]`, `escapeRe(s: string): string`, `searchIndex(index: Destination[], query: string, max: number): Destination[]` (empty query → `[]`); `readPref<T>(suffix: string, fallback: T): T`, `writePref<T>(suffix: string, value: T): void`; `findHouse(world: WorldModel, houseId: string): House | undefined`, `loadHouseCards(vault: VaultHandle, houseId: string): Promise<{ house: House; cards: Card[] } | null>`.

- [ ] **Step 1: Write the failing test** `lib/noteSearch.test.mts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex, searchIndex } from './noteSearch.ts';
import type { WorldModel } from './types.ts';

const note = (id: string, title: string, preview = '') => ({ id, title, furniture: 'desk' as const, gx: 0, gy: 0, preview });
const world = {
  regions: [{
    id: 'Bio', name: 'Bio',
    houses: [{ id: 'Bio/Cells', name: 'Cells', rooms: [{ id: 'Bio/Cells', name: 'Main', notes: [note('a.md', 'Mitosis', 'cells divide'), note('b.md', 'Meiosis', 'mitosis twice')] }] }],
  }],
} as unknown as WorldModel;

test('a title hit beats a preview hit', () => {
  const hits = searchIndex(buildIndex(world), 'mitosis', 8);
  assert.deepEqual(hits.map((d) => d.title), ['Mitosis', 'Meiosis']);
});

test('every word must match somewhere', () => {
  assert.deepEqual(searchIndex(buildIndex(world), 'mitosis banana', 8), []);
  assert.deepEqual(searchIndex(buildIndex(world), '   ', 8), []);
});
```

(If `WorldModel`'s region/house shape needs more fields, add them to the fixture; it's cast.)

- [ ] **Step 2: Run** `npm test`. Expected: FAIL.

- [ ] **Step 3: Implement.** Move `Destination`, `buildIndex`, `score` and `escapeRe` verbatim from `FastTravel.tsx` into `lib/noteSearch.ts` (exported, with their comments) and add:

```ts
export function searchIndex(index: Destination[], query: string, max: number): Destination[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return index
    .map((d) => ({ d, s: score(d, words) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.d.title.length - b.d.title.length)
    .slice(0, max)
    .map((x) => x.d);
}
```

In `FastTravel.tsx`, delete the moved code, `import { buildIndex, escapeRe, searchIndex, type Destination } from '@/lib/noteSearch';`, and replace the non-empty branch of its `results` memo with `return searchIndex(index, query, MAX_RESULTS);` (add `query` to that memo's deps). `Highlight` keeps using `escapeRe`.

`lib/vaultPrefs.ts`:

```ts
import { vaultStorageKey } from './walletStore';

// Small per-vault settings kept beside the wallet. The demo town keeps them for the session only.
const memory = new Map<string, unknown>();

export function readPref<T>(suffix: string, fallback: T): T {
  const key = vaultStorageKey(suffix);
  if (!key) return (memory.get(suffix) as T | undefined) ?? fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writePref<T>(suffix: string, value: T) {
  const key = vaultStorageKey(suffix);
  if (!key) {
    memory.set(suffix, value);
    return;
  }
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable — the setting just won't persist.
  }
}
```

`lib/houseCards.ts`:

```ts
import type { House, VaultHandle, WorldModel } from './types';
import { extractCards, type Card } from './flashcards';

export function findHouse(world: WorldModel, houseId: string): House | undefined {
  for (const region of world.regions) {
    const house = region.houses.find((h) => h.id === houseId);
    if (house) return house;
  }
  return undefined;
}

// Read fresh every time a desk, computer or console opens, so an edit made a minute ago counts.
export async function loadHouseCards(vault: VaultHandle, houseId: string): Promise<{ house: House; cards: Card[] } | null> {
  const house = findHouse(vault.world, houseId);
  if (!house) return null;
  const notes = house.rooms.flatMap((room) => room.notes.map((note) => ({ note, roomId: room.id })));
  const texts = await Promise.all(notes.map(({ note }) => vault.readNote(note.id).catch(() => '')));
  const seen = new Set<string>();
  const cards: Card[] = [];
  notes.forEach(({ note, roomId }, i) => {
    for (const card of extractCards({ id: note.id, title: note.title, roomId }, texts[i])) {
      const key = card.front.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      cards.push(card);
    }
  });
  return { house, cards };
}
```

Check `vault.world` is the live world after notes are added (FastTravel uses `vault.world` too); if `VaultHandle` is replaced on edits, this is fine as is.

- [ ] **Step 4: Run** `npm test` and `npx tsc --noEmit`. Expected: PASS.

- [ ] **Step 5: Commit**: `git add lib/noteSearch.ts lib/noteSearch.test.mts lib/vaultPrefs.ts lib/houseCards.ts components/FastTravel.tsx && git commit -m "Share fast travel's note search, add per-vault prefs and a house's study cards"`

---

### Task 6: Catalogue entries, scene wiring and the study desk

**Files:**
- Modify: `lib/types.ts` (`DecorKind` gains `'computer' | 'laptop' | 'computer_desk' | 'tv_console' | 'arcade'`)
- Modify: `lib/catalog.ts` (sheet `tech`; URL mapping; TABLETOP gains `computer`, `laptop`; five entries; group `tech`; actions)
- Modify: `lib/catalog.test.mts` (action assertions)
- Create: `scripts/draw-tech.py`, `public/art/tech.png`
- Modify: `game/bus.ts` (six events)
- Modify: `game/scenes/InteriorScene.ts` (per-tile action lists, menu building, app overlays)
- Create: `components/StudyDesk.tsx`, `components/StudyDesk.module.css`
- Modify: `components/CoinPurse.tsx`, `components/CoinPurse.module.css` (streak badge)
- Modify: `app/page.tsx` (mount `StudyDesk`; Tasks 7–8 mount the others)

**Interfaces:**
- Consumes: `loadHouseCards` (Task 5), `buildQuiz`, `isRight`, `passed`, `MIN_CARDS`, `shuffle` (Task 2), `studyPassed`, `useWallet().streak/studiedToday` (Task 4).
- Produces: `FurnitureAction = 'sit' | 'lie' | 'wardrobe' | 'study' | 'computer' | 'arcade'`; bus events `'open-study': { houseId: string; mode: 'flashcards' | 'quiz' }`, `'close-study': undefined`, `'open-computer': { houseId: string }`, `'close-computer': undefined`, `'open-arcade': { houseId: string }`, `'close-arcade': undefined`; catalogue ids `computer_crt`, `laptop`, `computer_desk`, `tv_console`, `arcade_cabinet`.

- [ ] **Step 1: Failing catalogue test.** In `lib/catalog.test.mts` replace `assert.equal(FURNITURE_ACTIONS.desk, undefined);` with:

```ts
  assert.equal(FURNITURE_ACTIONS.desk, 'study');
  assert.equal(FURNITURE_ACTIONS.writing_desk, 'study');
  assert.equal(FURNITURE_ACTIONS.table, undefined);
  assert.equal(FURNITURE_ACTIONS.computer, 'computer');
  assert.equal(FURNITURE_ACTIONS.laptop, 'computer');
  assert.equal(FURNITURE_ACTIONS.computer_desk, 'computer');
  assert.equal(FURNITURE_ACTIONS.tv_console, 'arcade');
  assert.equal(FURNITURE_ACTIONS.arcade, 'arcade');
```

and add:

```ts
test('tech pieces: tabletop computers, floor desk, console and cabinet', () => {
  const by = (id: string) => CATALOG.find((e) => e.id === id)!;
  assert.equal(by('computer_crt').layer, 'tabletop');
  assert.equal(by('laptop').layer, 'tabletop');
  assert.deepEqual(by('computer_desk').footprint, [2, 1]);
  assert.deepEqual(by('tv_console').footprint, [2, 1]);
  assert.deepEqual(by('arcade_cabinet').footprint, [1, 1]);
  assert.equal(by('arcade_cabinet').sheetUrl, '/art/tech.png');
});
```

Run `npm test`: FAIL.

- [ ] **Step 2: Art.** Write `scripts/draw-tech.py` that draws `public/art/tech.png` (96×32, RGBA) with Pillow, pixel by pixel from a fixed palette (outline `#3f2832`; wood `#b07a50`/`#8a5a3c`/`#5e3b2a`; beige plastic `#e8dcc0`/`#c7b996`; screen `#2b4a5e` with highlight `#7fd4e8`; TV body `#2c2c34`; cabinet red `#b8434f`/`#7e2a36`; marquee `#ffe066`). Pieces stand on the bottom of their rect; tabletop pieces leave their top rows transparent.

    | id | rect (x, y, w, h) | drawing |
    |---|---|---|
    | `laptop` | (0, 0, 16, 16) | open grey laptop, glowing screen, bottom 9 px |
    | `computer_crt` | (0, 16, 16, 16) | beige CRT monitor with a blue screen and a keyboard strip, bottom 12 px |
    | `arcade_cabinet` | (16, 0, 16, 32) | red cabinet, yellow marquee, lit screen, joystick and buttons |
    | `computer_desk` | (32, 0, 32, 32) | wooden desk in the bottom 16 px; monitor and tower rising above |
    | `tv_console` | (64, 0, 32, 32) | low wooden stand in the bottom 16 px; dark TV with a lit screen above; a small console and two pads on the stand |

  Run `python3 scripts/draw-tech.py`, open the PNG scaled up (`python3 -c "from PIL import Image; Image.open('public/art/tech.png').resize((96*8,32*8), Image.NEAREST).save('/tmp/tech-big.png')"` into the scratchpad instead of /tmp) and look at it; redraw until each piece reads clearly at 16 px. Compare against a Kenmi sheet crop for outline weight.

- [ ] **Step 3: Catalogue.** In `lib/catalog.ts`:
  - append `'tech'` to `FURNITURE_SHEETS`;
  - `furnitureSheetUrl = (sheet) => (sheet === 'tech' ? '/art/tech.png' : `/assets/furniture/${sheet}.png`)` with a comment: "Our own drawn art is committed under public/art; the licensed packs are gitignored under public/assets.";
  - BootScene loads `assets/furniture/${sheet}.png` directly: change it to `this.load.image(furnitureTextureKey(sheet), furnitureSheetUrl(sheet).slice(1));` and import `furnitureSheetUrl`;
  - `TABLETOP` gains `'computer', 'laptop'`;
  - in the hand-written `CATALOG` list, add before `...generated()`:

```ts
  // Tech, drawn for Notekeep (scripts/draw-tech.py)
  item('computer_crt', 'Desktop computer', 'computer', 'uncommon', 'tech', [0, 16, 16, 16]),
  item('laptop', 'Laptop', 'laptop', 'uncommon', 'tech', [0, 0, 16, 16]),
  item('arcade_cabinet', 'Arcade cabinet', 'arcade', 'treasure', 'tech', [16, 0, 16, 32], { base: [1, 1] }),
  item('computer_desk', 'Computer desk', 'computer_desk', 'rare', 'tech', [32, 0, 32, 32], { base: [2, 1] }),
  item('tv_console', 'TV and games console', 'tv_console', 'rare', 'tech', [64, 0, 32, 32], { base: [2, 1] }),
```

  - `CATALOG_GROUPS` gains `{ id: 'tech', label: 'Tech', categories: ['computer', 'laptop', 'computer_desk', 'tv_console', 'arcade'] }` after `hobby`;
  - `FurnitureAction` becomes `'sit' | 'lie' | 'wardrobe' | 'study' | 'computer' | 'arcade'` and `FURNITURE_ACTIONS` gains `desk: 'study', writing_desk: 'study', computer: 'computer', laptop: 'computer', computer_desk: 'computer', tv_console: 'arcade', arcade: 'arcade'`. Update its comment: "A note on the piece, or another piece sharing the approach tile, turns Space into a menu."

  Run `npm test`. Expected: PASS, including "every rect lies inside its sheet" (reads `public/art/tech.png` through `furnitureSheetUrl`) and the "every category belongs to one group" invariant if present.

- [ ] **Step 4: Bus events.** In `game/bus.ts` add to `BusEvents`:

```ts
  'open-study': { houseId: string; mode: 'flashcards' | 'quiz' };
  'close-study': undefined;
  'open-computer': { houseId: string };
  'close-computer': undefined;
  'open-arcade': { houseId: string };
  'close-arcade': undefined;
```

- [ ] **Step 5: InteriorScene.**
  - `private actions = new Map<string, PieceAction[]>();` and `private appOpen = false;` (reset both in `init`).
  - `overlayOpen()` adds `|| this.appOpen`.
  - Add `private onCloseApp = () => { this.appOpen = false; this.input.keyboard?.resetKeys(); };`, subscribe it to `close-study`, `close-computer` and `close-arcade` in `create()` and unsubscribe on shutdown.
  - Add:

```ts
  private openApp(event: 'open-computer' | 'open-arcade') {
    if (this.overlayOpen() || this.exiting) return;
    this.appOpen = true;
    bus.emit(event, { houseId: this.houseId });
  }

  private openStudy(mode: 'flashcards' | 'quiz') {
    if (this.overlayOpen() || this.exiting) return;
    this.appOpen = true;
    bus.emit('open-study', { houseId: this.houseId, mode });
  }

  private optionsFor(piece: PieceAction): Array<[string, () => void]> {
    switch (piece.action) {
      case 'sit': return [['Sit down', () => this.act(piece)]];
      case 'lie': return [['Lie down', () => this.act(piece)]];
      case 'wardrobe': return [['Change outfit', () => this.openWardrobe()]];
      case 'study': return [['Flashcards', () => this.openStudy('flashcards')], ['Quiz', () => this.openStudy('quiz')]];
      case 'computer': return [['Use computer', () => this.openApp('open-computer')]];
      case 'arcade': return [['Play games', () => this.openApp('open-arcade')]];
    }
  }

  // One thing to do runs at once; more (a note on a desk, a computer on it) asks which.
  // A piece standing on the table comes before the table.
  private use(note: NoteRef | undefined, pieces: PieceAction[]) {
    const sorted = [...pieces].sort((a, b) => Number(b.entry.layer === 'tabletop') - Number(a.entry.layer === 'tabletop'));
    const options: Array<[string, () => void]> = [];
    if (note) options.push(['Read note', () => this.openNote(note)]);
    for (const p of sorted) options.push(...this.optionsFor(p));
    if (options.length === 1) options[0][1]();
    else if (options.length > 1) this.openMenu(note?.title ?? sorted[0].entry.name, options);
  }
```

  - Delete `openBedMenu`. In `act()`, the `wardrobe` branch stays (sit/lie still go through it).
  - In `renderPlacement`, replace the last two lines with:

```ts
    const action = FURNITURE_ACTIONS[entry.category];
    if (!action) return;
    // A computer on a desk is used from in front of the desk, along its whole front edge.
    const surface = under === null ? null : this.layout.placements[under];
    const surfaceEntry = surface ? CATALOG_BY_ID[surface.item] : undefined;
    const keys = surface && surfaceEntry
      ? Array.from({ length: surfaceEntry.footprint[0] }, (_, i) => `${surface.gx + i},${surface.gy + surfaceEntry.footprint[1]}`)
      : [apKey];
    for (const key of keys) {
      const list = this.actions.get(key) ?? [];
      if (!list.some((p) => p.action === action)) list.push({ action, entry, placement, note });
      this.actions.set(key, list);
    }
```

  - In `update()`: `const pieces = settled ? (this.actions.get(here) ?? []) : [];`, the condition becomes `if (atShelf || note || pieces.length > 0)`, and the key branch becomes:

```ts
        if (atShelf && !note) this.useShelf();
        else this.use(note, pieces);
```

  Note: `this.approach` (note per tile) is unchanged; `PieceAction.note` is no longer read, so drop the field and its assignment.

- [ ] **Step 6: Streak badge.** In `CoinPurse.tsx`, after the purse div:

```tsx
      <div
        className={`${styles.streak} ${wallet.studiedToday ? styles.lit : ''}`}
        title={wallet.streak > 0
          ? `${wallet.streak} day${wallet.streak === 1 ? '' : 's'} in a row. Pass a quiz at a desk every day to keep it going.`
          : 'Pass a quiz at a desk to start a study streak.'}
      >
        <span className={styles.flame}>🔥</span>
        <span>{wallet.streak}</span>
      </div>
```

In `CoinPurse.module.css` add `.streak` styled like `.purse` but smaller, `filter: grayscale(1); opacity: 0.6` by default, and `.lit` resetting both. Match `.purse`'s existing font and colours.

- [ ] **Step 7: StudyDesk overlay.** `components/StudyDesk.tsx`:

```tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { bus } from '@/game/bus';
import { sfx } from '@/game/audio/sfx';
import { useVault } from '@/lib/vault/open';
import { loadHouseCards } from '@/lib/houseCards';
import { MIN_CARDS, buildQuiz, isRight, passed, shuffle, type Question } from '@/lib/quiz';
import { studyPassed } from '@/lib/walletStore';
import type { Card } from '@/lib/flashcards';
import type { House } from '@/lib/types';
import styles from './StudyDesk.module.css';

type Mode = 'flashcards' | 'quiz';
const ALL = '';

const stopKeys = (e: React.KeyboardEvent) => e.stopPropagation();

// Opened from a desk (InteriorScene): flashcards or a quiz made from every note in the house.
export default function StudyDesk() {
  const { vault } = useVault();
  const [open, setOpen] = useState<{ houseId: string; mode: Mode } | null>(null);
  const [data, setData] = useState<{ house: House; cards: Card[] } | null>(null);
  const [room, setRoom] = useState(ALL);
  const [round, setRound] = useState(0);

  useEffect(() => {
    const onOpen = (o: { houseId: string; mode: Mode }) => {
      setOpen(o);
      setData(null);
      setRoom(ALL);
      setRound((r) => r + 1);
      sfx('pageOpen');
    };
    bus.on('open-study', onOpen);
    return () => bus.off('open-study', onOpen);
  }, []);

  useEffect(() => {
    if (!open || !vault) return;
    let live = true;
    loadHouseCards(vault, open.houseId).then((d) => live && setData(d));
    return () => { live = false; };
  }, [open, vault]);

  const close = () => {
    setOpen(null);
    sfx('pageClose');
    bus.emit('close-study', undefined);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const cards = useMemo(() => (data ? data.cards.filter((c) => room === ALL || c.roomId === room) : []), [data, room]);
  const rooms = useMemo(() => (data ? data.house.rooms.filter((r) => data.cards.some((c) => c.roomId === r.id)) : []), [data]);

  if (!open) return null;

  return (
    <div className={styles.screen} onClick={close}>
      <div className={styles.desk} onClick={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <span className={styles.title}>{open.mode === 'quiz' ? 'Quiz' : 'Flashcards'}: {data?.house.name ?? '…'}</span>
          {rooms.length > 1 && (
            <select className={styles.select} value={room} onChange={(e) => { setRoom(e.target.value); setRound((r) => r + 1); }} onKeyDown={stopKeys}>
              <option value={ALL}>Whole house</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          )}
          <button className={styles.close} onClick={close} aria-label="Close">×</button>
        </header>
        {!data ? (
          <p className={styles.hint}>Gathering your notes…</p>
        ) : cards.length < MIN_CARDS ? (
          <NeedCards count={cards.length} />
        ) : open.mode === 'flashcards' ? (
          <Flashcards key={round} cards={cards} houseId={open.houseId} onDone={close} />
        ) : (
          <Quiz key={round} cards={cards} houseId={open.houseId} onDone={close} />
        )}
      </div>
    </div>
  );
}

function NeedCards({ count }: { count: number }) {
  return (
    <div className={styles.help}>
      <p>{count === 0 ? 'No study cards in this house yet.' : `Only ${count} study card${count === 1 ? '' : 's'} here. A desk needs ${MIN_CARDS}.`}</p>
      <p>Write lines like these in any note in this house:</p>
      <pre className={styles.example}>{'Mitosis :: cell division\n- Osmosis: water crossing a membrane\nQ: What makes ATP?\nA: The mitochondria\nThe ==nucleus== holds the DNA.'}</pre>
    </div>
  );
}

```

`Flashcards` and `Quiz` take a `houseId` prop (passed from `StudyDesk`'s `open.houseId`) and hand it to `SourceLink` (below).

Flashcards and Quiz in the same file:

```tsx
function Flashcards({ cards, houseId, onDone }: { cards: Card[]; houseId: string; onDone: () => void }) {
  const [deck, setDeck] = useState(() => shuffle(cards));
  const [flipped, setFlipped] = useState(false);
  const [agains, setAgains] = useState(0);
  const card = deck[0];

  const flip = () => { setFlipped((f) => !f); sfx('open'); };
  const again = () => { setDeck(([c, ...rest]) => [...rest, c]); setAgains((n) => n + 1); setFlipped(false); sfx('close'); };
  const gotIt = () => { setDeck(([, ...rest]) => rest); setFlipped(false); sfx('select'); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!card) return;
      if (e.key === ' ' || e.key === 'Enter') flip();
      else if (e.key === 'ArrowLeft' && flipped) again();
      else if (e.key === 'ArrowRight' && flipped) gotIt();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  if (!card) {
    return (
      <div className={styles.result}>
        <p>All {cards.length} cards done{agains ? `, ${agains} again${agains === 1 ? '' : 's'}` : ' first try'}!</p>
        <button className={styles.button} onClick={onDone}>Close</button>
      </div>
    );
  }
  return (
    <div className={styles.flashcards}>
      <p className={styles.count}>{deck.length} left</p>
      <button className={`${styles.card} ${flipped ? styles.flipped : ''}`} onClick={flip}>
        <span className={styles.face}>{flipped ? card.back : card.front}</span>
        <span className={styles.side}>{flipped ? 'answer' : card.kind === 'cloze' ? 'fill the blank' : 'question'}</span>
      </button>
      <p className={styles.source}>from <SourceLink card={card} houseId={houseId} /></p>
      {flipped ? (
        <div className={styles.row}>
          <button className={styles.button} onClick={again}>← Again</button>
          <button className={styles.button} onClick={gotIt}>Got it →</button>
        </div>
      ) : (
        <p className={styles.hint}>Space flips the card</p>
      )}
    </div>
  );
}

function Quiz({ cards, houseId, onDone }: { cards: Card[]; houseId: string; onDone: () => void }) {
  const [questions] = useState<Question[]>(() => buildQuiz(cards));
  const [i, setI] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [picked, setPicked] = useState<{ given: number | string; right: boolean } | null>(null);
  const [typed, setTyped] = useState('');
  const [reward, setReward] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const q = questions[i];

  useEffect(() => { if (q?.kind === 'type' && !picked) inputRef.current?.focus(); }, [q, picked]);

  const answer = (given: number | string) => {
    if (picked || !q) return;
    const right = isRight(q, given);
    setPicked({ given, right });
    if (right) setCorrect((n) => n + 1);
    sfx(right ? 'select' : 'error');
  };

  const next = () => {
    setPicked(null);
    setTyped('');
    if (i + 1 < questions.length) {
      setI(i + 1);
      return;
    }
    setI(questions.length);
    const total = questions.length;
    const score = correct;
    setReward(passed(score, total) ? studyPassed() : null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!q) return;
      if (picked && (e.key === 'Enter' || e.key === ' ')) next();
      else if (!picked && q.kind === 'choice' && ['1', '2', '3', '4'].includes(e.key)) answer(Number(e.key) - 1);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  if (!q) {
    const total = questions.length;
    const ok = passed(correct, total);
    return (
      <div className={styles.result}>
        <p className={styles.score}>{correct} / {total}</p>
        <p>{ok ? (reward ? `Passed! +${reward} coins for studying today.` : 'Passed! Today\u2019s study reward is already yours.') : 'Not quite: 70% passes. Try again?'}</p>
        <div className={styles.row}>
          <button className={styles.button} onClick={onDone}>Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.quiz}>
      <p className={styles.count}>Question {i + 1} of {questions.length}</p>
      <p className={styles.prompt}>{q.prompt}</p>
      {q.kind === 'type' && <p className={styles.hint}>{q.card.kind === 'cloze' ? 'Fill in the blank' : 'Which term is this?'}</p>}
      {q.kind === 'choice' ? (
        <ol className={styles.options}>
          {q.options.map((o, n) => (
            <li key={n}>
              <button
                className={`${styles.option} ${picked && n === q.answer ? styles.right : ''} ${picked && n === picked.given && !picked.right ? styles.wrong : ''}`}
                onClick={() => answer(n)}
              >
                <kbd>{n + 1}</kbd> {o}
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); if (!picked && typed.trim()) answer(typed); }}>
          <input ref={inputRef} className={styles.input} value={typed} disabled={!!picked} onChange={(e) => setTyped(e.target.value)} onKeyDown={stopKeys} onKeyUp={stopKeys} />
        </form>
      )}
      {picked && (
        <div className={styles.feedback}>
          <p>{picked.right ? 'Right!' : `Answer: ${q.kind === 'choice' ? q.options[q.answer] : q.answer}`}</p>
          <p className={styles.source}>from <SourceLink card={q.card} houseId={houseId} /></p>
          <button className={styles.button} onClick={next}>{i + 1 < questions.length ? 'Next' : 'Finish'} ↵</button>
        </div>
      )}
    </div>
  );
}
```

`SourceLink` is a small button that closes the desk and fast-travels to the note: it needs the house id, so pass `houseId` from `StudyDesk` → `Flashcards`/`Quiz` → `SourceLink`:

```tsx
function SourceLink({ card, houseId }: { card: Card; houseId: string }) {
  return (
    <button
      className={styles.link}
      onClick={() => {
        bus.emit('close-study', undefined);
        bus.emit('fast-travel', { houseId, roomId: card.roomId, noteId: card.noteId });
      }}
    >
      {card.noteTitle}
    </button>
  );
}
```

`StudyDesk` also listens for `fast-travel` and sets `open` to null, so following a source link closes it.

Note on `next()`: `correct` is read from state after the last answer was recorded in a previous render, so the final count is right; the reward call must happen once, so guard it with the `reward`/`i === questions.length` transition as written (no effect hook).

`components/StudyDesk.module.css`: a fixed full-screen dimmer (`.screen`, z-index matching `Wardrobe.module.css`'s `.screen`), a centred `.desk` panel ~min(720px, 92vw) using the note reader's cream paper colours (`#f6e7c8` paper, `#3f2832` ink, 3px ink border, the pixel shadow `0 6px 0 rgba(24,20,37,0.35)`), `.card` a 3:2 button with a large centred `.face`, `.options` a vertical list of full-width `.option` buttons, `.right` green (`#4f9a5b`) and `.wrong` red (`#b8434f`) backgrounds with white text, `.example` a monospace block. Font: `'CuteFantasy', serif` for body text (ArcadeClassic has no punctuation).

- [ ] **Step 8: Mount** `<StudyDesk />` in `app/page.tsx` next to `<Wardrobe />`.

- [ ] **Step 9: Verify.** `npm test`, `npx tsc --noEmit`, `npm run lint` (if configured), then `npm run dev` and in the demo town walk to a room's desk: Space → menu with Read note / Flashcards / Quiz. Both modes work; a house with few cards shows the help.

- [ ] **Step 10: Commit** in two commits:
  1. `git add lib/types.ts lib/catalog.ts lib/catalog.test.mts scripts/draw-tech.py public/art/tech.png game/scenes/BootScene.ts && git commit -m "Draw and catalogue a desktop computer, laptop, computer desk, TV console and arcade cabinet"`
  2. `git add game/bus.ts game/scenes/InteriorScene.ts components/StudyDesk.tsx components/StudyDesk.module.css components/CoinPurse.tsx components/CoinPurse.module.css app/page.tsx && git commit -m "Study at a desk: flashcards and a quiz from the house's notes, with a streak badge by the purse"`

---

### Task 7: The productivity computer

**Files:**
- Create: `components/Computer.tsx`, `components/Computer.module.css`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `parseTarget`, `blockedBy`, `normalizeDomain`, `DEFAULT_BLOCKLIST`, `ENGINES`, `Engine` (Task 3); `buildIndex`, `searchIndex`, `Destination` (Task 5); `readPref`, `writePref` (Task 5); bus `open-computer` / `close-computer` (Task 6).

- [ ] **Step 1: Implement** `components/Computer.tsx`:

```tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { bus } from '@/game/bus';
import { sfx } from '@/game/audio/sfx';
import { useVault } from '@/lib/vault/open';
import { buildIndex, searchIndex, type Destination } from '@/lib/noteSearch';
import { DEFAULT_BLOCKLIST, ENGINES, blockedBy, normalizeDomain, parseTarget, type Engine } from '@/lib/blocklist';
import { readPref, writePref } from '@/lib/vaultPrefs';
import styles from './Computer.module.css';

const MAX_HITS = 6;
const PREF = 'blocklist';
const stopKeys = (e: React.KeyboardEvent) => e.stopPropagation();

type Screen = { kind: 'browser' } | { kind: 'blocked'; site: string } | { kind: 'settings' };

// Opened from a computer (InteriorScene): search your notes first, the web second, and never
// the sites on the blocklist. Web pages open in a new tab (Google refuses to load in a frame).
export default function Computer() {
  const { vault } = useVault();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [screen, setScreen] = useState<Screen>({ kind: 'browser' });
  const [list, setList] = useState<string[]>(DEFAULT_BLOCKLIST);
  const [adding, setAdding] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onOpen = () => {
      setOpen(true);
      setQuery('');
      setActive(0);
      setScreen({ kind: 'browser' });
      setList(readPref(PREF, DEFAULT_BLOCKLIST));
      sfx('open');
    };
    bus.on('open-computer', onOpen);
    return () => bus.off('open-computer', onOpen);
  }, []);

  useEffect(() => { if (open && screen.kind === 'browser') inputRef.current?.focus(); }, [open, screen]);

  const index = useMemo(() => (vault ? buildIndex(vault.world) : []), [vault]);
  const hits = useMemo(() => searchIndex(index, query, MAX_HITS).filter((d) => d.kind === 'note'), [index, query]);

  const close = () => {
    setOpen(false);
    sfx('close');
    bus.emit('close-computer', undefined);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      if (screen.kind !== 'browser') setScreen({ kind: 'browser' });
      else close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const saveList = (next: string[]) => {
    setList(next);
    writePref(PREF, next);
  };

  // Checks the typed text and the page it would open, so a blocked engine is blocked too.
  const go = (url: string, typed: string) => {
    const target = parseTarget(typed);
    const site = (target && blockedBy(target, list)) || blockedBy({ kind: 'url', url, host: new URL(url).hostname }, list);
    if (site) {
      sfx('error');
      setScreen({ kind: 'blocked', site });
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const searchWeb = (engine: Engine = 'google') => {
    const text = query.trim();
    if (!text) {
      go(ENGINES[engine].home, '');
      return;
    }
    const target = parseTarget(text);
    if (engine === 'google' && target?.kind === 'url') go(target.url, text);
    else go(ENGINES[engine].search(text), text);
  };

  const travel = (d: Destination) => {
    if (d.kind !== 'note') return;
    setOpen(false);
    bus.emit('close-computer', undefined);
    bus.emit('fast-travel', { houseId: d.houseId, roomId: d.roomId, noteId: d.note.id });
  };

  if (!open) return null;

  return (
    <div className={styles.screen} onClick={close}>
      <div className={styles.monitor} onClick={(e) => e.stopPropagation()}>
        <div className={styles.glass}>
          {screen.kind === 'blocked' ? (
            <div className={styles.blocked}>
              <p className={styles.big}>Back to work!</p>
              <p>{screen.site} is on your blocklist.</p>
              <button className={styles.button} onClick={() => setScreen({ kind: 'browser' })}>Back to the desktop</button>
            </div>
          ) : screen.kind === 'settings' ? (
            <div className={styles.settings}>
              <p className={styles.big}>Blocked sites</p>
              <p className={styles.note}>The computer won&rsquo;t open these. It can&rsquo;t block them elsewhere in your browser.</p>
              <ul className={styles.sites}>
                {list.map((d) => (
                  <li key={d}>
                    <span>{d}</span>
                    <button className={styles.small} onClick={() => saveList(list.filter((x) => x !== d))}>Remove</button>
                  </li>
                ))}
              </ul>
              <form
                className={styles.row}
                onSubmit={(e) => {
                  e.preventDefault();
                  const d = normalizeDomain(adding);
                  if (d && !list.includes(d)) saveList([...list, d]);
                  setAdding('');
                }}
              >
                <input className={styles.input} placeholder="site.com" value={adding} onChange={(e) => setAdding(e.target.value)} onKeyDown={stopKeys} onKeyUp={stopKeys} />
                <button className={styles.button} type="submit">Block</button>
              </form>
              <div className={styles.row}>
                <button className={styles.small} onClick={() => saveList(DEFAULT_BLOCKLIST)}>Reset to defaults</button>
                <button className={styles.button} onClick={() => setScreen({ kind: 'browser' })}>Done</button>
              </div>
            </div>
          ) : (
            <div className={styles.browser}>
              <div className={styles.titlebar}>
                <span>NoteNet</span>
                <span className={styles.icons}>
                  <button className={styles.small} onClick={() => setScreen({ kind: 'settings' })}>⚙ Blocklist</button>
                  <button className={styles.small} onClick={close} aria-label="Close">×</button>
                </span>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (hits[active]) travel(hits[active]);
                  else searchWeb('google');
                }}
              >
                <input
                  ref={inputRef}
                  className={styles.search}
                  placeholder="Search your notes or the web"
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setActive(0); }}
                  onKeyDown={(e) => {
                    stopKeys(e);
                    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length)); }
                    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                  }}
                  onKeyUp={stopKeys}
                />
              </form>
              <div className={styles.bookmarks}>
                {(Object.keys(ENGINES) as Engine[]).map((e) => (
                  <button key={e} className={styles.bookmark} onClick={() => searchWeb(e)}>{ENGINES[e].name}</button>
                ))}
              </div>
              {query.trim() && (
                <ul className={styles.results}>
                  {hits.map((d, i) => (
                    <li key={d.key}>
                      <button className={`${styles.result} ${i === active ? styles.active : ''}`} onMouseEnter={() => setActive(i)} onClick={() => travel(d)}>
                        <span className={styles.resultTitle}>{d.title}</span>
                        <span className={styles.where}>{d.where}</span>
                      </button>
                    </li>
                  ))}
                  <li>
                    <button className={`${styles.result} ${active === hits.length ? styles.active : ''}`} onMouseEnter={() => setActive(hits.length)} onClick={() => searchWeb('google')}>
                      Search Google for &ldquo;{query.trim()}&rdquo;
                    </button>
                  </li>
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

`components/Computer.module.css`: `.screen` full-screen dimmer; `.monitor` a beige CRT bezel (`#e8dcc0` with `#c7b996` inner border, 24px thick, rounded 18px, the pixel drop shadow), width `min(760px, 94vw)`; `.glass` dark blue-black (`#10202b`) with a `repeating-linear-gradient` scanline overlay at 3px (via `::after`, `pointer-events: none`) and green-white text (`#d8f3dc`), monospace font; `.titlebar` a bar like an old OS window; `.search` a large input with an inset border; `.bookmarks` a row of icon-ish buttons; `.results`/`.result`/`.active` list rows (active = inverted colours); `.blocked .big` large red-amber `#ffb347` text; `.settings` list with `.small` buttons. Everything readable at 14–16 px.

- [ ] **Step 2: Mount** `<Computer />` in `app/page.tsx`.

- [ ] **Step 3: Verify** in the dev server: buy or place a laptop on a desk via CUSTOMIZE (the demo starts with 50 coins; the laptop costs 30), then: Space in front of the desk → *Use computer / Study* menu (plus *Read note*); `mitosis`-style vault search lists notes and Enter travels; `youtube cats` → Back to work! and no tab; Settings → remove youtube.com → `youtube cats` now opens Google; add `wikipedia.org` → the Wikipedia bookmark is blocked; Space typed in the search box doesn't move the player.

- [ ] **Step 4: Commit**: `git add components/Computer.tsx components/Computer.module.css app/page.tsx && git commit -m "Turn computers into a NoteNet browser that searches notes first and refuses blocked sites"`

---

### Task 8: The games console

**Files:**
- Create: `components/Arcade.tsx`, `components/Arcade.module.css`, `components/arcade/WordRain.tsx`, `components/arcade/Match.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `loadHouseCards` (Task 5), `shuffle` (Task 2), `readPref`/`writePref` (Task 5), bus `open-arcade`/`close-arcade`.
- Produces: `type GameProps = { cards: Card[]; best: number | null; onEnd: (score: number) => void }`, cartridges `{ id: 'word-rain' | 'match'; name: string; minCards: number; better: 'higher' | 'lower'; Game: (p: GameProps) => JSX.Element }`.

- [ ] **Step 1: Arcade shell** `components/Arcade.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { bus } from '@/game/bus';
import { sfx } from '@/game/audio/sfx';
import { useVault } from '@/lib/vault/open';
import { loadHouseCards } from '@/lib/houseCards';
import { readPref, writePref } from '@/lib/vaultPrefs';
import type { Card } from '@/lib/flashcards';
import WordRain from './arcade/WordRain';
import Match from './arcade/Match';
import styles from './Arcade.module.css';

export type GameProps = { cards: Card[]; best: number | null; onEnd: (score: number) => void };

const CARTRIDGES = [
  { id: 'word-rain', name: 'Word Rain', minCards: 4, better: 'higher', blurb: 'Type the falling term that matches the definition.', Game: WordRain },
  { id: 'match', name: 'Match', minCards: 8, better: 'lower', blurb: 'Flip tiles to pair each term with its definition. Fewest moves wins.', Game: Match },
] as const;
type CartridgeId = (typeof CARTRIDGES)[number]['id'];
type Scores = Record<string, number>;
const PREF = 'arcade';

// Opened from a TV console or arcade cabinet (InteriorScene). Just for fun: no coins, no streak.
export default function Arcade() {
  const { vault } = useVault();
  const [houseId, setHouseId] = useState<string | null>(null);
  const [cards, setCards] = useState<Card[] | null>(null);
  const [playing, setPlaying] = useState<CartridgeId | null>(null);
  const [cursor, setCursor] = useState(0);
  const [scores, setScores] = useState<Scores>({});
  const [last, setLast] = useState<{ id: CartridgeId; score: number; record: boolean } | null>(null);

  useEffect(() => {
    const onOpen = ({ houseId }: { houseId: string }) => {
      setHouseId(houseId);
      setCards(null);
      setPlaying(null);
      setLast(null);
      setCursor(0);
      setScores(readPref<Scores>(PREF, {}));
      sfx('open');
    };
    bus.on('open-arcade', onOpen);
    return () => bus.off('open-arcade', onOpen);
  }, []);

  useEffect(() => {
    if (!houseId || !vault) return;
    let live = true;
    loadHouseCards(vault, houseId).then((d) => live && setCards((d?.cards ?? []).filter((c) => c.kind === 'pair')));
    return () => { live = false; };
  }, [houseId, vault]);

  const close = () => {
    setHouseId(null);
    sfx('close');
    bus.emit('close-arcade', undefined);
  };

  const keyOf = (id: CartridgeId) => `${houseId}|${id}`;
  const playable = (c: (typeof CARTRIDGES)[number]) => (cards?.length ?? 0) >= c.minCards;

  const end = (id: CartridgeId, score: number) => {
    const cart = CARTRIDGES.find((c) => c.id === id)!;
    const best = scores[keyOf(id)];
    const record = best === undefined || (cart.better === 'higher' ? score > best : score < best);
    if (record) {
      const next = { ...scores, [keyOf(id)]: score };
      setScores(next);
      writePref(PREF, next);
    }
    setLast({ id, score, record });
    setPlaying(null);
    sfx(record ? 'coin' : 'select');
  };

  useEffect(() => {
    if (!houseId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (playing) setPlaying(null);
        else close();
      } else if (!playing && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        setCursor((c) => (c + 1) % CARTRIDGES.length);
      } else if (!playing && (e.key === 'Enter' || e.key === ' ')) {
        const cart = CARTRIDGES[cursor];
        if (playable(cart)) { setLast(null); setPlaying(cart.id); }
      } else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  if (!houseId) return null;
  const cart = CARTRIDGES.find((c) => c.id === playing);

  return (
    <div className={styles.screen} onClick={close}>
      <div className={styles.tv} onClick={(e) => e.stopPropagation()}>
        <div className={styles.glass}>
          {!cards ? (
            <p className={styles.blink}>Loading…</p>
          ) : cart ? (
            <cart.Game cards={cards} best={scores[keyOf(cart.id)] ?? null} onEnd={(s) => end(cart.id, s)} />
          ) : (
            <div className={styles.menu}>
              <p className={styles.logo}>NOTEKEEP ARCADE</p>
              {last && <p className={styles.last}>{last.record ? 'New record! ' : ''}Score: {last.score}</p>}
              <ul>
                {CARTRIDGES.map((c, i) => (
                  <li key={c.id}>
                    <button
                      className={`${styles.cart} ${i === cursor ? styles.current : ''}`}
                      disabled={!playable(c)}
                      onMouseEnter={() => setCursor(i)}
                      onClick={() => { setLast(null); setPlaying(c.id); }}
                    >
                      <span className={styles.cartName}>{c.name}</span>
                      <span className={styles.blurb}>{playable(c) ? c.blurb : `Needs ${c.minCards} cards (term :: definition lines) in this house; it has ${cards.length}.`}</span>
                      {scores[keyOf(c.id)] !== undefined && <span className={styles.best}>Best: {scores[keyOf(c.id)]}</span>}
                    </button>
                  </li>
                ))}
              </ul>
              <p className={styles.hint}>↑↓ choose · Enter play · Esc leave</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Word Rain** `components/arcade/WordRain.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { sfx } from '@/game/audio/sfx';
import { normalizeAnswer, shuffle } from '@/lib/quiz';
import type { GameProps } from '../Arcade';
import styles from '../Arcade.module.css';

const LIVES = 3;
const START_SECONDS = 9;
const SPEEDUP = 0.92;

type Round = { definition: string; answer: string; terms: string[] };

function makeRound(cards: GameProps['cards']): Round {
  const [card, ...others] = shuffle(cards);
  const wrong = shuffle(others.filter((c) => c.front.toLowerCase() !== card.front.toLowerCase())).slice(0, 3).map((c) => c.front);
  return { definition: card.back, answer: card.front, terms: shuffle([card.front, ...wrong]) };
}

// A definition sits at the bottom; four terms fall. Type the right one before it lands.
export default function WordRain({ cards, best, onEnd }: GameProps) {
  const [round, setRound] = useState(() => makeRound(cards));
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(LIVES);
  const [typed, setTyped] = useState('');
  const [progress, setProgress] = useState(0);
  const [flash, setFlash] = useState<'right' | 'wrong' | null>(null);
  const seconds = useRef(START_SECONDS);
  const started = useRef(performance.now());
  const inputRef = useRef<HTMLInputElement>(null);

  const nextRound = () => {
    setRound(makeRound(cards));
    setTyped('');
    setProgress(0);
    started.current = performance.now();
  };

  const miss = () => {
    sfx('error');
    setFlash('wrong');
    setLives((l) => {
      if (l - 1 <= 0) onEnd(score);
      return l - 1;
    });
    nextRound();
  };

  useEffect(() => {
    inputRef.current?.focus();
    let raf = 0;
    const tick = (now: number) => {
      if (!document.hidden) {
        const p = (now - started.current) / (seconds.current * 1000);
        if (p >= 1) miss();
        else setProgress(p);
      } else started.current = now - progress * seconds.current * 1000;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 300);
    return () => clearTimeout(t);
  }, [flash]);

  const submit = () => {
    if (!typed.trim()) return;
    if (normalizeAnswer(typed) === normalizeAnswer(round.answer)) {
      sfx('select');
      setFlash('right');
      setScore((s) => s + 1);
      seconds.current *= SPEEDUP;
      nextRound();
    } else miss();
  };

  const stop = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape') e.stopPropagation();
  };

  return (
    <div className={`${styles.rain} ${flash ? styles[flash] : ''}`}>
      <div className={styles.hud}>
        <span>Score {score}</span>
        <span>{'♥'.repeat(lives)}{'♡'.repeat(LIVES - lives)}</span>
        <span>Best {best ?? '–'}</span>
      </div>
      <div className={styles.sky}>
        {round.terms.map((t, i) => (
          <span key={`${t}-${i}`} className={styles.drop} style={{ left: `${8 + i * 23}%`, top: `${progress * 88}%` }}>{t}</span>
        ))}
      </div>
      <p className={styles.definition}>{round.definition}</p>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <input ref={inputRef} className={styles.input} value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={stop} onKeyUp={stop} placeholder="type the term, Enter" />
      </form>
    </div>
  );
}
```

Caveats to handle while implementing: `miss()` is called from inside the rAF loop, so guard against firing twice for one landing (set `started.current = Infinity`-style sentinel, or compare a round id) and never call `onEnd` twice (keep an `ended` ref). The effect intentionally re-subscribes each render; if that causes jank, move the loop state into refs and depend on `[]`.

- [ ] **Step 3: Match** `components/arcade/Match.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { sfx } from '@/game/audio/sfx';
import { shuffle } from '@/lib/quiz';
import type { GameProps } from '../Arcade';
import styles from '../Arcade.module.css';

const PAIRS = 8;
type Tile = { key: string; pair: string; text: string; side: 'term' | 'def' };

// Sixteen face-down tiles: eight terms, eight definitions. Fewest moves wins.
export default function Match({ cards, best, onEnd }: GameProps) {
  const [tiles] = useState<Tile[]>(() =>
    shuffle(
      shuffle(cards).slice(0, PAIRS).flatMap((c) => [
        { key: `${c.id}:t`, pair: c.id, text: c.front, side: 'term' as const },
        { key: `${c.id}:d`, pair: c.id, text: c.back, side: 'def' as const },
      ]),
    ),
  );
  const [up, setUp] = useState<number[]>([]);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [moves, setMoves] = useState(0);

  useEffect(() => {
    if (up.length !== 2) return;
    const [a, b] = up;
    const t = setTimeout(() => {
      if (tiles[a].pair === tiles[b].pair) {
        sfx('select');
        setDone((d) => new Set(d).add(tiles[a].pair));
      } else sfx('close');
      setUp([]);
    }, tiles[a].pair === tiles[b].pair ? 250 : 900);
    return () => clearTimeout(t);
  }, [up, tiles]);

  useEffect(() => {
    if (done.size === PAIRS) {
      const t = setTimeout(() => onEnd(moves), 600);
      return () => clearTimeout(t);
    }
  }, [done, moves, onEnd]);

  const flip = (i: number) => {
    if (up.length === 2 || up.includes(i) || done.has(tiles[i].pair)) return;
    sfx('open');
    if (up.length === 1) setMoves((m) => m + 1);
    setUp([...up, i]);
  };

  return (
    <div className={styles.match}>
      <div className={styles.hud}>
        <span>Moves {moves}</span>
        <span>{done.size}/{PAIRS}</span>
        <span>Best {best ?? '–'}</span>
      </div>
      <div className={styles.grid}>
        {tiles.map((t, i) => {
          const shown = up.includes(i) || done.has(t.pair);
          return (
            <button key={t.key} className={`${styles.tile} ${shown ? styles.shown : ''} ${done.has(t.pair) ? styles.matched : ''} ${styles[t.side]}`} onClick={() => flip(i)}>
              {shown ? t.text : '?'}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

`onEnd` from `Arcade` is a new closure every render; the `done` effect would re-run and restart its timeout on each render, harmless but wrap `end` in `useCallback` or keep an `ended` ref in `Match` so `onEnd` fires exactly once.

`components/Arcade.module.css`: `.screen` dimmer; `.tv` a dark plastic TV body (`#2c2c34`, 28px bezel, rounded 22px, pixel shadow) `min(820px, 94vw)`; `.glass` black-green `#0c1410` with scanlines (`::after`), text `#c8f7c5`, `aspect-ratio: 4 / 3`, monospace; `.logo` large yellow `#ffe066` with a text-shadow; `.cart`/`.current` cartridge rows; disabled carts at 0.45 opacity; `.sky` a relatively-positioned area ~60% of the glass height; `.drop` absolutely positioned terms in boxes; `.definition` a bottom banner; `.right`/`.wrong` flash the glass border green/red; `.grid` 4×4 CSS grid; `.tile` square-ish buttons with small text that can wrap, `.term` and `.def` tinted differently when shown, `.matched` dimmed with a check outline; `.blink` a steps() blink animation.

- [ ] **Step 4: Mount** `<Arcade />` in `app/page.tsx`.

- [ ] **Step 5: Verify** in the dev server: place a TV console via CUSTOMIZE (the demo grants 50 coins; it costs 60, so temporarily test in a house where `buy` succeeds, or use the headless check in Task 10 which places pieces through localStorage), open it, play both games to the end, see a best score; a house with too few cards shows greyed cartridges.

- [ ] **Step 6: Commit**: `git add components/Arcade.tsx components/Arcade.module.css components/arcade app/page.tsx && git commit -m "Play Word Rain and Match on TV consoles and arcade cabinets, using the house's study cards"`

---

### Task 9: Demo vault study material

**Files:**
- Modify: `lib/vault/demo.ts`

- [ ] **Step 1:** Add study lines to the Coursework notes so the Intro to CS house has ≥ 8 pair cards and the Calculus II house ≥ 4, written as natural note content:
  - `Coursework/Intro to CS/Big O Cheatsheet.md`: a "Complexities" list such as `- Binary search: O(log n)`, `- Merge sort: O(n log n)`, `- Hash map lookup: O(1) average`, `- Bubble sort: O(n²)`, `- Linear search: O(n)`.
  - `Coursework/Intro to CS/Recursion.md`: `Base case :: the input small enough to answer directly`, `Recursive case :: the step that calls the function on a smaller input`, `Stack overflow :: what happens when recursion never reaches its base case`, and a `Q:`/`A:` pair.
  - `Coursework/Calculus II/Series Convergence.md`: `Ratio test :: …`, `Integral test :: …`, `p-series :: converges when p > 1`, plus one `==highlight==` sentence.
  - `Coursework/Calculus II/Integration by Parts.md`: `LIATE :: the order for choosing u: logs, inverse trig, algebraic, trig, exponential`.
  Read each note first and keep its existing text; append these in matching style. Don't push any note under the 30-word reward line or change titles.

- [ ] **Step 2:** Quick check: a scratch script (in the scratchpad, not the repo) that imports `DEMO_FILES` and `extractCards` through `scripts/test-alias.mjs` and prints cards per house; confirm counts. Then `npm test`.

- [ ] **Step 3: Commit**: `git add lib/vault/demo.ts && git commit -m "Give the demo town's coursework notes flashcard lines to study"`

---

### Task 10: End-to-end check and review

- [ ] **Step 1:** `npm test`, `npx tsc --noEmit`, `npm run build`. All green.
- [ ] **Step 2:** Headless browser check against `npm run dev` with the demo town, the way earlier features were verified (Playwright script in the scratchpad; Phaser needs `fps.forceSetTimeOut`, already in config). Before entering a house, write a saved layout to localStorage for the Intro to CS entrance that adds `laptop` on the desk's back row and a `tv_console` on free floor (look up the key format in `lib/interiorStore.ts`). Then:
  1. Walk to the desk; Space; the menu lists *Read note*, *Use computer*, *Flashcards*, *Quiz*.
  2. Quiz: answer all correctly (read answers from the DOM), see the pass screen, the coin toast, the balance up by 5, and the 🔥 badge lit at 1.
  3. Flashcards: flip, Again, Got it through to the end.
  4. Computer: type `recursion` (Space in the box doesn't move the player), Enter travels to the note; reopen; `youtube cats` shows Back to work! and `window.open` is never called (stub it); remove youtube.com in Settings, then the same search calls `window.open` with a google.com URL.
  5. TV: Play Word Rain to game over (type wrong three times), Match by reading tile pairs from the DOM; the best score shows on the menu.
  6. Escape closes each overlay and the player can walk again immediately; Space after closing doesn't reopen.
  Screenshot each overlay into the scratchpad and look at them.
- [ ] **Step 3:** One whole-branch review pass (fresh reviewer, most capable model) against the spec and this plan; fix what it finds; commit fixes with specific titles.
- [ ] **Step 4:** Update the spec only where the build intentionally differs (pair-card typing fallback asks for the term; no house-card cache; demo room tech pieces come from the catalogue rather than the default layout) and commit: `Note where furniture functions differ from the first spec`.
