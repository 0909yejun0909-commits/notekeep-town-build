import { liveEngine, type Engine } from '@/game/audio/engine';
import { currentPlace } from '@/game/audio/music';
import { noise, tone } from '@/game/audio/voices';

type Play = (e: Engine, d: AudioNode, t: number) => void;

const blip = (freq: number, dur: number, gain = 0.12): Play => (e, d, t) =>
  tone(e, d, t, { wave: 'square', freq, dur, gain, lowpass: 4000 });

const seq = (gap: number, ...plays: Play[]): Play => (e, d, t) => plays.forEach((p, i) => p(e, d, t + i * gap));

const rustle = (from: number, to: number): Play => (e, d, t) => {
  noise(e, d, t, { filter: 'bandpass', freq: from, to, q: 1.2, dur: 0.16, gain: 0.35 });
  noise(e, d, t + 0.1, { filter: 'bandpass', freq: to, q: 1.5, dur: 0.08, gain: 0.18 });
};

const sweep = (freq: number, to: number): Play => (e, d, t) => {
  tone(e, d, t, { wave: 'triangle', freq, to, dur: 0.09, gain: 0.25 });
};

const thump: Play = (e, d, t) => {
  tone(e, d, t, { wave: 'triangle', freq: 180, to: 90, dur: 0.1, gain: 0.5 });
  noise(e, d, t, { filter: 'lowpass', freq: 1200, dur: 0.06, gain: 0.3 });
};

const cushion: Play = (e, d, t) => {
  noise(e, d, t, { filter: 'lowpass', freq: 500, dur: 0.14, gain: 0.45 });
  tone(e, d, t, { wave: 'triangle', freq: 110, to: 75, dur: 0.12, gain: 0.3 });
};

const SOUNDS = {
  door: (e, d, t) => {
    tone(e, d, t, { wave: 'triangle', freq: 160, to: 90, dur: 0.15, gain: 0.45 });
    noise(e, d, t, { filter: 'bandpass', freq: 600, dur: 0.12, gain: 0.35 });
    tone(e, d, t + 0.13, { wave: 'triangle', freq: 120, to: 70, dur: 0.1, gain: 0.3 });
  },
  pageOpen: rustle(2500, 5000),
  pageClose: rustle(5000, 2000),
  talk: (e, d, t) => {
    for (let i = 0; i < 3; i++) blip(480 + Math.random() * 320, 0.045, 0.1)(e, d, t + i * 0.065);
  },
  coin: seq(0.07, blip(988, 0.07, 0.14), blip(1319, 0.3, 0.14)),
  buy: seq(0.05, blip(1047, 0.05), blip(1319, 0.05), blip(1568, 0.05), blip(2093, 0.2)),
  error: seq(0.09, blip(220, 0.09), blip(165, 0.16)),
  place: thump,
  open: sweep(520, 780),
  close: sweep(780, 520),
  sit: cushion,
  lie: (e, d, t) => {
    cushion(e, d, t);
    tone(e, d, t + 0.1, { wave: 'sine', freq: 600, to: 300, dur: 0.45, gain: 0.08, attack: 0.08 });
  },
  move: blip(1200, 0.03, 0.06),
  select: seq(0.05, blip(880, 0.05, 0.1), blip(1320, 0.1, 0.1)),
} satisfies Record<string, Play>;

export type Sfx = keyof typeof SOUNDS;

export function sfx(name: Sfx) {
  const e = liveEngine();
  if (e) SOUNDS[name](e, e.sfx, e.ctx.currentTime + 0.005);
}

// Each place has its own ground underfoot; a small random pitch keeps steps from sounding
// mechanical.
export function footstep() {
  const e = liveEngine();
  const place = currentPlace();
  if (!e || !place || place === 'title') return;
  const t = e.ctx.currentTime + 0.005;
  const r = 0.85 + Math.random() * 0.3;
  if (place === 'forest') noise(e, e.sfx, t, { filter: 'lowpass', freq: 700 * r, dur: 0.05, gain: 0.25 });
  else if (place === 'snow') {
    noise(e, e.sfx, t, { filter: 'bandpass', freq: 1400 * r, q: 0.7, dur: 0.08, gain: 0.3 });
    noise(e, e.sfx, t + 0.025, { filter: 'bandpass', freq: 2200 * r, q: 0.9, dur: 0.05, gain: 0.15 });
  } else if (place === 'desert') noise(e, e.sfx, t, { filter: 'highpass', freq: 2500 * r, dur: 0.06, gain: 0.12 });
  else {
    tone(e, e.sfx, t, { wave: 'triangle', freq: 150 * r, to: 110 * r, dur: 0.05, gain: 0.3 });
    noise(e, e.sfx, t, { filter: 'lowpass', freq: 2000, dur: 0.02, gain: 0.08 });
  }
}
