import { ACHIEVEMENTS } from './achievements';
import {
  bump, bumpDistinct, bumpMax, emptyState, parseState,
  type Achievement, type AchievementState, type Change, type StatKey,
} from './achievementState';
import { PETS, SKINS, type PetId, type SkinId } from './rewards';

export type Equipped = { skin: SkinId | null; pet: PetId | null };
export type Toast = { id: number; achievement: Achievement };
export type AchievementView = { active: boolean; state: AchievementState; toasts: Toast[] };

const EQUIPPED_KEY = 'notekeep-town:equipped';
const UNLOCK_ALL_KEY = 'notekeep-town:unlock-all';
const SAVE_DELAY_MS = 1000;

type Session = { key: string | null; state: AchievementState };

export const INACTIVE_VIEW: AchievementView = { active: false, state: emptyState(), toasts: [] };

let session: Session | null = null;
let view: AchievementView = INACTIVE_VIEW;
let nextToastId = 1;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

export function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getView(): AchievementView {
  return view;
}

function publish(toasts: Toast[]) {
  view = session ? { active: true, state: session.state, toasts } : INACTIVE_VIEW;
  listeners.forEach((l) => l());
}

function load(key: string): AchievementState {
  try {
    const raw = localStorage.getItem(key);
    return raw ? parseState(JSON.parse(raw)) : emptyState();
  } catch {
    return emptyState();
  }
}

function flush() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (!session?.key) return;
  try {
    localStorage.setItem(session.key, JSON.stringify(session.state));
  } catch {
    // Storage full or unavailable (private browsing) — progress just won't persist.
  }
}

function saveSoon() {
  if (saveTimer || !session?.key) return;
  saveTimer = setTimeout(flush, SAVE_DELAY_MS);
}

export function startAchievements(vaultName: string, persist: boolean) {
  flush();
  const key = persist ? `achievements:${vaultName}` : null;
  session = { key, state: key ? load(key) : emptyState() };
  publish([]);
}

export function stopAchievements() {
  flush();
  session = null;
  publish([]);
}

function apply({ state, newly }: Change) {
  if (!session || state === session.state) return;
  session.state = state;
  saveSoon();
  if (newly.length === 0) return;
  flush();
  publish([...view.toasts, ...newly.map((achievement) => ({ id: nextToastId++, achievement }))]);
}

export function track(stat: StatKey, amount = 1) {
  if (session) apply(bump(session.state, stat, amount, Date.now(), ACHIEVEMENTS));
}

export function trackDistinct(stat: StatKey, value: string) {
  if (session) apply(bumpDistinct(session.state, stat, value, Date.now(), ACHIEVEMENTS));
}

export function trackMax(stat: StatKey, value: number) {
  if (session) apply(bumpMax(session.state, stat, value, Date.now(), ACHIEVEMENTS));
}

export function dismissToast(id: number) {
  if (view.toasts.some((t) => t.id === id)) publish(view.toasts.filter((t) => t.id !== id));
}

// Counting doesn't republish (it would re-render every subscriber on every step); the panel
// calls this when it opens so its progress bars are current.
export function refreshAchievements() {
  publish(view.toasts);
}

function unlockAll(): boolean {
  try {
    return localStorage.getItem(UNLOCK_ALL_KEY) === '1';
  } catch {
    return false;
  }
}

export function isUnlocked(kind: 'skin' | 'pet', id: string): boolean {
  if (unlockAll()) return true;
  if (!session) return false;
  return ACHIEVEMENTS.some(
    (a) => a.reward.kind === kind && a.reward.id === id && session!.state.unlocked[a.id] !== undefined,
  );
}

function loadEquipped(): Equipped {
  try {
    const raw = JSON.parse(localStorage.getItem(EQUIPPED_KEY) ?? 'null');
    return {
      skin: SKINS.find((s) => s.id === raw?.skin)?.id ?? null,
      pet: PETS.find((p) => p.id === raw?.pet)?.id ?? null,
    };
  } catch {
    return { skin: null, pet: null };
  }
}

export function getEquipped(): Equipped {
  const saved = loadEquipped();
  return {
    skin: saved.skin && isUnlocked('skin', saved.skin) ? saved.skin : null,
    pet: saved.pet && isUnlocked('pet', saved.pet) ? saved.pet : null,
  };
}

export function equip(next: Partial<Equipped>) {
  try {
    localStorage.setItem(EQUIPPED_KEY, JSON.stringify({ ...loadEquipped(), ...next }));
  } catch {
    // Storage unavailable — the choice just won't persist across reloads.
  }
}
