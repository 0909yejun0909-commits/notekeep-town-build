import type { Instrument } from './samples';

// The soundtrack is plain data: each part of a track is a string, one token per step. `E5` is
// a note, `C4+E4+G4` a chord, `x` a drum hit, `.` a rest, and `*n` stretches a token over n
// steps. `|` is ignored, so bars can be marked for reading.

// A recorded instrument, or one of the hand percussion sounds synthesized in game/audio/voices.ts.
export type Voice = Instrument | 'tek' | 'riq' | 'shaker';

// slide: bend up into each long note from a semitone below, the way a ney player does.
export type Part = { voice: Voice; gain: number; pattern: string; slide?: boolean };

// div: steps per beat. beats: beats per bar, used only to check the parts line up.
export type Track = { bpm: number; div: number; beats: number; parts: Part[] };

// A drum hit has no notes.
export type NoteEvent = { step: number; len: number; midis: number[] };

export type Pattern = { length: number; events: NoteEvent[] };

const SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function noteMidi(name: string): number {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) throw new Error(`Not a note: ${name}`);
  return 12 * (Number(m[3]) + 1) + SEMITONE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

export function parsePattern(src: string): Pattern {
  const events: NoteEvent[] = [];
  let step = 0;
  for (const token of src.split(/\s+/)) {
    if (!token || token === '|') continue;
    const [body, times] = token.split('*');
    const len = times === undefined ? 1 : Number(times);
    if (!Number.isInteger(len) || len < 1) throw new Error(`Bad length: ${token}`);
    if (body === 'x') events.push({ step, len, midis: [] });
    else if (body !== '.') events.push({ step, len, midis: body.split('+').map(noteMidi) });
    step += len;
  }
  return { length: step, events };
}

export function stepSeconds(track: Pick<Track, 'bpm' | 'div'>): number {
  return 60 / track.bpm / track.div;
}

export function stepsPerBar(track: Pick<Track, 'div' | 'beats'>): number {
  return track.div * track.beats;
}
