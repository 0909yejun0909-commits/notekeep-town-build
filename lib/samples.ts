import { noteMidi, parsePattern, type Track } from './music';
import { TRACKS } from './tracks';

// Recorded instruments come from the FluidR3 General MIDI soundfont (CC BY 3.0), via
// gleitz/midi-js-soundfonts. We keep one note every three semitones (C, Eb, Gb, A) and pitch the
// rest from the nearest, never more than a semitone away. scripts/fetch-samples.mts downloads
// exactly the notes requiredSamples() lists.

export const INSTRUMENTS = {
  acoustic_grand_piano: { sustained: false },
  string_ensemble_1: { sustained: true },
  acoustic_bass: { sustained: false },
  flute: { sustained: true },
  acoustic_guitar_nylon: { sustained: false },
  celesta: { sustained: false },
  orchestral_harp: { sustained: false },
  cello: { sustained: true },
  shakuhachi: { sustained: true },
  shanai: { sustained: true },
  taiko_drum: { sustained: false },
  music_box: { sustained: false },
  marimba: { sustained: false },
  kalimba: { sustained: false },
} as const;

export type Instrument = keyof typeof INSTRUMENTS;

export function isInstrument(voice: string): voice is Instrument {
  return voice in INSTRUMENTS;
}

const STEP = 3;

export function nearestSample(midi: number): number {
  return Math.round(midi / STEP) * STEP;
}

const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// The soundfont's own note names, which spell every black key as a flat.
export function sampleName(midi: number): string {
  return `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

export function sampleUrl(instrument: Instrument, midi: number): string {
  return `/audio/${instrument}/${sampleName(midi)}.mp3`;
}

// Recorded foley from Kenney's RPG Audio pack (CC0), in public/sfx/.
export const SFX_FILES = [
  'door-open', 'door-close-1', 'door-close-2', 'book-open', 'book-close', 'page-1', 'page-2',
  'cloth', 'creak-1', 'creak-2', 'coins', 'step-1', 'step-2', 'step-3', 'step-4',
] as const;

export type SfxFile = (typeof SFX_FILES)[number];

export const sfxUrl = (name: SfxFile) => `/sfx/${name}.wav`;

// Short melodic sound effects: [seconds after the start, note].
export type Phrase = { instrument: Instrument; gain: number; notes: Array<[number, string]> };

export const PHRASES = {
  coin: { instrument: 'celesta', gain: 0.5, notes: [[0, 'B5'], [0.08, 'E6']] },
  buy: { instrument: 'marimba', gain: 0.55, notes: [[0, 'C5'], [0.07, 'E5'], [0.14, 'G5'], [0.21, 'C6']] },
  error: { instrument: 'marimba', gain: 0.55, notes: [[0, 'E4'], [0.12, 'C4']] },
  move: { instrument: 'marimba', gain: 0.3, notes: [[0, 'G5']] },
  select: { instrument: 'marimba', gain: 0.45, notes: [[0, 'C5'], [0.07, 'G5']] },
  talk: { instrument: 'kalimba', gain: 0.4, notes: [[0, 'E5'], [0.07, 'A5'], [0.14, 'G5']] },
} satisfies Record<string, Phrase>;

// Every recording a track plays, as [instrument, the note recorded].
export function trackSamples(track: Track): Array<[Instrument, number]> {
  return track.parts.flatMap(({ voice, pattern }) =>
    isInstrument(voice)
      ? parsePattern(pattern).events.flatMap((ev) => ev.midis.map((m): [Instrument, number] => [voice, nearestSample(m)]))
      : [],
  );
}

export function requiredSamples(): Map<Instrument, Set<number>> {
  const need = new Map<Instrument, Set<number>>();
  const add = (instrument: Instrument, midi: number) => {
    if (!need.has(instrument)) need.set(instrument, new Set());
    need.get(instrument)!.add(nearestSample(midi));
  };
  for (const track of Object.values(TRACKS)) trackSamples(track).forEach(([inst, m]) => add(inst, m));
  for (const phrase of Object.values(PHRASES) as Phrase[]) phrase.notes.forEach(([, n]) => add(phrase.instrument, noteMidi(n)));
  return need;
}
