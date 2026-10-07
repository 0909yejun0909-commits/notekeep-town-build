import { noteMidi } from '@/lib/music';
import { PHRASES, SFX_FILES, nearestSample, sampleUrl, sfxUrl, type Phrase, type SfxFile } from '@/lib/samples';
import { getSample, liveEngine, loadSample, type Engine } from '@/game/audio/engine';
import { currentPlace } from '@/game/audio/music';
import { noise, playNote, playSample, tone } from '@/game/audio/voices';

type Play = (e: Engine, d: AudioNode, t: number) => void;

// One of the recordings, at a slightly different speed each time so repeats don't sound canned.
const file = (names: SfxFile[], gain: number, at = 0): Play => (e, d, t) => {
  const s = getSample(sfxUrl(names[Math.floor(Math.random() * names.length)]));
  if (s) playSample(e, d, t + at, s, { gain, rate: 0.95 + Math.random() * 0.1 });
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

const SOUNDS = {
  doorOpen: file(['door-open'], 0.9),
  doorClose: file(['door-close-1', 'door-close-2'], 0.8),
  pageOpen: both(file(['book-open'], 0.6), file(['page-1', 'page-2'], 0.45, 0.08)),
  pageClose: file(['book-close'], 0.6),
  open: file(['page-1', 'page-2'], 0.45),
  close: file(['page-2'], 0.35),
  wardrobe: file(['cloth'], 0.7),
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

const indoorStep = file(['step-1', 'step-2', 'step-3', 'step-4'], 0.3);

// Each place has its own ground underfoot: recorded steps on wooden floors indoors, and outside
// a little filtered noise, pitched a touch differently each step.
export function footstep() {
  const e = liveEngine();
  const place = currentPlace();
  if (!e || !place || place === 'title') return;
  const t = e.ctx.currentTime + 0.005;
  const r = 0.85 + Math.random() * 0.3;
  if (place === 'indoors') indoorStep(e, e.sfx, t);
  else if (place === 'forest') noise(e, e.sfx, t, { filter: 'lowpass', freq: 700 * r, dur: 0.05, gain: 0.25 });
  else if (place === 'snow') {
    noise(e, e.sfx, t, { filter: 'bandpass', freq: 1400 * r, q: 0.7, dur: 0.08, gain: 0.3 });
    noise(e, e.sfx, t + 0.025, { filter: 'bandpass', freq: 2200 * r, q: 0.9, dur: 0.05, gain: 0.15 });
  } else noise(e, e.sfx, t, { filter: 'highpass', freq: 2500 * r, dur: 0.06, gain: 0.12 });
}
