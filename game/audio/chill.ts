import { useSyncExternalStore } from 'react';
import { AMBIENCES, DEFAULT_LEVEL, type AmbienceId } from '@/lib/chill';
import type { Place } from '@/lib/tracks';
import { onUnlock } from '@/game/audio/engine';
import { LAYERS } from '@/game/audio/ambience';
import { playTrack } from '@/game/audio/music';

// What the player has switched on at a sound device: one of the town's tracks, and any mix of
// ambient layers, each with its own volume. It lives here, not in a scene, so it keeps playing
// when you walk out of the room, and the overlays that show it just read this.

const PREFS_KEY = 'notekeep-town:chill';
const FADE = 0.8;

export type ChillState = { track: Place | null; levels: Partial<Record<AmbienceId, number>> };

let state: ChillState = { track: null, levels: {} };
const listeners = new Set<() => void>();
const running = new Map<AmbienceId, { gain: GainNode; stop: () => void }>();
const liked: Partial<Record<AmbienceId, number>> = loadLiked();

function loadLiked(): Partial<Record<AmbienceId, number>> {
  try {
    const raw = typeof window === 'undefined' ? null : localStorage.getItem(PREFS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Partial<Record<AmbienceId, number>> = {};
    for (const { id } of AMBIENCES) {
      const v = parsed[id];
      if (typeof v === 'number' && v > 0 && v <= 1) out[id] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function remember(id: AmbienceId, level: number) {
  liked[id] = level;
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(liked));
  } catch {
    // Storage unavailable (private browsing): the volume just won't be remembered.
  }
}

function emit(next: ChillState) {
  state = next;
  listeners.forEach((l) => l());
}

export const likedLevel = (id: AmbienceId) => liked[id] ?? DEFAULT_LEVEL;

export function setTrack(place: Place | null) {
  playTrack(place);
  emit({ ...state, track: place });
}

// Level 0 turns the layer off.
export function setLevel(id: AmbienceId, level: number) {
  const clamped = Math.max(0, Math.min(1, level));
  if (clamped > 0) remember(id, clamped);
  const levels = { ...state.levels };
  if (clamped > 0) levels[id] = clamped;
  else delete levels[id];
  emit({ ...state, levels });
  onUnlock((e) => {
    const want = state.levels[id] ?? 0;
    const now = e.ctx.currentTime;
    let layer = running.get(id);
    if (want <= 0) {
      if (!layer) return;
      running.delete(id);
      layer.gain.gain.cancelScheduledValues(now);
      layer.gain.gain.setTargetAtTime(0, now, FADE / 3);
      const done = layer;
      window.setTimeout(() => {
        done.stop();
        done.gain.disconnect();
      }, FADE * 1000 + 100);
      return;
    }
    if (!layer) {
      const g = e.ctx.createGain();
      g.gain.value = 0;
      g.connect(e.ambience);
      layer = { gain: g, stop: LAYERS[id](e, g) };
      running.set(id, layer);
    }
    layer.gain.gain.cancelScheduledValues(now);
    layer.gain.gain.setTargetAtTime(want, now, FADE / 3);
  });
}

export function toggleAmbience(id: AmbienceId) {
  setLevel(id, state.levels[id] ? 0 : likedLevel(id));
}

export function stopAll() {
  setTrack(null);
  for (const { id } of AMBIENCES) if (state.levels[id]) setLevel(id, 0);
}

export const isPlaying = (s: ChillState) => s.track !== null || Object.keys(s.levels).length > 0;

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useChill(): ChillState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}
