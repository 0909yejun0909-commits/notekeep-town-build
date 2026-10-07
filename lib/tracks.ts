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

// Snow: slow celesta over harp, strings and cello, F major.
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

// Desert: maqam Hijaz on D (D Eb F# G A Bb C), whose step from Eb up to F# is what makes it
// sound Arabic. A ney melody, then a mizmar answer, over an oud ostinato, a cello drone and the
// maqsum rhythm (doum tek . tek doum . tek .) on darbuka and riq. Sixteenth-note steps, for the
// turns and grace notes.
const DESERT_NEY = tune(
  'D4*4 Eb4*2 F#4*2 G4*6 F#4 G4', 'A4*8 G4 A4 G4 F#4 G4*4', 'F#4*2 G4*2 A4*2 Bb4*2 A4*4 G4 F#4 Eb4*2', 'D4*12 .*4',
  'A4*4 Bb4*2 C5*2 D5*6 C5 Bb4', 'A4*6 Bb4 A4 G4*4 F#4*4', 'G4 A4 G4 F#4 Eb4*4 F#4 G4 F#4 Eb4 D4*4', 'D4*8 .*8',
);
const DESERT_MIZMAR = tune(
  'D5*2 Eb5*2 F#5*2 G5*2 A5*4 G5 F#5 G5*2', 'A5*2 Bb5*2 A5*2 G5*2 F#5*4 Eb5*2 F#5*2',
  'G5*2 F#5*2 Eb5*2 D5*2 Eb5*2 F#5*2 G5*4', 'A5*12 .*4',
  'C6*2 Bb5*2 A5*2 G5*2 A5*4 Bb5 A5 G5*2', 'F#5*4 G5*2 A5*2 G5 F#5 Eb5 F#5 G5*4',
  'F#5*2 Eb5*2 D5*2 Eb5*2 F#5 G5 F#5 Eb5 D5*4', 'D5*8 .*8',
);

// Indoors: a music box over a harp playing Alberti bass, C major.
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
      { voice: 'acoustic_grand_piano', gain: 0.7, pattern: tune(TITLE_A, TITLE_B, TITLE_A) },
      { voice: 'acoustic_grand_piano', gain: 0.3, pattern: accomp(TITLE_CHORDS, TITLE_BARS, 6, waltzStab) },
      { voice: 'string_ensemble_1', gain: 0.25, pattern: accomp(TITLE_CHORDS, TITLE_BARS, 6, hold) },
      { voice: 'acoustic_bass', gain: 0.7, pattern: accomp(TITLE_CHORDS, TITLE_BARS, 6, waltzBass) },
    ],
  },
  forest: {
    bpm: 112, div: 2, beats: 4,
    parts: [
      { voice: 'flute', gain: 0.6, pattern: tune(FOREST_A, FOREST_A2, FOREST_B, FOREST_A2) },
      { voice: 'acoustic_guitar_nylon', gain: 0.45, pattern: accomp(FOREST_CHORDS, FOREST_BARS, 8, arp) },
      { voice: 'acoustic_bass', gain: 0.7, pattern: accomp(FOREST_CHORDS, FOREST_BARS, 8, walkingBass) },
      { voice: 'shaker', gain: 0.12, pattern: 'x x x x x x x x' },
    ],
  },
  snow: {
    bpm: 76, div: 2, beats: 4,
    parts: [
      { voice: 'celesta', gain: 0.55, pattern: SNOW_MELODY },
      { voice: 'orchestral_harp', gain: 0.35, pattern: accomp(SNOW_CHORDS, SNOW_BARS, 8, arp) },
      { voice: 'string_ensemble_1', gain: 0.3, pattern: accomp(SNOW_CHORDS, SNOW_BARS, 8, hold) },
      { voice: 'cello', gain: 0.45, pattern: accomp(SNOW_CHORDS, SNOW_BARS, 8, halfBass) },
    ],
  },
  desert: {
    bpm: 92, div: 4, beats: 4,
    parts: [
      { voice: 'shakuhachi', gain: 0.6, slide: true, pattern: tune(DESERT_NEY, rest(8, 16), DESERT_NEY) },
      { voice: 'shanai', gain: 0.35, pattern: tune(rest(8, 16), DESERT_MIZMAR, rest(8, 16)) },
      { voice: 'acoustic_guitar_nylon', gain: 0.45, pattern: 'D3*2 .*2 D3 D3 .*2 D3*2 .*2 A2*2 G2 A2' },
      { voice: 'cello', gain: 0.25, pattern: 'D2+A2*16' },
      { voice: 'taiko_drum', gain: 0.6, pattern: 'D3 .*7 D3 .*7' },
      { voice: 'tek', gain: 0.4, pattern: '.*2 x .*3 x .*5 x .*3' },
      { voice: 'tek', gain: 0.15, pattern: '.*7 x .*6 x x' },
      { voice: 'riq', gain: 0.12, pattern: '. . x . . . x x . . x . . . x x' },
    ],
  },
  indoors: {
    bpm: 84, div: 2, beats: 4,
    parts: [
      { voice: 'music_box', gain: 0.6, pattern: INDOORS_MELODY },
      { voice: 'orchestral_harp', gain: 0.4, pattern: accomp(INDOORS_CHORDS, INDOORS_BARS, 8, alberti) },
      { voice: 'acoustic_grand_piano', gain: 0.35, pattern: accomp(INDOORS_CHORDS, INDOORS_BARS, 8, heldBass) },
    ],
  },
};
