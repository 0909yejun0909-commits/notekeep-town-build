import { CATALOG_BY_ID } from './catalog';
import type { CatalogItemId, CatalogTier } from './types';

export const NOTE_REWARD = 10;
export const MIN_WORDS = 30;
export const STARTER_GRANT = 50;

// Per tier, so catalog pieces added later are priced by the tier they're given in lib/catalog.ts.
export const TIER_PRICE: Record<CatalogTier, number> = {
  common: 15, uncommon: 30, rare: 60, treasure: 150,
};

export type Inventory = Record<CatalogItemId, number>;

// `record` is the most qualifying notes ever paid for. Counting instead of remembering paths
// means a note renamed or moved in Obsidian never pays twice.
export type WalletData = { balance: number; record: number; inventory: Inventory };

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

export function settle(
  saved: WalletData | null,
  qualifyingCount: number,
): { data: WalletData; earned: number; fresh: boolean } {
  if (!saved) {
    return { data: { balance: STARTER_GRANT, record: qualifyingCount, inventory: {} }, earned: 0, fresh: true };
  }
  const earned = Math.max(0, qualifyingCount - saved.record) * NOTE_REWARD;
  if (earned === 0) return { data: saved, earned, fresh: false };
  return {
    data: { ...saved, balance: saved.balance + earned, record: qualifyingCount },
    earned,
    fresh: false,
  };
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
