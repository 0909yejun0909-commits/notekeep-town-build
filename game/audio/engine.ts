// One AudioContext for the whole game. Browsers only let audio start from a click or key press,
// so the context isn't made until the first one (the title menu needs one anyway); anything
// asked for before then waits in onUnlock. Muting or hiding the tab suspends the context, which
// also freezes the music clock, so nothing bunches up while it's paused.

export type Engine = {
  ctx: AudioContext;
  music: GainNode;
  sfx: GainNode;
  ambience: GainNode;
  noise: AudioBuffer;
};

// norm scales a recording to a common peak, so instruments and notes start out level.
export type Sample = { buffer: AudioBuffer; norm: number };

const MUTE_KEY = 'notekeep-town:muted';
const MASTER = 0.8;
const MUSIC = 0.5;
const SFX = 0.6;
const AMBIENCE = 0.5;
const REVERB = 0.22;
const PEAK = 0.5;

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

// A small room: two seconds of stereo noise dying away, so the reverb needs no recording.
function impulse(ctx: AudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 2);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp((-4 * i) / len) * (i < 300 ? i / 300 : 1);
  }
  return ir;
}

function create(): Engine {
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = MASTER;
  master.connect(ctx.destination);
  const music = ctx.createGain();
  music.gain.value = MUSIC;
  music.connect(master);
  const reverb = ctx.createConvolver();
  reverb.buffer = impulse(ctx);
  const send = ctx.createGain();
  send.gain.value = REVERB;
  music.connect(send).connect(reverb).connect(master);
  const sfx = ctx.createGain();
  sfx.gain.value = SFX;
  sfx.connect(master);
  const ambience = ctx.createGain();
  ambience.gain.value = AMBIENCE;
  ambience.connect(master);
  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return { ctx, music, sfx, ambience, noise };
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

const loading = new Map<string, Promise<Sample | null>>();
const loaded = new Map<string, Sample>();

// Starts downloading straight away, even before audio is unlocked; decoding needs the context,
// so it waits for that. Resolves null if the file is missing or can't be decoded.
export function loadSample(url: string): Promise<Sample | null> {
  let p = loading.get(url);
  if (!p) {
    const bytes = fetch(url).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
    p = new Promise((resolve) =>
      onUnlock(async (e) => {
        const data = await bytes;
        if (!data) return resolve(null);
        try {
          const buffer = await e.ctx.decodeAudioData(data);
          let peak = 0;
          for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
            for (const x of buffer.getChannelData(ch)) peak = Math.max(peak, Math.abs(x));
          }
          const sample = { buffer, norm: peak > 0 ? PEAK / peak : 1 };
          loaded.set(url, sample);
          resolve(sample);
        } catch {
          resolve(null);
        }
      }),
    );
    loading.set(url, p);
  }
  return p;
}

// Only what's already decoded: scheduling can't wait.
export function getSample(url: string): Sample | undefined {
  return loaded.get(url);
}
