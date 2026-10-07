import type { TownBiome } from './types';
import type { Track } from './music';

export type Place = 'title' | TownBiome | 'indoors';

type Chord = { root: string; fifth: string; tones: string[] };
// A bar holds one chord, or two that split it.
type Bar = string | [string, string];
type Fill = (c: Chord, steps: number) => string;

const chord = (root: string, fifth: string, ...tones: string[]): Chord => ({ root, fifth, tones });

function accomp(chords: Record<string, Chord>, bars: Bar[], barSteps: number, fill: Fill): string {
  return bars
    .map((b) => (typeof b === 'string' ? fill(chords[b], barSteps) : b.map((n) => fill(chords[n], barSteps / 2)).join(' ')))
    .join(' | ');
}

const cycle = (order: number[]): Fill => (c, s) => Array.from({ length: s }, (_, i) => c.tones[order[i % order.length]]).join(' ');

const walkingBass: Fill = (c, s) => Array.from({ length: s / 2 }, (_, i) => `${i % 2 ? c.fifth : c.root}*2`).join(' ');
const halfBass: Fill = (c, s) => `${c.root}*${s / 2} ${c.fifth}*${s / 2}`;
const heldBass: Fill = (c, s) => `${c.root}*${s}`;
const hold: Fill = (c, s) => `${c.tones.join('+')}*${s}`;
const arp = cycle([0, 1, 2, 1]);
const alberti = cycle([0, 2, 1, 2]);
const tresilloBass: Fill = (c, s) => Array.from({ length: s }, (_, i) => [c.root, '.', c.root, c.fifth][i % 4]).join(' ');
const waltzBass: Fill = (c, s) => `${c.root}*${s / 3} .*${s - s / 3}`;
const waltzStab: Fill = (c, s) => {
  const k = s / 3;
  return `.*${k} ${c.tones.join('+')}*${k} ${c.tones.join('+')}*${k}`;
};

const rest = (bars: number, barSteps: number) => `.*${bars * barSteps}`;
const tune = (...bars: string[]) => bars.join(' | ');

// Forest: bright and pastoral, G major. A A' B A'.
const FOREST_CHORDS = {
  G: chord('G2', 'D3', 'G3', 'B3', 'D4'),
  Em: chord('E2', 'B2', 'E3', 'G3', 'B3'),
  C: chord('C3', 'G2', 'C3', 'E3', 'G3'),
  D: chord('D3', 'A2', 'D3', 'F#3', 'A3'),
  Am: chord('A2', 'E3', 'A3', 'C4', 'E4'),
};
const FOREST_A_HEAD = ['B4*2 D5*2 G5*3 F#5', 'E5*2 D5*2 B4*4', 'C5*2 E5*2 G5*2 E5*2', 'D5*6 .*2'];
const FOREST_A = tune(...FOREST_A_HEAD, 'B4*2 D5*2 G5*2 A5*2', 'B5*2 A5*2 G5*2 E5*2', 'E5*2 G5*2 F#5*2 A5*2', 'G5*6 .*2');
const FOREST_A2 = tune(...FOREST_A_HEAD, 'D5*2 G5*2 B5*3 A5', 'G5*2 E5*2 B4*4', 'C5*2 E5*2 D5*2 F#5*2', 'G5*8');
const FOREST_B = tune(
  'E5*3 F#5 G5*2 E5*2', 'G5*3 A5 G5*2 E5*2', 'D5*3 E5 D5*2 B4*2', 'A4*2 B4*2 C5*2 D5*2',
  'E5*3 F#5 G5*2 B5*2', 'C6*3 B5 A5*2 G5*2', 'A5*2 G5*2 E5*2 C5*2', 'D5*4 F#5*2 A5*2',
);
const FOREST_A_BARS: Bar[] = ['G', 'Em', 'C', 'D', 'G', 'Em', ['C', 'D'], 'G'];
const FOREST_B_BARS: Bar[] = ['Em', 'C', 'G', 'D', 'Em', 'C', 'Am', 'D'];
const FOREST_BARS = [...FOREST_A_BARS, ...FOREST_A_BARS, ...FOREST_B_BARS, ...FOREST_A_BARS];

