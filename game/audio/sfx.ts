import { noteMidi } from '@/lib/music';
import { PHRASES, SFX_FILES, nearestSample, sampleUrl, sfxUrl, steps, type Phrase, type SfxFile } from '@/lib/samples';
import { getSample, liveEngine, loadSample, type Engine } from '@/game/audio/engine';
import { noise, playNote, playSample, tone } from '@/game/audio/voices';

type Play = (e: Engine, d: AudioNode, t: number) => void;

// One of the recordings, at a slightly different speed each time so repeats don't sound canned.
const file = (names: SfxFile[], gain: number, at = 0, rate = 1): Play => (e, d, t) => {
  const s = getSample(sfxUrl(names[Math.floor(Math.random() * names.length)]));
  if (s) playSample(e, d, t + at, s, { gain, rate: rate * (0.95 + Math.random() * 0.1) });
};

const muffled = (play: Play, freq: number): Play => (e, d, t) => {
  const f = e.ctx.createBiquadFilter();
  f.frequency.value = freq;
  f.connect(d);
  play(e, f, t);
};

const phrase = (p: Phrase): Play => (e, d, t) =>
  p.notes.forEach(([at, n]) => playNote(e, d, t + at, p.instrument, noteMidi(n), 0.3, p.gain));

const both = (...plays: Play[]): Play => (e, d, t) => plays.forEach((p) => p(e, d, t));

const thump: Play = (e, d, t) => {
  tone(e, d, t, { wave: 'triangle', freq: 180, to: 90, dur: 0.1, gain: 0.5 });
  noise(e, d, t, { filter: 'lowpass', freq: 1200, dur: 0.06, gain: 0.3 });
};

const cushion: Play = (e, d, t) => {
  noise(e, d, t, { filter: 'lowpass', freq: 500, dur: 0.14, gain: 0.45 });
  tone(e, d, t, { wave: 'triangle', freq: 110, to: 75, dur: 0.12, gain: 0.3 });
};

// A fridge door: the rubber seal letting go with a suck of air, then bottles knocking inside.
const fridgeOpen: Play = (e, d, t) => {
  noise(e, d, t, { filter: 'bandpass', freq: 900, to: 2400, q: 2, dur: 0.16, gain: 0.35, attack: 0.03 });
  tone(e, d, t, { wave: 'triangle', freq: 120, to: 80, dur: 0.1, gain: 0.25 });
  tone(e, d, t + 0.14, { wave: 'sine', freq: 2300, to: 2200, dur: 0.09, gain: 0.12 });
  tone(e, d, t + 0.19, { wave: 'sine', freq: 3100, to: 3000, dur: 0.07, gain: 0.09 });
};

// Shutting it is a heavy soft thud, the magnetic seal catching, and the bottles rattling once.
const fridgeClose: Play = (e, d, t) => {
  tone(e, d, t, { wave: 'triangle', freq: 150, to: 55, dur: 0.16, gain: 0.55 });
  noise(e, d, t, { filter: 'lowpass', freq: 700, dur: 0.1, gain: 0.4 });
  noise(e, d, t + 0.05, { filter: 'bandpass', freq: 1800, q: 3, dur: 0.05, gain: 0.15 });
  tone(e, d, t + 0.1, { wave: 'sine', freq: 2600, to: 2400, dur: 0.06, gain: 0.07 });
};

// A singing bowl: a low fundamental with two inharmonic overtones, ringing out for a few seconds.
const bowl: Play = (e, d, t) => {
  tone(e, d, t, { wave: 'sine', freq: 392, dur: 3.6, gain: 0.28 });
  tone(e, d, t, { wave: 'sine', freq: 392 * 2.76, dur: 2.2, gain: 0.1 });
  tone(e, d, t, { wave: 'sine', freq: 392 * 5.4, dur: 1.1, gain: 0.04 });
};

const SOUNDS = {
  doorOpen: file(['door-open'], 0.9),
  doorClose: file(['door-close-1', 'door-close-2'], 0.8),
  pageOpen: both(file(['book-open'], 0.6), file(['page-1', 'page-2'], 0.45, 0.08)),
  pageClose: file(['book-close'], 0.6),
  open: file(['page-1', 'page-2'], 0.45),
  close: file(['page-2'], 0.35),
  wardrobe: file(['cloth'], 0.7),
  fridgeOpen,
  fridgeClose,
  wardrobeOpen: both(file(['creak-1', 'creak-2'], 0.55, 0, 0.8), file(['cloth'], 0.5, 0.12)),
  wardrobeClose: both(muffled(file(['door-close-1', 'door-close-2'], 0.6, 0, 1.15), 1800), file(['cloth'], 0.3, 0.06)),
  bowl,
  talk: phrase(PHRASES.talk),
  coin: both(phrase(PHRASES.coin), file(['coins'], 0.5)),
  buy: both(phrase(PHRASES.buy), file(['coins'], 0.5)),
  error: phrase(PHRASES.error),
  place: thump,
  sit: both(cushion, file(['creak-1', 'creak-2'], 0.5)),
  lie: both(cushion, file(['cloth'], 0.5, 0.05)),
  move: phrase(PHRASES.move),
  select: phrase(PHRASES.select),
} satisfies Record<string, Play>;

export type Sfx = keyof typeof SOUNDS;

export function preloadSfx() {
  SFX_FILES.forEach((name) => loadSample(sfxUrl(name)));
  for (const p of Object.values(PHRASES) as Phrase[]) p.notes.forEach(([, n]) => loadSample(sampleUrl(p.instrument, nearestSample(noteMidi(n)))));
}

export function sfx(name: Sfx) {
  const e = liveEngine();
  if (e) SOUNDS[name](e, e.sfx, e.ctx.currentTime + 0.005);
}

export type Ground = 'grass' | 'snow' | 'sand' | 'road' | 'stone' | 'wood';

// Sand has no recording of its own: snow, slowed and muffled, makes a soft grainy shuffle.
const STEPS: Record<Ground, Play> = {
  grass: file(steps('grass'), 0.35),
  snow: file(steps('snow'), 0.35),
  sand: muffled(file(steps('snow'), 0.4, 0, 0.75), 2200),
  road: file(steps('road'), 0.3),
  stone: file(steps('concrete'), 0.4),
  wood: file(steps('wood'), 0.45),
};

let groundAt: ((gx: number, gy: number) => Ground) | null = null;

// Each scene says what's underfoot where; null (the title) means no footsteps.
export function setGround(fn: ((gx: number, gy: number) => Ground) | null) {
  groundAt = fn;
}

export function footstep(gx: number, gy: number) {
  const e = liveEngine();
  if (e && groundAt) STEPS[groundAt(gx, gy)](e, e.sfx, e.ctx.currentTime + 0.005);
}
