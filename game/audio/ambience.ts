import type { AmbienceId } from '@/lib/chill';
import type { Engine } from '@/game/audio/engine';
import { noise, tone } from '@/game/audio/voices';

// Every sound here is synthesized, so there's nothing to download: a few seconds of coloured
// noise looped through filters, with slow oscillators breathing the volume and pitch, and
// randomly timed short bursts for raindrops, embers and crickets. A layer is started with
// `start(e, out)` and returns the function that stops it.

type Kind = 'white' | 'pink' | 'brown';
export type Layer = (e: Engine, out: AudioNode) => () => void;

const SECONDS = 8;
const buffers = new Map<Kind, AudioBuffer>();

function coloured(e: Engine, kind: Kind): AudioBuffer {
  let buf = buffers.get(kind);
  if (buf) return buf;
  buf = e.ctx.createBuffer(1, e.ctx.sampleRate * SECONDS, e.ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'white') {
      d[i] = w;
    } else if (kind === 'pink') {
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    } else {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
  }
  let peak = 0;
  for (const x of d) peak = Math.max(peak, Math.abs(x));
  for (let i = 0; i < d.length; i++) d[i] /= peak;
  buffers.set(kind, buf);
  return buf;
}

function source(e: Engine, kind: Kind) {
  const src = e.ctx.createBufferSource();
  src.buffer = coloured(e, kind);
  src.loop = true;
  src.start(0, Math.random() * SECONDS);
  return src;
}

function filter(e: Engine, type: BiquadFilterType, freq: number, q = 0.7) {
  const f = e.ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

function gain(e: Engine, value: number) {
  const g = e.ctx.createGain();
  g.gain.value = value;
  return g;
}

// A slow wobble added to a parameter: `depth` either side of whatever it was set to.
function wobble(e: Engine, param: AudioParam, hz: number, depth: number) {
  const lfo = e.ctx.createOscillator();
  lfo.frequency.value = hz;
  const amount = gain(e, depth);
  lfo.connect(amount).connect(param);
  lfo.start();
  return lfo;
}

// Calls `fn` at random intervals around `every` ms until stopped.
function sprinkle(every: number, fn: () => void) {
  let timer = 0;
  const next = () => {
    timer = window.setTimeout(() => {
      fn();
      next();
    }, every * (0.4 + Math.random() * 1.2));
  };
  next();
  return () => window.clearTimeout(timer);
}

const steady = (kind: Kind, low: number | null, high: number | null, level: number): Layer => (e, out) => {
  const src = source(e, kind);
  let tail: AudioNode = src;
  if (low) tail = tail.connect(filter(e, 'highpass', low));
  if (high) tail = tail.connect(filter(e, 'lowpass', high));
  tail.connect(gain(e, level)).connect(out);
  return () => src.stop();
};

const rain: Layer = (e, out) => {
  const bed = source(e, 'pink');
  bed.connect(filter(e, 'highpass', 500)).connect(filter(e, 'lowpass', 7500)).connect(gain(e, 0.55)).connect(out);
  const drops = sprinkle(45, () => {
    noise(e, out, e.ctx.currentTime, {
      filter: 'bandpass', freq: 2500 + Math.random() * 4500, q: 4, dur: 0.02 + Math.random() * 0.03, gain: 0.05 + Math.random() * 0.12,
    });
  });
  return () => {
    bed.stop();
    drops();
  };
};

const ocean: Layer = (e, out) => {
  const swell = gain(e, 0.45);
  const body = source(e, 'brown');
  body.connect(filter(e, 'lowpass', 1100)).connect(swell).connect(out);
  const slow = wobble(e, swell.gain, 0.09, 0.38);
  const foam = gain(e, 0.12);
  const hiss = source(e, 'pink');
  hiss.connect(filter(e, 'bandpass', 2600, 0.6)).connect(foam).connect(out);
  const surf = wobble(e, foam.gain, 0.09, 0.1);
  return () => {
    body.stop();
    hiss.stop();
    slow.stop();
    surf.stop();
  };
};

const fire: Layer = (e, out) => {
  const bed = source(e, 'brown');
  bed.connect(filter(e, 'lowpass', 520)).connect(gain(e, 0.6)).connect(out);
  const crackle = sprinkle(70, () => {
    const t = e.ctx.currentTime;
    const loud = Math.random() < 0.12;
    noise(e, out, t, {
      filter: 'highpass', freq: 1400 + Math.random() * 2600, q: 1, dur: 0.01 + Math.random() * (loud ? 0.06 : 0.025), gain: loud ? 0.35 : 0.08 + Math.random() * 0.14,
    });
  });
  return () => {
    bed.stop();
    crackle();
  };
};

const wind: Layer = (e, out) => {
  const band = filter(e, 'bandpass', 450, 0.9);
  const level = gain(e, 0.55);
  const src = source(e, 'pink');
  src.connect(band).connect(level).connect(out);
  const sweep = wobble(e, band.frequency, 0.07, 260);
  const gusts = wobble(e, level.gain, 0.13, 0.3);
  return () => {
    src.stop();
    sweep.stop();
    gusts.stop();
  };
};

// A handful of crickets, each chirping in short bursts on its own beat.
const crickets: Layer = (e, out) => {
  const chirp = () => {
    const t = e.ctx.currentTime;
    const pitch = 4100 + Math.random() * 700;
    const pulses = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < pulses; i++) tone(e, out, t + i * 0.075, { wave: 'sine', freq: pitch, dur: 0.045, gain: 0.035 });
  };
  const stops = [900, 1300, 1700].map((every) => sprinkle(every, chirp));
  return () => stops.forEach((s) => s());
};

export const LAYERS: Record<AmbienceId, Layer> = {
  white: steady('white', null, 11000, 0.3),
  pink: steady('pink', null, null, 0.7),
  brown: steady('brown', null, 900, 0.9),
  rain,
  ocean,
  fire,
  wind,
  crickets,
};
