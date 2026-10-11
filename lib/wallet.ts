import { CATALOG_BY_ID } from './catalog';
import type { CatalogItemId, CatalogTier, TownBiome } from './types';

export const NOTE_REWARD = 10;
export const MIN_WORDS = 30;
// Past the first MIN_WORDS, every this many more words in a note pays NOTE_REWARD again.
export const MORE_WORDS = 100;
export const STARTER_GRANT = 50;
// How much of each note is read when a town opens (lib/vault/open.ts); word counts past it
// are only known once the note is opened.
export const HEAD_BYTES = 2048;
// "Your town", the one kept in the browser, starts richer: it's where new players begin.
export const TOWN_GRANT = 100;

// Passing a quiz at a desk pays once a day, a coin more for each day in a row.
export const STUDY_REWARD = 5;
export const STREAK_BONUS_CAP = 10;

// days in a row a quiz was passed, through lastDay (the player's local YYYY-MM-DD).
export type Streak = { days: number; lastDay: string | null };
export const NO_STREAK: Streak = { days: 0, lastDay: null };

// Per tier, so catalog pieces added later are priced by the tier they're given in lib/catalog.ts.
export const TIER_PRICE: Record<CatalogTier, number> = {
  common: 15, uncommon: 30, rare: 60, treasure: 150,
};

export type Inventory = Record<CatalogItemId, number>;

// `record` is the most reward units ever paid for (see rewardUnits). Counting instead of
// remembering paths means a note renamed or moved in Obsidian never pays twice. Wallets saved
// before word milestones counted notes instead; `v: 2` marks one that counts units.
// `unlocks` are bought once and kept: house upgrades, outfit pieces and town biomes, by
// unlockId(). Wallets saved before unlocks existed have none.
export type WalletData = { balance: number; record: number; inventory: Inventory; unlocks?: string[]; streak: Streak; v?: 2 };

// Prices of what can be unlocked. Anything not listed is free: wood houses with base walls, the
// starting outfit, the forest town. A house's or outfit's current look never needs unlocking.
const UNLOCK_PRICES: Record<string, number> = {
  'biome:snow': 120,
  'biome:desert': 120,
  // House shapes, the cheapest first: every house starts as shape 0, the plain cottage.
  'shape:3': 30, 'shape:1': 50, 'shape:2': 50, 'shape:4': 100,
  'material:stone': 60, 'material:limestone': 90,
  // Rooms start small.
  'roomSize:medium': 40, 'roomSize:large': 80,
  'wall:green': 20, 'wall:red': 20,
  'roof:black': 15, 'roof:blue': 15, 'roof:red': 15,
};
const OUTFIT_PRICES: Record<string, number> = {
  hairStyle: 25, hairColor: 15, shirtColor: 15, pantsColor: 15, shoesColor: 10,
};

export function unlockId(kind: string, value: string | number): string {
  return `${kind}:${value}`;
}

// 0 = free. Outfit pieces are priced by their row; the starting outfit's own pieces are free.
export function unlockPrice(id: string, freeOutfit: Record<string, string | number> = {}): number {
  if (id in UNLOCK_PRICES) return UNLOCK_PRICES[id];
  const [kind, value] = id.split(':');
  if (kind in OUTFIT_PRICES) return String(freeOutfit[kind]) === value ? 0 : OUTFIT_PRICES[kind];
  return 0;
}

export function biomeUnlockId(biome: TownBiome): string {
  return unlockId('biome', biome);
}

const WORD = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

export function wordCount(md: string): number {
  const body = md
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/^---\n[\s\S]*?\n(---|\.\.\.)(\n|$)/, '')
    .replace(/%%[\s\S]*?(%%|$)/g, ' ');
  return body.match(WORD)?.length ?? 0;
}

export function qualifies(md: string): boolean {
  return wordCount(md) >= MIN_WORDS;
}

// What a note is worth, in NOTE_REWARDs: one at MIN_WORDS, one more per MORE_WORDS after.
export function unitsFor(words: number): number {
  return words < MIN_WORDS ? 0 : 1 + Math.floor((words - MIN_WORDS) / MORE_WORDS);
}

export function rewardUnits(md: string): number {
  return unitsFor(wordCount(md));
}

// The word count at which a note is next worth more.
export function nextMilestone(words: number): number {
  return words < MIN_WORDS ? MIN_WORDS : MIN_WORDS + unitsFor(words) * MORE_WORDS;
}

// `units` is the town's notes' reward units now; `notes` how many notes have any (what a
// wallet from before word milestones counted), so one of those is converted without paying
// for words that were already there.
export function settle(
  saved: WalletData | null,
  units: number,
  notes = units,
  grant = STARTER_GRANT,
): { data: WalletData; earned: number; fresh: boolean } {
  if (!saved) {
    return { data: { balance: grant, record: units, inventory: {}, streak: NO_STREAK, v: 2 }, earned: 0, fresh: true };
  }
  if (saved.v !== 2) saved = { ...saved, v: 2, record: units - Math.max(0, notes - saved.record) };
  const earned = Math.max(0, units - saved.record) * NOTE_REWARD;
  if (earned === 0) return { data: saved, earned, fresh: false };
  return {
    data: { ...saved, balance: saved.balance + earned, record: units },
    earned,
    fresh: false,
  };
}

export function withStreak(d: Omit<WalletData, 'streak'> & { streak?: Streak }): WalletData {
  return { ...d, streak: d.streak ?? NO_STREAK };
}

const pad = (n: number) => String(n).padStart(2, '0');
export function localDay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function dayBefore(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return localDay(new Date(y, m - 1, d - 1));
}

export function currentStreak(s: Streak, today: string): number {
  return s.lastDay === today || s.lastDay === dayBefore(today) ? s.days : 0;
}

export function settleStudy(data: WalletData, today: string): { data: WalletData; earned: number } {
  if (data.streak.lastDay === today) return { data, earned: 0 };
  const days = data.streak.lastDay === dayBefore(today) ? data.streak.days + 1 : 1;
  const earned = STUDY_REWARD + Math.min(days - 1, STREAK_BONUS_CAP);
  return { data: { ...data, balance: data.balance + earned, streak: { days, lastDay: today } }, earned };
}

export function priceOf(item: CatalogItemId): number | null {
  const entry = CATALOG_BY_ID[item];
  return entry ? TIER_PRICE[entry.tier] : null;
}

function countOf(placements: { item: CatalogItemId }[], item: CatalogItemId): number {
  let n = 0;
  for (const p of placements) if (p.item === item) n++;
  return n;
}

// What the room editor can still place: pieces in the inventory, plus pieces the draft has
// taken out of the saved layout, minus pieces the draft has added.
export function available(
  inventory: Inventory,
  saved: { item: CatalogItemId }[],
  draft: { item: CatalogItemId }[],
  item: CatalogItemId,
): number {
  return (inventory[item] ?? 0) + countOf(saved, item) - countOf(draft, item);
}

export function applyLayoutChange(
  inventory: Inventory,
  saved: { item: CatalogItemId }[],
  draft: { item: CatalogItemId }[],
): Inventory {
  const items = new Set([...Object.keys(inventory), ...saved.map((p) => p.item), ...draft.map((p) => p.item)]);
  const next: Inventory = {};
  for (const item of items) {
    const n = available(inventory, saved, draft, item);
    if (n > 0) next[item] = n;
  }
  return next;
}
