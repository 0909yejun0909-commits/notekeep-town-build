'use client';

import { useSyncExternalStore } from 'react';
import type { Direction } from '@/game/gridMovement';
import { MAX_CHAT, cleanName, type Presence, type SceneId, type ShareMode } from './protocol.ts';
import type { EndReason, Room, RoomEvent } from './room.ts';

// The one study-session store. React reads it through useSession; Phaser reads
// presence through onPresence, which never touches React state (it fires ~7×/s
// per walking player).

export const RELAY_URL = process.env.NEXT_PUBLIC_RELAY_URL ?? '';

export type SessionEnd = EndReason | 'broken-link';

export const END_MESSAGES: Record<SessionEnd, string> = {
  'host-left': 'The host left, so the study session is over.',
  'room-not-found': 'That study session has ended or never existed.',
  'room-full': 'That study session is full (16 people).',
  'too-large': 'A message was too large for the relay.',
  'connection-lost': 'Lost the connection to the study session.',
  'relay-unreachable': "Couldn't reach the multiplayer server.",
  'broken-link': 'This invite link is broken or incomplete. Ask the host to send it again.',
};

export type Peer = { id: string; name: string };
export type ChatLine = { id: number; from: string; name: string; text: string; at: number };

export type SessionState = {
  status: 'off' | 'live' | 'ended';
  role: 'host' | 'guest' | null;
  selfId: string | null;
  name: string;
  share: ShareMode;
  invite: string | null;
  peers: Peer[];
  chat: ChatLine[];
  end: SessionEnd | null;
};

const OFF: SessionState = {
  status: 'off', role: null, selfId: null, name: '', share: 'notes', invite: null, peers: [], chat: [], end: null,
};
const MAX_LINES = 100;
const NAME_KEY = 'notekeep:name';

let state = OFF;
let room: Room | null = null;
let cleanup: (() => void) | null = null;
let selfPresence: Omit<Presence, 'name'> = { scene: null, gx: 0, gy: 0, facing: 'down' };
let nextChatId = 1;
const listeners = new Set<() => void>();
const presences = new Map<string, Presence>();
const presenceListeners = new Set<(peerId: string, p: Presence | null) => void>();

function set(patch: Partial<SessionState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function getSession(): SessionState {
  return state;
}

export function subscribeSession(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useSession(): SessionState {
  return useSyncExternalStore(subscribeSession, getSession, () => OFF);
}

export function loadName(): string {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, cleanName(name));
  } catch {
    // Private browsing — the name just isn't remembered.
  }
}

function sendSelfPresence(to: string) {
  if (!room || state.status !== 'live') return;
  room.send(to, { t: 'presence', name: state.name, ...selfPresence }).catch(() => {});
}

function upsertPresence(peerId: string, p: Presence) {
  presences.set(peerId, p);
  presenceListeners.forEach((l) => l(peerId, p));
  const i = state.peers.findIndex((x) => x.id === peerId);
  if (i === -1) set({ peers: [...state.peers, { id: peerId, name: p.name }] });
  else if (state.peers[i].name !== p.name) set({ peers: state.peers.map((x) => (x.id === peerId ? { ...x, name: p.name } : x)) });
}

function dropPeer(peerId: string) {
  if (presences.delete(peerId)) presenceListeners.forEach((l) => l(peerId, null));
  if (state.peers.some((x) => x.id === peerId)) set({ peers: state.peers.filter((x) => x.id !== peerId) });
}

function addChat(from: string, name: string, text: string) {
  const line: ChatLine = { id: nextChatId++, from, name, text, at: Date.now() };
  set({ chat: [...state.chat, line].slice(-MAX_LINES) });
}

function handleRoomEvent(e: RoomEvent) {
  switch (e.kind) {
    case 'peer-joined':
      sendSelfPresence(e.peerId);
      break;
    case 'peer-left':
      dropPeer(e.peerId);
      break;
    case 'reconnected':
      // Everyone else sees us leave and rejoin, and re-announces themselves to the new id.
      for (const id of [...presences.keys()]) dropPeer(id);
      set({ selfId: e.selfId });
      sendSelfPresence('all');
      break;
    case 'message':
      if (e.msg.t === 'presence') {
        const { t: _t, ...p } = e.msg;
        upsertPresence(e.from, p);
      } else if (e.msg.t === 'chat') {
        addChat(e.from, presences.get(e.from)?.name ?? 'Someone', e.msg.text);
      }
      break;
    case 'closed':
      endSession(e.reason);
      break;
  }
}

export function startSession(
  r: Room,
  role: 'host' | 'guest',
  name: string,
  opts: { share: ShareMode; invite: string | null },
  onEnd: () => void,
) {
  room = r;
  cleanup = onEnd;
  set({ ...OFF, status: 'live', role, selfId: r.selfId, name: cleanName(name), share: opts.share, invite: opts.invite });
  r.on(handleRoomEvent);
  sendSelfPresence('all');
}

export function endSession(reason: SessionEnd | null) {
  const r = room;
  room = null;
  cleanup?.();
  cleanup = null;
  r?.close();
  for (const id of [...presences.keys()]) dropPeer(id);
  set(reason ? { ...OFF, status: 'ended', role: state.role, end: reason } : OFF);
}

export function dismissEnd() {
  set(OFF);
}

export function setSessionShare(share: ShareMode) {
  if (state.share !== share) set({ share });
}

export function sendChat(text: string) {
  const clean = text.trim().slice(0, MAX_CHAT);
  if (!clean || !room || state.status !== 'live' || !state.selfId) return;
  room.send('all', { t: 'chat', text: clean }).catch(() => {});
  addChat(state.selfId, state.name, clean);
}

export function setSelfPresence(p: { scene: SceneId; gx: number; gy: number; facing: Direction }) {
  selfPresence = p;
  sendSelfPresence('all');
}

export function onPresence(cb: (peerId: string, p: Presence | null) => void): () => void {
  presenceListeners.add(cb);
  return () => {
    presenceListeners.delete(cb);
  };
}

export function currentPresences(): Array<[string, Presence]> {
  return [...presences.entries()];
}
