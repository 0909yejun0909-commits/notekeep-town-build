import { parsePattern, stepSeconds, type NoteEvent, type Voice } from '@/lib/music';
import { TRACKS, type Place } from '@/lib/tracks';
import { onUnlock, type Engine } from '@/game/audio/engine';
import { VOICES } from '@/game/audio/voices';

// A look-ahead sequencer: every 25ms, schedule whatever notes fall in the next 150ms on the
// audio clock, which keeps time even when the game loop stutters.

const AHEAD = 0.15;
const FADE = 1;

type Lane = { voice: Voice; gain: number; length: number; at: Array<NoteEvent | undefined> };
type Playing = { place: Place; out: GainNode; lanes: Lane[]; step: number; next: number; sec: number; timer: number };

const lanes: Partial<Record<Place, Lane[]>> = {};
let wanted: Place | null = null;
let playing: Playing | null = null;

function lanesFor(place: Place): Lane[] {
  return (lanes[place] ??= TRACKS[place].parts.map((part) => {
    const { length, events } = parsePattern(part.pattern);
    const at: Lane['at'] = new Array(length);
    for (const ev of events) at[ev.step] = ev;
    return { voice: part.voice, gain: part.gain, length, at };
  }));
}

function tick(e: Engine, p: Playing) {
  const now = e.ctx.currentTime;
  // Fell behind (a long stall): skip the missed steps rather than play them all at once.
  if (p.next < now) {
    const missed = Math.ceil((now - p.next) / p.sec);
    p.step += missed;
    p.next += missed * p.sec;
  }
  while (p.next < now + AHEAD) {
    for (const lane of p.lanes) {
      const ev = lane.at[p.step % lane.length];
      if (!ev) continue;
      const freqs = ev.freqs.length ? ev.freqs : [0];
      const gain = lane.gain / Math.sqrt(freqs.length);
      for (const f of freqs) VOICES[lane.voice](e, p.out, p.next, f, ev.len * p.sec, gain);
    }
    p.step++;
    p.next += p.sec;
  }
}

function fade(e: Engine, gain: GainNode, from: number, to: number) {
  const t = e.ctx.currentTime;
  gain.gain.cancelScheduledValues(t);
  gain.gain.setValueAtTime(from, t);
  gain.gain.linearRampToValueAtTime(to, t + FADE);
}

function start(e: Engine) {
  const place = wanted;
  if (!place || playing?.place === place) return;
  const old = playing;
  if (old) {
    fade(e, old.out, old.out.gain.value, 0);
    window.setTimeout(() => {
      window.clearInterval(old.timer);
      old.out.disconnect();
    }, (FADE + AHEAD) * 1000 + 100);
  }
  const out = e.ctx.createGain();
  out.connect(e.music);
  fade(e, out, 0, 1);
  const p: Playing = {
    place, out, lanes: lanesFor(place), step: 0, next: e.ctx.currentTime + 0.05, sec: stepSeconds(TRACKS[place]), timer: 0,
  };
  p.timer = window.setInterval(() => tick(e, p), 25);
  tick(e, p);
  playing = p;
}

// Called from each scene's create(). The same place again (a restart on resize, the next room
// of a house) keeps the music going; a new one crossfades.
export function setPlace(place: Place) {
  if (wanted === place) return;
  wanted = place;
  onUnlock(start);
}

export function currentPlace(): Place | null {
  return wanted;
}
