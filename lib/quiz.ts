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
