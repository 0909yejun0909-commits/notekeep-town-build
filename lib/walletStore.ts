import { useSyncExternalStore } from 'react';
import { track } from './achievementStore';
import type { CatalogItemId } from './types';
import {
  MIN_WORDS, NOTE_REWARD, STARTER_GRANT, applyLayoutChange, currentStreak, localDay, priceOf, qualifies, settle,
  settleStudy, unlockPrice, withStreak, wordCount, type Inventory, type WalletData,
} from './wallet';
import { DEFAULT_APPEARANCE } from './characterCatalog';

export type Notice = { id: number; amount: number; text: string };
export type WalletView = {
  active: boolean;
  balance: number;
  inventory: Inventory;
  unlocks: readonly string[];
  notice: Notice | null;
  streak: number;
  studiedToday: boolean;
};

// key null = the demo town, whose notes reset on reload, so its wallet does too.
type Session = { key: string | null; qualifying: Set<string>; data: WalletData };

const INACTIVE: WalletView = { active: false, balance: 0, inventory: {}, unlocks: [], notice: null, streak: 0, studiedToday: false };
const NO_UNLOCKS: readonly string[] = [];

let session: Session | null = null;
let view: WalletView = INACTIVE;
let nextNoticeId = 1;
const listeners = new Set<() => void>();

function load(key: string): WalletData | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (
      typeof d !== 'object' || d === null ||
      typeof d.balance !== 'number' || typeof d.record !== 'number' ||
      typeof d.inventory !== 'object' || d.inventory === null ||
      (d.unlocks !== undefined && !Array.isArray(d.unlocks))
    ) {
      return null;
    }
    // Saves from before the study streak have none; a malformed one is dropped, not the wallet.
    if (d.streak !== undefined && (typeof d.streak !== 'object' || d.streak === null || typeof d.streak.days !== 'number')) {
      delete d.streak;
    }
    return withStreak(d);
  } catch {
    return null;
  }
}

function publish(notice?: Notice | null) {
  if (!session) {
    view = INACTIVE;
  } else {
    const today = localDay(new Date());
    view = {
      active: true,
      balance: session.data.balance,
      inventory: session.data.inventory,
      unlocks: session.data.unlocks ?? NO_UNLOCKS,
      notice: notice === undefined ? view.notice : notice,
      streak: currentStreak(session.data.streak, today),
      studiedToday: session.data.streak.lastDay === today,
    };
    if (session.key) {
      try {
        localStorage.setItem(session.key, JSON.stringify(session.data));
      } catch {
        // Storage full or unavailable (private browsing) — the wallet just won't persist.
      }
    }
  }
  listeners.forEach((l) => l());
}

function notice(amount: number, text: string): Notice {
  return { id: nextNoticeId++, amount, text };
}

export function startWallet(vaultName: string, persist: boolean, heads: Map<string, string>) {
  const key = persist ? `wallet:${vaultName}` : null;
  const qualifying = new Set<string>();
  for (const [id, head] of heads) if (qualifies(head)) qualifying.add(id);
  const { data, earned, fresh } = settle(key ? load(key) : null, qualifying.size);
  session = { key, qualifying, data };
  const n = earned / NOTE_REWARD;
  if (earned > 0) track('coinsEarned', earned);
  publish(
    fresh
      ? notice(STARTER_GRANT, `Welcome to town! Every new note of ${MIN_WORDS}+ words earns ${NOTE_REWARD} coins.`)
      : earned > 0
        ? notice(earned, `You wrote ${n} new ${n === 1 ? 'note' : 'notes'} since your last visit!`)
        : null,
  );
}

export function stopWallet() {
  session = null;
  publish();
}

export function noteSaved(id: string, content: string, title: string) {
  if (!session) return;
  if (qualifies(content)) session.qualifying.add(id);
  else session.qualifying.delete(id);
  const { data, earned } = settle(session.data, session.qualifying.size);
  session.data = data;
  if (earned > 0) track('coinsEarned', earned);
  publish(earned > 0 ? notice(earned, `You wrote "${title}"!`) : undefined);
}

