import { useSyncExternalStore } from 'react';

// How the app looks, picked by the player and remembered in this browser: how pixelated its
// text is, and whether it's the town at all or a plain notebook.

export type FontStyle = 'pixel' | 'mixed' | 'smooth';
export type ViewMode = 'game' | 'notebook';

export const FONT_STYLES: { id: FontStyle; label: string; hint: string }[] = [
  { id: 'pixel', label: 'Pixel', hint: 'Chunky pixel letters everywhere, notes too' },
  { id: 'mixed', label: 'Soft pixel', hint: 'Finer pixel letters, book type for notes' },
  { id: 'smooth', label: 'Smooth', hint: 'Rounded, smooth type everywhere' },
];

const FONT_KEY = 'notekeep-town:font';
const VIEW_KEY = 'notekeep-town:view';

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return (allowed as readonly string[]).includes(v ?? '') ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: the choice lasts until the page reloads.
  }
}

let font: FontStyle | null = null;
let view: ViewMode | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export function fontStyle(): FontStyle {
  return (font ??= read(FONT_KEY, ['pixel', 'mixed', 'smooth'] as const, 'mixed'));
}

export function viewMode(): ViewMode {
  return (view ??= read(VIEW_KEY, ['game', 'notebook'] as const, 'game'));
}

// The font is a data attribute on <html>: app/globals.css swaps the fonts from it.
export function applyFont() {
  document.documentElement.dataset.font = fontStyle();
}

export function setFontStyle(next: FontStyle) {
  font = next;
  write(FONT_KEY, next);
  applyFont();
  notify();
}

// Before the view switches, whatever's open gets a chance to save (an edited note). If one
// can't, the view stays as it is, so nothing typed is lost.
const flushers = new Set<() => Promise<void>>();
export function onBeforeViewSwitch(fn: () => Promise<void>): () => void {
  flushers.add(fn);
  return () => void flushers.delete(fn);
}

export async function setViewMode(next: ViewMode): Promise<boolean> {
  if (next === viewMode()) return true;
  const results = await Promise.allSettled([...flushers].map((f) => f()));
  if (results.some((r) => r.status === 'rejected')) return false;
  view = next;
  write(VIEW_KEY, next);
  notify();
  return true;
}

// The note that was open as the view switched, for the other view to open too.
let focusNote: string | null = null;
export function setFocusNote(id: string | null) {
  focusNote = id;
}
export function takeFocusNote(): string | null {
  const id = focusNote;
  focusNote = null;
  return id;
}

export function useFontStyle(): FontStyle {
  return useSyncExternalStore(subscribe, fontStyle, () => 'mixed');
}

export function useViewMode(): ViewMode {
  return useSyncExternalStore(subscribe, viewMode, () => 'game');
}
