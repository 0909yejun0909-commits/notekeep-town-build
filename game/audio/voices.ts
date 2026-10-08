import type { Voice } from '@/lib/music';
import { INSTRUMENTS, nearestSample, sampleUrl, type Instrument } from '@/lib/samples';
import { getSample, type Engine, type Sample } from '@/game/audio/engine';

// Recorded instruments are played by pitching the nearest recording; footsteps outdoors and the
// darbuka's tek, the riq and the shaker are synthesized from an oscillator or filtered noise,
// each with a short attack to `gain` and an exponential fall to silence by `dur`.

const SILENT = 0.0001;

function envelope(e: Engine, dest: AudioNode, t: number, dur: number, gain: number, attack: number) {
  const g = e.ctx.createGain();
  g.gain.setValueAtTime(SILENT, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(SILENT, t + dur);
  g.connect(dest);
  return g;
}

type ToneOpts = { wave: OscillatorType; freq: number; to?: number; dur: number; gain: number };

export function tone(e: Engine, dest: AudioNode, t: number, o: ToneOpts) {
  const osc = e.ctx.createOscillator();
  osc.type = o.wave;
  osc.frequency.setValueAtTime(o.freq, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
  osc.connect(envelope(e, dest, t, o.dur, o.gain, 0.005));
  osc.start(t);
  osc.stop(t + o.dur + 0.02);
}

type NoiseOpts = { filter: BiquadFilterType; freq: number; to?: number; q?: number; dur: number; gain: number; attack?: number };

export function noise(e: Engine, dest: AudioNode, t: number, o: NoiseOpts) {
  const src = e.ctx.createBufferSource();
  src.buffer = e.noise;
  const f = e.ctx.createBiquadFilter();
  f.type = o.filter;
  f.frequency.setValueAtTime(o.freq, t);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
  if (o.q) f.Q.value = o.q;
  src.connect(f).connect(envelope(e, dest, t, o.dur, o.gain, o.attack ?? 0.002));
  src.start(t, Math.random() * 0.5);
  src.stop(t + o.dur + 0.02);
}

type PlayOpts = { gain: number; rate?: number; dur?: number; release?: number; slide?: boolean };

// Without dur the recording plays out in full.
export function playSample(e: Engine, dest: AudioNode, t: number, s: Sample, o: PlayOpts) {
  const rate = o.rate ?? 1;
  const src = e.ctx.createBufferSource();
  src.buffer = s.buffer;
  if (o.slide) {
    src.playbackRate.setValueAtTime(rate * 2 ** (-1 / 12), t);
    src.playbackRate.exponentialRampToValueAtTime(rate, t + 0.09);
  } else {
    src.playbackRate.value = rate;
  }
  const level = o.gain * s.norm;
  const g = e.ctx.createGain();
  g.gain.setValueAtTime(level, t);
  let stop = t + s.buffer.duration / rate;
  if (o.dur !== undefined && t + o.dur < stop) {
    const release = o.release ?? 0.2;
    g.gain.setValueAtTime(level, t + o.dur);
    g.gain.exponentialRampToValueAtTime(SILENT, t + o.dur + release);
    stop = Math.min(stop, t + o.dur + release);
  }
  src.connect(g).connect(dest);
  src.start(t);
  src.stop(stop + 0.02);
}

// Held instruments stop with the note; struck and plucked ones ring on a little past it.
export function playNote(e: Engine, dest: AudioNode, t: number, inst: Instrument, midi: number, dur: number, gain: number, slide = false) {
  const base = nearestSample(midi);
  const s = getSample(sampleUrl(inst, base));
  if (!s) return;
  const held = INSTRUMENTS[inst].sustained;
  playSample(e, dest, t, s, {
    gain,
    rate: 2 ** ((midi - base) / 12),
    dur: held ? dur : dur + 0.6,
    release: held ? 0.25 : 0.35,
    slide: slide && dur >= 0.3,
  });
}

type VoiceFn = (e: Engine, dest: AudioNode, t: number, midi: number, dur: number, gain: number, slide: boolean) => void;

const DRUMS = {
  // The darbuka's high, dry "tek" at the rim: a crack of noise and a short ring from the head.
  tek: (e, d, t, _m, _dur, gain) => {
    noise(e, d, t, { filter: 'bandpass', freq: 3500, q: 1.5, dur: 0.05, gain });
    tone(e, d, t, { wave: 'sine', freq: 850, to: 700, dur: 0.07, gain: gain * 0.5 });
  },
  // The riq's jingles: narrow bands of noise, ringing a little.
  riq: (e, d, t, _m, _dur, gain) => {
    for (const freq of [5500, 7600, 10200]) noise(e, d, t, { filter: 'bandpass', freq, q: 12, dur: 0.14, gain });
    noise(e, d, t, { filter: 'highpass', freq: 6000, dur: 0.02, gain: gain * 0.5 });
  },
  shaker: (e, d, t, _m, _dur, gain) => {
    noise(e, d, t, { filter: 'highpass', freq: 5000, dur: 0.07, gain, attack: 0.015 });
  },
} satisfies Record<string, VoiceFn>;

export function voice(v: Voice): VoiceFn {
  if (v in DRUMS) return DRUMS[v as keyof typeof DRUMS];
  return (e, d, t, midi, dur, gain, slide) => playNote(e, d, t, v as Instrument, midi, dur, gain, slide);
}