// Null when saving this note can't pay: no wallet, it already counts, or deleted notes left
// the count below the record.
export function noteProgress(id: string, draft: string): { words: number; needed: number; reward: number } | null {
  if (!session || session.qualifying.has(id)) return null;
  if (session.qualifying.size + 1 <= session.data.record) return null;
  return { words: wordCount(draft), needed: MIN_WORDS, reward: NOTE_REWARD };
}

// Passing a quiz at a desk. Returns the coins paid: 0 when today's reward is already taken.
export function studyPassed(): number {
  if (!session) return 0;
  const { data, earned } = settleStudy(session.data, localDay(new Date()));
  session.data = data;
  if (earned > 0) {
    const days = data.streak.days;
    publish(notice(earned, days === 1 ? 'Studied today! Come back tomorrow to start a streak.' : `Study streak: ${days} days!`));
  }
  return earned;
}

// Per-vault storage for things that aren't money (the computer's blocklist, arcade scores),
// next to the wallet. Null in the demo town, whose wallet doesn't persist either.
export function vaultStorageKey(suffix: string): string | null {
  return session?.key ? `${session.key}:${suffix}` : null;
}

export function buy(item: CatalogItemId): boolean {
  const price = priceOf(item);
  if (!session || price === null || session.data.balance < price) return false;
  const inventory = { ...session.data.inventory, [item]: (session.data.inventory[item] ?? 0) + 1 };
  session.data = { ...session.data, balance: session.data.balance - price, inventory };
  publish();
  return true;
}

// What an unlock costs right now: 0 when it's free or already bought.
export function unlockCost(view: WalletView, id: string): number {
  return view.unlocks.includes(id) ? 0 : unlockPrice(id, DEFAULT_APPEARANCE);
}

// Buys every id at once, or none if they cost more than the balance. Without a wallet (the
// title screen, a study-session guest) only free things can be had.
export function unlockAll(ids: string[]): boolean {
  const todo = [...new Set(ids)].filter((id) => unlockCost(view, id) > 0);
  if (todo.length === 0) return true;
  if (!session) return false;
  const price = todo.reduce((n, id) => n + unlockPrice(id, DEFAULT_APPEARANCE), 0);
  if (session.data.balance < price) return false;
  session.data = {
    ...session.data,
    balance: session.data.balance - price,
    unlocks: [...(session.data.unlocks ?? []), ...todo],
  };
  publish();
  return true;
}

// The tutorial makes sure every purchase it asks for is affordable. Only the tutorial town's
// wallet, which isn't saved, is ever topped up.
export function topUpTutorial(min: number) {
  if (!session || session.key !== null || session.data.balance >= min) return;
  const gift = min - session.data.balance;
  session.data = { ...session.data, balance: min };
  publish(notice(gift, 'Tutorial bonus, so you can try everything.'));
}

// Coins for something other than a note (resting, meditating). No wallet, nothing paid.
export function reward(amount: number, text: string) {
  if (!session || amount <= 0) return;
  session.data = { ...session.data, balance: session.data.balance + amount };
  track('coinsEarned', amount);
  publish(notice(amount, text));
}

// Pays for something with no inventory of its own (village building). False, and nothing
// spent, when the balance is short or there's no wallet.
export function spend(amount: number): boolean {
  if (amount <= 0) return true;
  if (!session || session.data.balance < amount) return false;
  session.data = { ...session.data, balance: session.data.balance - amount };
  publish();
  return true;
}

export function commitLayoutChange(saved: { item: CatalogItemId }[], draft: { item: CatalogItemId }[]) {
  if (!session) return;
  session.data = { ...session.data, inventory: applyLayoutChange(session.data.inventory, saved, draft) };
  publish();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useWallet(): WalletView {
  return useSyncExternalStore(subscribe, () => view, () => INACTIVE);
}
