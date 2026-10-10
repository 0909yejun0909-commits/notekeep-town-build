import { DAILY_CALM_CAP, calmPayout, dayKey, type CalmDay } from './chill';
import { reward } from './walletStore';

const KEY = 'notekeep-town:calm';

function load(): CalmDay | null {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return d && typeof d.day === 'string' && typeof d.coins === 'number' ? d : null;
  } catch {
    return null;
  }
}

export function calmLeftToday(): number {
  const saved = load();
  return DAILY_CALM_CAP - (saved && saved.day === dayKey(new Date()) ? saved.coins : 0);
}

// Pays what a rest or meditation earned, within today's limit. Returns the coins paid.
export function payCalm(wanted: number, text: string): number {
  const { grant, next } = calmPayout(load(), wanted, dayKey(new Date()));
  if (grant <= 0) return 0;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable (private browsing): today's limit just won't be remembered.
  }
  reward(grant, text);
  return grant;
}
