import type { PetId, SkinId } from './rewards';

export const STAT_KEYS = [
  'notesRead', 'housesVisited', 'coinsEarned', 'roomFurniture',
  'exteriorsChanged', 'biomesTried', 'tilesWalked', 'stillMinute',
] as const;
export type StatKey = (typeof STAT_KEYS)[number];

export type Reward = { kind: 'skin'; id: SkinId } | { kind: 'pet'; id: PetId };

export type Achievement = {
  id: string;
  name: string;
  description: string;
  secret: boolean;
  stat: StatKey;
  target: number;
  reward: Reward;
};

export type AchievementState = {
  stats: Partial<Record<StatKey, number>>;
  seen: Partial<Record<StatKey, string[]>>;
  unlocked: Record<string, number>;
};

export type Change = { state: AchievementState; newly: Achievement[] };

export const emptyState = (): AchievementState => ({ stats: {}, seen: {}, unlocked: {} });

function settle(
  prev: AchievementState,
  stats: AchievementState['stats'],
  seen: AchievementState['seen'],
  now: number,
  list: readonly Achievement[],
): Change {
  const unlocked = { ...prev.unlocked };
  const newly: Achievement[] = [];
  for (const a of list) {
    if (unlocked[a.id] === undefined && (stats[a.stat] ?? 0) >= a.target) {
      unlocked[a.id] = now;
      newly.push(a);
    }
  }
  return { state: { stats, seen, unlocked }, newly };
}

export function bump(
  state: AchievementState, stat: StatKey, amount: number, now: number, list: readonly Achievement[],
): Change {
  if (!Number.isFinite(amount) || amount <= 0) return { state, newly: [] };
  return settle(state, { ...state.stats, [stat]: (state.stats[stat] ?? 0) + amount }, state.seen, now, list);
}

export function bumpDistinct(
  state: AchievementState, stat: StatKey, value: string, now: number, list: readonly Achievement[],
): Change {
  const seen = state.seen[stat] ?? [];
  if (seen.includes(value)) return { state, newly: [] };
  const next = [...seen, value];
  return settle(state, { ...state.stats, [stat]: next.length }, { ...state.seen, [stat]: next }, now, list);
}

export function bumpMax(
  state: AchievementState, stat: StatKey, value: number, now: number, list: readonly Achievement[],
): Change {
  if (!Number.isFinite(value) || value <= (state.stats[stat] ?? 0)) return { state, newly: [] };
  return settle(state, { ...state.stats, [stat]: value }, state.seen, now, list);
}

export const current = (state: AchievementState, a: Achievement): number => state.stats[a.stat] ?? 0;

export const progress = (state: AchievementState, a: Achievement): number =>
  Math.min(1, current(state, a) / a.target);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function parseState(raw: unknown): AchievementState {
  const out = emptyState();
  if (!isRecord(raw)) return out;
  const known = new Set<string>(STAT_KEYS);
  if (isRecord(raw.stats)) {
    for (const [k, v] of Object.entries(raw.stats)) {
      if (known.has(k) && typeof v === 'number' && Number.isFinite(v) && v >= 0) out.stats[k as StatKey] = v;
    }
  }
  if (isRecord(raw.seen)) {
    for (const [k, v] of Object.entries(raw.seen)) {
      if (known.has(k) && Array.isArray(v) && v.every((x) => typeof x === 'string')) out.seen[k as StatKey] = v;
    }
  }
  if (isRecord(raw.unlocked)) {
    for (const [k, v] of Object.entries(raw.unlocked)) {
      if (typeof v === 'number' && Number.isFinite(v)) out.unlocked[k] = v;
    }
  }
  return out;
}
