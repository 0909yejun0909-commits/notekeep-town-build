import type { Appearance } from './types';
import { DEFAULT_APPEARANCE } from './characterCatalog';

const KEY = 'notekeep-town:appearance';

export function loadAppearance(): Appearance {
  if (typeof window === 'undefined') return DEFAULT_APPEARANCE;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_APPEARANCE;
    return { ...DEFAULT_APPEARANCE, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function saveAppearance(appearance: Appearance): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(appearance));
  } catch {
    // Private browsing / storage disabled — customization just won't persist across reloads.
  }
}
