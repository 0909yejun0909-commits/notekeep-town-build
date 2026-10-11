import { DEMO_VAULT_NAME } from './vault/demo';

// What the town's NPCs can do with your notes: sum them up, and quiz you on them.
export type QuizQuestion = { question: string; choices: string[]; answer: number; why: string };
export type NpcHelp = { greeting: string; summary: string[]; quiz: QuizQuestion[] };

// A conversation is a run of pages: a line, and either choices or a way on.
export type NpcOption = { label: string; pick: () => void };
export type NpcPage = { line: string; options?: NpcOption[]; next?: () => void };

// The tutorial town's notes never change, so its NPCs' answers are written out here. A real
// vault's would come from a model (not wired up yet), which is why this is behind helpFor().
const TUTORIAL_GREETING: Record<string, string> = {
  farmer_bob: "Heard you've been buried in your notes. I've read every one of them: want a recap, or a quick quiz?",
  bartender_katy: 'Welcome in! I hear everything in this town, notes included. Recap, or a quiz?',
};

const TUTORIAL_SUMMARY = [
  'Here are your notes in a nutshell. Three neighbourhoods: Robotics, Coursework and Personal.',
  "Robotics: you're building a 4-joint desk arm on an ESP32. The servos are ordered and get their own power rail; next up is the shoulder bracket and printing the base.",
  'Your line follower runs on five reflectance sensors. Best lap so far is 14.2 s, with Kp 0.7 and Kd 0.2, and Ki barely matters on that track.',
  'Coursework: Calculus II is series convergence tests and integration by parts (pick u by LIATE). Intro to CS covers recursion, Big O and a linked-list lab.',
  "Personal: you've been up past 2 am too often, but the first servo moving on command made your week. Your ideas include this very town, and there's a one-pan kimchi fried rice for busy nights.",
];

const TUTORIAL_QUIZ: QuizQuestion[] = [
  {
    question: 'When is the ratio test inconclusive?',
    choices: ['When the limit is 0', 'When the limit is exactly 1', 'When the terms alternate in sign'],
    answer: 1,
    why: 'From Series Convergence.',
  },
  {
    question: "Why do the arm's servos get their own power rail?",
    choices: ['Sharing the ESP32\'s rail caused brownouts', 'The servos need 12 V', 'It saves battery'],
    answer: 0,
    why: 'From Servo Notes.',
  },
  {
    question: "Which settings gave the line follower's best lap?",
    choices: ['Kp 0.8, Kd 0', 'Kp 0.6, Kd 0.15', 'Kp 0.7, Kd 0.2, Ki 0.001'],
    answer: 2,
    why: 'From PID Tuning: 14.2 s.',
  },
  {
    question: 'What is the Big O of binary search?',
    choices: ['O(n)', 'O(log n)', 'O(1)'],
    answer: 1,
    why: 'From the Big O Cheatsheet.',
  },
  {
    question: 'Choosing u for integration by parts, which kind of function comes first in LIATE?',
    choices: ['Logarithmic', 'Trigonometric', 'Exponential'],
    answer: 0,
    why: 'From Integration by Parts.',
  },
];

// Null: this NPC just says hello. Only the tutorial town's NPCs help, for now.
export function helpFor(npcId: string, worldName: string | undefined): NpcHelp | null {
  if (worldName !== DEMO_VAULT_NAME) return null;
  return {
    greeting: TUTORIAL_GREETING[npcId] ?? TUTORIAL_GREETING.farmer_bob,
    summary: TUTORIAL_SUMMARY,
    quiz: TUTORIAL_QUIZ,
  };
}

// The conversation: a menu, the summary page by page, or the quiz a question at a time. Each
// page is handed to `say`; `end` closes the conversation.
export function conversation(help: NpcHelp, say: (page: NpcPage) => void, end: () => void): NpcPage {
  const again = () => say(menu('Anything else?'));
  const menu = (line: string): NpcPage => ({
    line,
    options: [
      { label: 'Sum up my notes', pick: () => recap(0) },
      { label: 'Quiz me', pick: () => ask(0, 0) },
      { label: 'Bye', pick: end },
    ],
  });
  const recap = (i: number) => say({ line: help.summary[i], next: i + 1 < help.summary.length ? () => recap(i + 1) : again });
  const ask = (i: number, right: number) => {
    const quiz = help.quiz;
    if (i === quiz.length) {
      const verdict = right === quiz.length ? 'Perfect!' : right >= quiz.length / 2 ? 'Not bad!' : 'Worth another read.';
      return say({ line: `You got ${right} of ${quiz.length}. ${verdict} Every answer is in your notes.`, next: again });
    }
    const q = quiz[i];
    say({
      line: q.question,
      options: q.choices.map((choice, k) => ({
        label: choice,
        pick: () => say({
          line: k === q.answer ? `Right! ${q.why}` : `Not quite: it's "${q.choices[q.answer]}". ${q.why}`,
          next: () => ask(i + 1, right + (k === q.answer ? 1 : 0)),
        }),
      })),
    });
  };
  return menu(help.greeting);
}