// Snow: slow bells over a soft pad, F major.
const SNOW_CHORDS = {
  F: chord('F2', 'C3', 'F3', 'A3', 'C4', 'E4'),
  Am: chord('A2', 'E3', 'A3', 'C4', 'E4'),
  Bb: chord('Bb2', 'F3', 'Bb3', 'D4', 'F4'),
  C: chord('C3', 'G2', 'G3', 'C4', 'E4'),
  Dm: chord('D3', 'A2', 'A3', 'D4', 'F4'),
};
const SNOW_BARS: Bar[] = ['F', 'Am', 'Bb', 'C', 'Dm', 'Am', 'Bb', 'C', 'F', 'Am', 'Bb', 'C', 'Dm', 'Bb', 'C', 'F'];
const SNOW_MELODY = tune(
  'A5*4 C6*2 A5*2', 'E5*4 .*2 C5*2', 'D5*2 F5*2 Bb5*4', 'G5*6 .*2',
  'F5*2 A5*2 D6*4', 'C6*2 A5*2 E5*4', 'F5*2 D5*2 Bb4*2 D5*2', 'E5*4 G5*2 E5*2',
  'C6*2 A5*2 F5*2 A5*2', 'E6*4 C6*4', 'D6*2 C6*2 Bb5*2 A5*2', 'G5*4 E5*4',
  'F5*2 E5*2 D5*2 F5*2', 'D5*2 F5*2 Bb5*4', 'C6*2 Bb5*2 G5*2 E5*2', 'F5*8',
);

// Desert: a plucky A Phrygian-dominant tune over a hand-drum tresillo. A B A, the B on a
// brighter lead.
const DESERT_CHORDS = {
  A: chord('A2', 'E3'),
  Bb: chord('Bb2', 'F3'),
  Gm: chord('G2', 'D3'),
  F: chord('F2', 'C3'),
};
const DESERT_A = tune(
  'E5 F5 E5 D5 C#5*2 D5 E5', 'F5*2 D5 F5 Bb5*2 A5*2', 'A5 G5 F5 E5 F5*2 E5*2', 'D5*2 Bb4*2 G4*2 .*2',
  'E5 F5 E5 D5 C#5 D5 E5 F5', 'F5*2 G5 F5 D5*2 Bb4*2', 'G4 Bb4 D5 G5 F5*2 E5*2', 'A4*6 .*2',
);
const DESERT_B = tune(
  'A5*3 Bb5 A5*2 G5*2', 'F5*3 G5 F5*2 E5*2', 'F5*2 A5*2 C6*2 A5*2', 'E5*6 .*2',
  'A5*3 Bb5 C#6*2 A5*2', 'Bb5*2 A5*2 G5*2 F5*2', 'F5 G5 F5 D5 Bb4*2 D5*2', 'C#5*2 E5*2 A5*4',
);
const DESERT_A_BARS: Bar[] = ['A', 'Bb', 'A', 'Gm', 'A', 'Bb', 'Gm', 'A'];
const DESERT_B_BARS: Bar[] = ['A', 'Gm', 'F', 'A', 'A', 'Gm', 'Bb', 'A'];

// Indoors: a music box over a plucked Alberti bass, C major.
const INDOORS_CHORDS = {
  C: chord('C2', 'G2', 'C3', 'E3', 'G3'),
  Am: chord('A1', 'E2', 'A2', 'C3', 'E3'),
  F: chord('F1', 'C2', 'F2', 'A2', 'C3'),
  G: chord('G1', 'D2', 'G2', 'B2', 'D3'),
  Dm: chord('D2', 'A2', 'D3', 'F3', 'A3'),
  Em: chord('E2', 'B2', 'E3', 'G3', 'B3'),
};
const INDOORS_BARS: Bar[] = ['C', 'Am', 'F', 'G', 'C', 'Am', ['Dm', 'G'], 'C', 'F', 'G', 'Em', 'Am', 'F', 'G', 'C', 'G'];
const INDOORS_MELODY = tune(
  'E5*2 G5*2 C6*2 G5*2', 'A5*2 C6*2 E5*4', 'F5*2 A5*2 C6*2 A5*2', 'G5*4 D5*4',
  'E5*2 G5*2 C6*2 E6*2', 'D6*2 C6*2 A5*4', 'F5*2 A5*2 G5*2 B5*2', 'C6*6 .*2',
  'A5*2 C6*2 F6*2 C6*2', 'B5*2 D6*2 G5*4', 'G5*2 B5*2 E6*2 B5*2', 'C6*2 A5*2 E5*4',
  'F5*2 A5*2 C6*4', 'B5*2 G5*2 D5*4', 'E5*2 G5*2 C6*4', 'B4*2 D5*2 G5*2 F5*2',
);

