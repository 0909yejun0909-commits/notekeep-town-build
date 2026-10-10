import type { Place } from './tracks';

export const AMBIENCES = [
  { id: 'rain', label: 'Rain' },
  { id: 'ocean', label: 'Ocean' },
  { id: 'fire', label: 'Fireplace' },
  { id: 'wind', label: 'Wind' },
  { id: 'crickets', label: 'Night crickets' },
  { id: 'white', label: 'White noise' },
  { id: 'pink', label: 'Pink noise' },
  { id: 'brown', label: 'Brown noise' },
] as const;
export type AmbienceId = (typeof AMBIENCES)[number]['id'];

export const DEFAULT_LEVEL = 0.6;

// The town's own music, by the place it normally plays in.
export const PLAYLIST: ReadonlyArray<{ place: Place; name: string; mood: string }> = [
  { place: 'indoors', name: 'Lamplight', mood: 'cosy, music box' },
  { place: 'snow', name: 'First Snow', mood: 'slow, celesta' },
  { place: 'forest', name: 'Green Hours', mood: 'bright, flute' },
  { place: 'desert', name: 'Dune Wind', mood: 'warm, maqam' },
  { place: 'title', name: 'Hearth Waltz', mood: 'gentle, piano' },
];

export function nextTrack(current: Place | null, step: 1 | -1): Place {
  const i = PLAYLIST.findIndex((t) => t.place === current);
  return PLAYLIST[(i + step + PLAYLIST.length) % PLAYLIST.length].place;
}

// Which tab a device opens on: a white-noise machine starts you on the sounds.
export type PlayerTab = 'music' | 'ambience';
export const tabFor = (category: string): PlayerTab => (category === 'noise_machine' ? 'ambience' : 'music');

export type BreathPhase = 'in' | 'hold' | 'out' | 'rest';
export type Breath = { id: string; name: string; steps: ReadonlyArray<[BreathPhase, number]> };

export const BREATHS: readonly Breath[] = [
  { id: 'calm', name: 'Calm 4-2-6', steps: [['in', 4], ['hold', 2], ['out', 6]] },
  { id: 'box', name: 'Box 4-4-4-4', steps: [['in', 4], ['hold', 4], ['out', 4], ['rest', 4]] },
];

export const SESSION_MINUTES = [1, 3, 5, 10] as const;

export const BREATH_WORD: Record<BreathPhase, string> = { in: 'Breathe in', hold: 'Hold', out: 'Breathe out', rest: 'Rest' };

// Where in the cycle `elapsed` seconds lands. `size` runs 0 (empty) to 1 (full): it grows on
// the in-breath, stays on a hold, shrinks on the out-breath, and stays small on a rest.
export function breathAt(breath: Breath, elapsed: number): { phase: BreathPhase; size: number; left: number } {
  const cycle = breath.steps.reduce((n, [, s]) => n + s, 0);
  let t = ((elapsed % cycle) + cycle) % cycle;
  for (const [phase, secs] of breath.steps) {
    if (t < secs) {
      const f = t / secs;
      const size = phase === 'in' ? f : phase === 'out' ? 1 - f : phase === 'hold' ? 1 : 0;
      return { phase, size, left: secs - t };
    }
    t -= secs;
  }
  return { phase: 'rest', size: 0, left: 0 };
}

export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Calm coins: a minute of meditating or two of resting earns a coin, up to a daily limit so
// it's a treat and not a farm.
export const DAILY_CALM_CAP = 12;
export const meditationCoins = (seconds: number) => Math.floor(seconds / 60);
export const restCoins = (seconds: number) => Math.floor(seconds / 120);

export type CalmDay = { day: string; coins: number };

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// `wanted` is what the session earned; the cap trims it. A new day starts the count over.
export function calmPayout(saved: CalmDay | null, wanted: number, today: string): { grant: number; next: CalmDay } {
  const used = saved && saved.day === today ? saved.coins : 0;
  const grant = Math.max(0, Math.min(wanted, DAILY_CALM_CAP - used));
  return { grant, next: { day: today, coins: used + grant } };
}
