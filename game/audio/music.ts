import { parsePattern, stepSeconds, type NoteEvent } from '@/lib/music';
import { TRACKS, type Place } from '@/lib/tracks';
import { sampleUrl, trackSamples } from '@/lib/samples';
import { loadSample, onUnlock, type Engine } from '@/game/audio/engine';
import { voice } from '@/game/audio/voices';

// A look-ahead sequencer: every 25ms, schedule whatever notes fall in the next 150ms on the
// audio clock, which keeps time even when the game loop stutters.

const AHEAD = 0.15;
const FADE = 1;

type Lane = { play: ReturnType<typeof voice>; gain: number; slide: boolean; length: number; at: Array<NoteEvent | undefined> };
type Playing = { place: Place; out: GainNode; lanes: Lane[]; step: number; next: number; sec: number; timer: number };

const lanes: Partial<Record<Place, Lane[]>> = {};
// `scene` is the place the player is in; `override` is a track picked at a sound device, which
// plays instead until it's stopped.
let scene: Place | null = null;
let override: Place | null = null;
let wanted: Place | null = null;
let playing: Playing | null = null;

function lanesFor(place: Place): Lane[] {
  return (lanes[place] ??= TRACKS[place].parts.map((part) => {
    const { length, events } = parsePattern(part.pattern);
    const at: Lane['at'] = new Array(length);
    for (const ev of events) at[ev.step] = ev;
    return { play: voice(part.voice), gain: part.gain, slide: !!part.slide, length, at };
  }));
}

function samplesFor(place: Place): string[] {
  return [...new Set(trackSamples(TRACKS[place]).map(([inst, m]) => sampleUrl(inst, m)))];
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
      const midis = ev.midis.length ? ev.midis : [0];
      const gain = lane.gain / Math.sqrt(midis.length);
      for (const m of midis) lane.play(e, p.out, p.next, m, ev.len * p.sec, gain, lane.slide);
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

function start(e: Engine, place: Place) {
  if (wanted !== place || playing?.place === place) return;
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

function retarget() {
  const place = override ?? scene;
  if (!place || wanted === place) return;
  wanted = place;
  void Promise.all(samplesFor(place).map(loadSample)).then(() => onUnlock((e) => start(e, place)));
}

// Called from each scene's create(). The same place again (a restart on resize, the next room
// of a house) keeps the music going; a new one crossfades in once its recordings have loaded,
// the old one playing on meanwhile.
export function setPlace(place: Place) {
  scene = place;
  retarget();
}

// A device's track (null: back to the place's own music).
export function playTrack(place: Place | null) {
  override = place;
  retarget();
}
