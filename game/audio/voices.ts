import type { Voice } from '@/lib/music';
import type { Engine } from '@/game/audio/engine';

// Two building blocks, an oscillator and filtered noise, each with a simple envelope: a short
// attack to `gain`, then an exponential fall to silence by `dur`. Music voices and sound effects
// are all made from these.

type ToneOpts = {
  wave: OscillatorType | 'pulse';
  freq: number;
  to?: number;
  dur: number;
  gain: number;
  attack?: number;
  // Holds at `gain` until this long before the end, instead of falling the whole way.
  sustain?: boolean;
  lowpass?: number;
};

const SILENT = 0.0001;

function envelope(e: Engine, dest: AudioNode, t: number, dur: number, gain: number, attack: number, sustain: boolean) {
  const g = e.ctx.createGain();
  g.gain.setValueAtTime(SILENT, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  if (sustain) g.gain.setValueAtTime(gain, Math.max(t + attack, t + dur - 0.06));
  g.gain.exponentialRampToValueAtTime(SILENT, t + dur);
  g.connect(dest);
  return g;
}

export function tone(e: Engine, dest: AudioNode, t: number, o: ToneOpts): OscillatorNode {
  const osc = e.ctx.createOscillator();
  if (o.wave === 'pulse') osc.setPeriodicWave(e.pulse);
  else osc.type = o.wave;
  osc.frequency.setValueAtTime(o.freq, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
  const env = envelope(e, dest, t, o.dur, o.gain, o.attack ?? 0.005, !!o.sustain);
  if (o.lowpass) {
    const f = e.ctx.createBiquadFilter();
    f.frequency.value = o.lowpass;
    osc.connect(f).connect(env);
  } else {
    osc.connect(env);
  }
  osc.start(t);
  osc.stop(t + o.dur + 0.02);
  return osc;
}

type NoiseOpts = { filter: BiquadFilterType; freq: number; to?: number; q?: number; dur: number; gain: number };

export function noise(e: Engine, dest: AudioNode, t: number, o: NoiseOpts) {
  const src = e.ctx.createBufferSource();
  src.buffer = e.noise;
  const f = e.ctx.createBiquadFilter();
  f.type = o.filter;
  f.frequency.setValueAtTime(o.freq, t);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
  if (o.q) f.Q.value = o.q;
  src.connect(f).connect(envelope(e, dest, t, o.dur, o.gain, 0.002, false));
  src.start(t, Math.random() * 0.5);
  src.stop(t + o.dur + 0.02);
}

type VoiceFn = (e: Engine, dest: AudioNode, t: number, freq: number, dur: number, gain: number) => void;

function bell(e: Engine, dest: AudioNode, t: number, freq: number, gain: number) {
  const carrier = tone(e, dest, t, { wave: 'sine', freq, dur: 1.6, gain, attack: 0.003 });
  const mod = e.ctx.createOscillator();
  mod.frequency.value = freq * 3.5;
  const depth = e.ctx.createGain();
  depth.gain.setValueAtTime(freq * 1.5, t);
  depth.gain.exponentialRampToValueAtTime(1, t + 0.6);
  mod.connect(depth).connect(carrier.frequency);
  mod.start(t);
  mod.stop(t + 1.62);
}

export const VOICES: Record<Voice, VoiceFn> = {
  lead: (e, d, t, freq, dur, gain) => {
    const osc = tone(e, d, t, { wave: 'pulse', freq, dur: dur * 0.92, gain: gain * 0.5, attack: 0.01, sustain: true, lowpass: 3200 });
    // A touch of vibrato on held notes.
    if (dur > 0.4) {
      const lfo = e.ctx.createOscillator();
      lfo.frequency.value = 5.5;
      const depth = e.ctx.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(8, t + 0.35);
      lfo.connect(depth).connect(osc.detune);
      lfo.start(t);
      lfo.stop(t + dur);
    }
  },
  bass: (e, d, t, freq, dur, gain) => {
    tone(e, d, t, { wave: 'triangle', freq, dur: dur * 0.9, gain: gain * 0.9, attack: 0.008, sustain: true });
  },
  bell: (e, d, t, freq, _dur, gain) => bell(e, d, t, freq, gain * 0.6),
  pluck: (e, d, t, freq, _dur, gain) => {
    tone(e, d, t, { wave: 'square', freq, dur: 0.35, gain: gain * 0.35, lowpass: 1800 });
  },
  pad: (e, d, t, freq, dur, gain) => {
    for (const cents of [-7, 7]) {
      const osc = tone(e, d, t, { wave: 'triangle', freq, dur: dur + 0.3, gain: gain * 0.35, attack: 0.4, sustain: true, lowpass: 1400 });
      osc.detune.value = cents;
    }
  },
  kick: (e, d, t, _f, _dur, gain) => {
    tone(e, d, t, { wave: 'sine', freq: 140, to: 45, dur: 0.18, gain });
  },
  snare: (e, d, t, _f, _dur, gain) => {
    noise(e, d, t, { filter: 'bandpass', freq: 1800, q: 0.8, dur: 0.12, gain });
    tone(e, d, t, { wave: 'triangle', freq: 190, to: 140, dur: 0.07, gain: gain * 0.6 });
  },
  hat: (e, d, t, _f, _dur, gain) => {
    noise(e, d, t, { filter: 'highpass', freq: 7000, dur: 0.04, gain });
  },
};
