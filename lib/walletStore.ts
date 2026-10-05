import { useSyncExternalStore } from 'react';
import type { CatalogItemId } from './types';
import {
  MIN_WORDS, NOTE_REWARD, STARTER_GRANT, applyLayoutChange, priceOf, qualifies, settle, wordCount,
  type Inventory, type WalletData,
} from './wallet';

export type Notice = { id: number; amount: number; text: string };
export type WalletView = { active: boolean; balance: number; inventory: Inventory; notice: Notice | null };

// key null = the demo town, whose notes reset on reload, so its wallet does too.
type Session = { key: string | null; qualifying: Set<string>; data: WalletData };

const INACTIVE: WalletView = { active: false, balance: 0, inventory: {}, notice: null };

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
      typeof d.inventory !== 'object' || d.inventory === null
    ) {
      return null;
    }
    return d as WalletData;
  } catch {
    return null;
  }
}

function publish(notice?: Notice | null) {
  if (!session) {
    view = INACTIVE;
  } else {
    view = {
      active: true,
      balance: session.data.balance,
      inventory: session.data.inventory,
      notice: notice === undefined ? view.notice : notice,
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
  publish(earned > 0 ? notice(earned, `You wrote "${title}"!`) : undefined);
}

// Null when saving this note can't pay: no wallet, it already counts, or deleted notes left
// the count below the record.
export function noteProgress(id: string, draft: string): { words: number; needed: number; reward: number } | null {
  if (!session || session.qualifying.has(id)) return null;
  if (session.qualifying.size + 1 <= session.data.record) return null;
  return { words: wordCount(draft), needed: MIN_WORDS, reward: NOTE_REWARD };
}

export function buy(item: CatalogItemId): boolean {
  const price = priceOf(item);
  if (!session || price === null || session.data.balance < price) return false;
  const inventory = { ...session.data.inventory, [item]: (session.data.inventory[item] ?? 0) + 1 };
  session.data = { ...session.data, balance: session.data.balance - price, inventory };
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
