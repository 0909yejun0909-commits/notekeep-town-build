import { useSyncExternalStore } from 'react';

// The guided tutorial (components/Tutorial.tsx): off, or the step it's on. The title menu's
// Tutorial item starts it; finishing, skipping or going Home ends it.

let step: number | null = null;
const listeners = new Set<() => void>();

function set(next: number | null) {
  step = next;
  listeners.forEach((l) => l());
}

export function startTutorial() {
  set(0);
}

export function setTutorialStep(next: number) {
  if (step !== null) set(next);
}

export function endTutorial() {
  set(null);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useTutorialStep(): number | null {
  return useSyncExternalStore(subscribe, () => step, () => null);
}

// The title screen points new players at the Tutorial once, on their very first visit.
const OFFERED_KEY = 'notekeep-town:tutorial-offered';

export function tutorialOffered(): boolean {
  try {
    return localStorage.getItem(OFFERED_KEY) === '1';
  } catch {
    return true;
  }
}

export function markTutorialOffered() {
  try {
    localStorage.setItem(OFFERED_KEY, '1');
  } catch {
    // Storage unavailable: the pointer just shows again next visit.
  }
}
