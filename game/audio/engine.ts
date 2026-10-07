// One AudioContext for the whole game. Browsers only let audio start from a click or key press,
// so the context isn't made until the first one (the title menu needs one anyway); anything
// asked for before then waits in onUnlock. Muting or hiding the tab suspends the context, which
// also freezes the music clock, so nothing bunches up while it's paused.

export type Engine = {
  ctx: AudioContext;
  music: GainNode;
  sfx: GainNode;
  noise: AudioBuffer;
  pulse: PeriodicWave;
};

const MUTE_KEY = 'notekeep-town:muted';
const MASTER = 0.8;
const MUSIC = 0.35;
const SFX = 0.6;

let engine: Engine | null = null;
let installed = false;
let muted = loadMuted();
const waiting: Array<(e: Engine) => void> = [];
const muteListeners = new Set<() => void>();

function loadMuted(): boolean {
  try {
    return typeof window !== 'undefined' && localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

// A 25% pulse, the classic chiptune lead: Fourier series of a pulse train.
function pulseWave(ctx: AudioContext, duty: number): PeriodicWave {
  const n = 64;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  for (let k = 1; k < n; k++) real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
  return ctx.createPeriodicWave(real, imag);
}

function create(): Engine {
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = MASTER;
  master.connect(ctx.destination);
  const music = ctx.createGain();
  music.gain.value = MUSIC;
  music.connect(master);
  const sfx = ctx.createGain();
  sfx.gain.value = SFX;
  sfx.connect(master);
  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return { ctx, music, sfx, noise, pulse: pulseWave(ctx, 0.25) };
}

function sync() {
  if (!engine) return;
  if (muted || document.hidden) void engine.ctx.suspend();
  else void engine.ctx.resume();
}

function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

function install() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const unlock = () => {
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
    engine = create();
    sync();
    waiting.splice(0).forEach((cb) => cb(engine!));
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyM' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
    toggleMute();
  });
}

// Runs now if audio is already unlocked, otherwise on the first click or key press.
export function onUnlock(cb: (e: Engine) => void) {
  install();
  if (engine) cb(engine);
  else waiting.push(cb);
}

// The engine, only while it's actually making sound: an effect asked for while muted or hidden
// would otherwise sit queued and play the moment sound comes back.
export function liveEngine(): Engine | null {
  install();
  return engine && engine.ctx.state === 'running' && !muted && !document.hidden ? engine : null;
}

export function isMuted(): boolean {
  return muted;
}

export function toggleMute() {
  muted = !muted;
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // Storage unavailable (private browsing): the choice just won't be remembered.
  }
  sync();
  muteListeners.forEach((l) => l());
}

export function subscribeMute(cb: () => void) {
  install();
  muteListeners.add(cb);
  return () => {
    muteListeners.delete(cb);
  };
}
