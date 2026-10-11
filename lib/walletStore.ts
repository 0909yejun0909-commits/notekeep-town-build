import { useSyncExternalStore } from 'react';
import { track } from './achievementStore';
import type { CatalogItemId } from './types';
import {
  HEAD_BYTES, MIN_WORDS, MORE_WORDS, NOTE_REWARD, STARTER_GRANT, applyLayoutChange, currentStreak, localDay, nextMilestone, priceOf, rewardUnits, settle,
  settleStudy, unlockPrice, withStreak, wordCount, type Inventory, type WalletData,
} from './wallet';
import { DEFAULT_APPEARANCE } from './characterCatalog';
import { movedPath } from './vault/paths';

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
// `units` is each note's reward units (wallet.ts rewardUnits). A note in `unsure` was only
// read as far as its head when the town opened, so its count may be short: its first save
// sets its real count without paying for words that were already there.
type Session = { key: string | null; units: Map<string, number>; unsure: Set<string>; data: WalletData };

const total = (s: Session) => {
  let n = 0;
  for (const u of s.units.values()) n += u;
  return n;
};

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

// `heads` holds each note's text, or only its first HEAD_BYTES for a big vault.
export function startWallet(vaultName: string, persist: boolean, heads: Map<string, string>, grant = STARTER_GRANT) {
  const key = persist ? `wallet:${vaultName}` : null;
  const units = new Map<string, number>();
  const unsure = new Set<string>();
  const encoder = new TextEncoder();
  for (const [id, head] of heads) {
    units.set(id, rewardUnits(head));
    if (encoder.encode(head).length >= HEAD_BYTES - 4) unsure.add(id);
  }
  const notes = [...units.values()].filter((u) => u > 0).length;
  session = { key, units, unsure, data: null as unknown as WalletData };
  const { data, earned, fresh } = settle(key ? load(key) : null, total(session), notes, grant);
  session.data = data;
  if (earned > 0) track('coinsEarned', earned);
  publish(
    fresh
      ? notice(grant, `Welcome to town! A new note of ${MIN_WORDS}+ words earns ${NOTE_REWARD} coins, and every ${MORE_WORDS} words more another ${NOTE_REWARD}.`)
      : earned > 0
        ? notice(earned, 'You wrote more since your last visit!')
        : null,
  );
}

// Notes brought into town from a folder: they count as already paid for, so only words
// written after this pay.
export function notesAdded(heads: Map<string, string>) {
  if (!session) return;
  const encoder = new TextEncoder();
  let extra = 0;
  for (const [id, head] of heads) {
    const u = rewardUnits(head);
    extra += u - (session.units.get(id) ?? 0);
    session.units.set(id, u);
    if (encoder.encode(head).length >= HEAD_BYTES - 4) session.unsure.add(id);
  }
  if (extra > 0) {
    session.data = { ...session.data, record: session.data.record + extra };
    publish();
  }
}

// A house was renamed: its notes are the same notes under new paths, already counted.
export function notesMoved(from: string, to: string) {
  if (!session) return;
  session.units = new Map([...session.units].map(([id, u]) => [movedPath(id, from, to), u]));
  session.unsure = new Set([...session.unsure].map((id) => movedPath(id, from, to)));
}

export function stopWallet() {
  session = null;
  publish();
}

export function noteSaved(id: string, content: string, title: string) {
  if (!session) return;
  const next = rewardUnits(content);
  if (session.unsure.delete(id)) {
    // Its real count, now known: anything above the guess was already written.
    const extra = next - (session.units.get(id) ?? 0);
    if (extra > 0) session.data = { ...session.data, record: session.data.record + extra };
  }
  session.units.set(id, next);
  const { data, earned } = settle(session.data, total(session));
  session.data = data;
  if (earned > 0) track('coinsEarned', earned);
  publish(earned > 0 ? notice(earned, `You wrote "${title}"!`) : undefined);
}

// What saving this draft would pay, or the word count it next pays at. Null when it can't pay:
// no wallet, a note not fully read yet, or deleted notes left the count below the record.
export function noteProgress(id: string, draft: string): { words: number; needed: number; reward: number } | null {
  if (!session || session.unsure.has(id)) return null;
  const words = wordCount(draft);
  const others = total(session) - (session.units.get(id) ?? 0);
  const pay = Math.max(0, others + rewardUnits(draft) - session.data.record) * NOTE_REWARD;
  if (pay > 0) return { words, needed: words, reward: pay };
  const needed = nextMilestone(words);
  if (others + rewardUnits(draft) + 1 <= session.data.record) return null;
  return { words, needed, reward: NOTE_REWARD };
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

// The wallet as it is right now, for code outside React (the game scenes).
export function walletNow(): WalletView {
  return view;
}

export function useWallet(): WalletView {
  return useSyncExternalStore(subscribe, () => view, () => INACTIVE);
}
