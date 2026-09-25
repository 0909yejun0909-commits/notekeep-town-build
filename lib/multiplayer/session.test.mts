import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRelay } from '../../relay/server.mts';
import { generateRoomKey } from './crypto.ts';
import { Room, type RoomEvent } from './room.ts';
import {
  endSession,
  getSession,
  onPresence,
  sendChat,
  setSelfPresence,
  startSession,
  subscribeSession,
  type SessionState,
} from './session.ts';

function until(check: (s: SessionState) => boolean): Promise<SessionState> {
  return new Promise((resolve) => {
    if (check(getSession())) return resolve(getSession());
    const off = subscribeSession(() => {
      if (!check(getSession())) return;
      off();
      resolve(getSession());
    });
  });
}

function heard(room: Room, t: string): Promise<RoomEvent & { kind: 'message' }> {
  return new Promise((resolve) => {
    const off = room.on((e) => {
      if (e.kind !== 'message' || e.msg.t !== t) return;
      off();
      resolve(e);
    });
  });
}

const T = { timeout: 5000 };

test('a live session announces itself, tracks peers and carries chat both ways', T, async () => {
  const relay = await createRelay({ port: 0 });
  const url = `ws://127.0.0.1:${relay.port}`;
  const key = await generateRoomKey();
  const hostRoom = await Room.create(url, key);
  let cleanedUp = false;
  startSession(hostRoom, 'host', '  Ada  ', { share: 'notes', invite: 'link' }, () => (cleanedUp = true));
  setSelfPresence({ scene: 'overworld', gx: 4, gy: 5, facing: 'up' });
  assert.equal(getSession().status, 'live');
  assert.equal(getSession().name, 'Ada');

  const guest = await Room.join(url, hostRoom.roomId, key);
  const greeting = await heard(guest, 'presence');
  assert.deepEqual(greeting.msg, { t: 'presence', name: 'Ada', scene: 'overworld', gx: 4, gy: 5, facing: 'up' });

  const moves: Array<[string, unknown]> = [];
  const offMoves = onPresence((id, p) => moves.push([id, p]));
  await guest.send('all', { t: 'presence', name: 'Bo', scene: 'overworld', gx: 1, gy: 1, facing: 'down' });
  const withBo = await until((s) => s.peers.length === 1);
  assert.deepEqual(withBo.peers, [{ id: guest.selfId, name: 'Bo' }]);
  assert.equal(moves[0][0], guest.selfId);

  await guest.send('all', { t: 'chat', text: 'hello' });
  const withChat = await until((s) => s.chat.length === 1);
  assert.equal(withChat.chat[0].name, 'Bo');
  assert.equal(withChat.chat[0].text, 'hello');

  const reply = heard(guest, 'chat');
  sendChat('  hi there  ');
  assert.deepEqual((await reply).msg, { t: 'chat', text: 'hi there' });
  assert.equal(getSession().chat.at(-1)?.from, hostRoom.selfId);

  guest.close();
  await until((s) => s.peers.length === 0);
  assert.deepEqual(moves.at(-1), [guest.selfId, null]);

  offMoves();
  endSession(null);
  assert.equal(getSession().status, 'off');
  assert.ok(cleanedUp);
  await relay.close();
});

test('a guest session ends with the reason when the host goes away', T, async () => {
  const relay = await createRelay({ port: 0 });
  const url = `ws://127.0.0.1:${relay.port}`;
  const key = await generateRoomKey();
  const hostRoom = await Room.create(url, key);
  const guestRoom = await Room.join(url, hostRoom.roomId, key);
  startSession(guestRoom, 'guest', 'Bo', { share: 'notes', invite: null }, () => {});
  hostRoom.close();
  const ended = await until((s) => s.status === 'ended');
  assert.equal(ended.end, 'host-left');
  assert.equal(ended.role, 'guest');
  await relay.close();
});