// Title: a gentle waltz in D. A B A.
const TITLE_CHORDS = {
  D: chord('D3', 'A2', 'F#4', 'A4'),
  Bm: chord('B2', 'F#3', 'D4', 'F#4'),
  G: chord('G2', 'D3', 'B3', 'D4'),
  A: chord('A2', 'E3', 'C#4', 'E4'),
  Em: chord('E3', 'B2', 'G3', 'B3'),
  'F#m': chord('F#2', 'C#3', 'A3', 'C#4'),
};
const TITLE_A = tune(
  'F#5*4 E5 D5', 'F#5*2 D5*2 B4*2', 'G5*4 A5 B5', 'A5*4 E5*2',
  'F#5*4 E5 D5', 'B5*2 A5*2 F#5*2', 'G5*2 E5 C#5*2 E5', 'D5*6',
);
const TITLE_B = tune(
  'B5*3 A5 G5*2', 'C#6*3 B5 A5*2', 'A5*2 F#5*2 C#5*2', 'D5*4 F#5*2',
  'G5*3 F#5 E5*2', 'E5*2 A5*2 C#6*2', 'D6*4 A5*2', 'E5*2 C#5*2 A4*2',
);
const TITLE_A_BARS: Bar[] = ['D', 'Bm', 'G', 'A', 'D', 'Bm', ['Em', 'A'], 'D'];
const TITLE_B_BARS: Bar[] = ['G', 'A', 'F#m', 'Bm', 'Em', 'A', 'D', 'A'];
const TITLE_BARS = [...TITLE_A_BARS, ...TITLE_B_BARS, ...TITLE_A_BARS];

export const TRACKS: Record<Place, Track> = {
  title: {
    bpm: 96, div: 2, beats: 3,
    parts: [
      { voice: 'lead', gain: 0.5, pattern: tune(TITLE_A, TITLE_B, TITLE_A) },
      { voice: 'bass', gain: 0.8, pattern: accomp(TITLE_CHORDS, TITLE_BARS, 6, waltzBass) },
      { voice: 'pluck', gain: 0.35, pattern: accomp(TITLE_CHORDS, TITLE_BARS, 6, waltzStab) },
    ],
  },
  forest: {
    bpm: 112, div: 2, beats: 4,
    parts: [
      { voice: 'lead', gain: 0.5, pattern: tune(FOREST_A, FOREST_A2, FOREST_B, FOREST_A2) },
      { voice: 'bass', gain: 0.8, pattern: accomp(FOREST_CHORDS, FOREST_BARS, 8, walkingBass) },
      { voice: 'pluck', gain: 0.3, pattern: accomp(FOREST_CHORDS, FOREST_BARS, 8, arp) },
      { voice: 'kick', gain: 0.5, pattern: 'x . . . x . . .' },
      { voice: 'hat', gain: 0.15, pattern: '. x . x . x . x' },
    ],
  },
  snow: {
    bpm: 76, div: 2, beats: 4,
    parts: [
      { voice: 'bell', gain: 0.6, pattern: SNOW_MELODY },
      { voice: 'pad', gain: 0.25, pattern: accomp(SNOW_CHORDS, SNOW_BARS, 8, hold) },
      { voice: 'bass', gain: 0.6, pattern: accomp(SNOW_CHORDS, SNOW_BARS, 8, halfBass) },
      { voice: 'hat', gain: 0.06, pattern: '. x . x . x . x' },
    ],
  },
  desert: {
    bpm: 100, div: 2, beats: 4,
    parts: [
      { voice: 'pluck', gain: 0.7, pattern: tune(DESERT_A, rest(8, 8), DESERT_A) },
      { voice: 'lead', gain: 0.45, pattern: tune(rest(8, 8), DESERT_B, rest(8, 8)) },
      {
        voice: 'bass', gain: 0.8,
        pattern: accomp(DESERT_CHORDS, [...DESERT_A_BARS, ...DESERT_B_BARS, ...DESERT_A_BARS], 8, tresilloBass),
      },
      { voice: 'kick', gain: 0.5, pattern: 'x . . x . . x .' },
      { voice: 'snare', gain: 0.25, pattern: '. . x . . . x .' },
      { voice: 'hat', gain: 0.1, pattern: 'x x x x x x x x' },
    ],
  },
  indoors: {
    bpm: 84, div: 2, beats: 4,
    parts: [
      { voice: 'bell', gain: 0.55, pattern: INDOORS_MELODY },
      { voice: 'pluck', gain: 0.3, pattern: accomp(INDOORS_CHORDS, INDOORS_BARS, 8, alberti) },
      { voice: 'bass', gain: 0.5, pattern: accomp(INDOORS_CHORDS, INDOORS_BARS, 8, heldBass) },
    ],
  },
};
