import { test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import {
  createRelay,
  CLOSE_ROOM_CLOSED,
  CLOSE_ROOM_FULL,
  CLOSE_ROOM_NOT_FOUND,
  CLOSE_TOO_MANY,
  type RelayOptions,
} from './server.mts';

type Msg = { type: string; [key: string]: unknown };

function client(port: number, room: string, headers: Record<string, string> = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/?room=${room}`, { headers });
  const inbox: Msg[] = [];
  let wake: (() => void) | null = null;
  ws.on('message', (raw) => {
    inbox.push(JSON.parse(raw.toString()));
    wake?.();
  });
  ws.on('error', () => {});
  const closed = new Promise<number>((resolve) => ws.on('close', (code) => resolve(code)));
  async function next(type: string): Promise<Msg> {
    for (;;) {
      const i = inbox.findIndex((m) => m.type === type);
      if (i !== -1) return inbox.splice(i, 1)[0];
      await new Promise<void>((r) => (wake = r));
    }
  }
  const send = (to: string, data: string) => ws.send(JSON.stringify({ to, data }));
  return { ws, inbox, next, closed, send };
}

async function room(opts: RelayOptions, guests: number) {
  const relay = await createRelay({ port: 0, ...opts });
  const host = client(relay.port, 'new');
  const welcome = await host.next('welcome');
  const roomId = welcome.roomId as string;
  const joined = [];
  for (let i = 0; i < guests; i++) {
    const g = client(relay.port, roomId);
    const w = await g.next('welcome');
    await host.next('peer-joined');
    joined.push({ ...g, id: w.peerId as string });
  }
  return { relay, host, hostId: welcome.peerId as string, roomId, guests: joined };
}

const T = { timeout: 5000 };

test('a host gets a fresh unguessable room and is its own host', T, async () => {
  const { relay, host, hostId, roomId } = await room({}, 0);
  assert.match(roomId, /^[A-Za-z0-9_-]{22}$/);
  assert.ok(hostId);
  host.ws.close();
  await relay.close();
});

test('a guest learns the host id and existing peers; the host is told', T, async () => {
  const { relay, host, hostId, roomId, guests } = await room({}, 1);
  const late = client(relay.port, roomId);
  const w = await late.next('welcome');
  assert.equal(w.hostId, hostId);
  assert.deepEqual(new Set(w.peers as string[]), new Set([hostId, guests[0].id]));
  assert.equal((await host.next('peer-joined')).peerId, w.peerId);
  assert.equal((await guests[0].next('peer-joined')).peerId, w.peerId);
  host.ws.close();
  await relay.close();
});

test('messages route to host, to everyone else, or to one peer, stamped with the sender', T, async () => {
  const { relay, host, hostId, guests: [a, b] } = await room({}, 2);

  a.send('host', 'to-host');
  assert.deepEqual(await host.next('msg'), { type: 'msg', from: a.id, data: 'to-host' });

  host.send('all', 'to-all');
  assert.equal((await a.next('msg')).data, 'to-all');
  assert.equal((await b.next('msg')).data, 'to-all');
  a.send('host', 'sentinel-1');
  assert.equal((await host.next('msg')).data, 'sentinel-1', 'host must not receive its own broadcast');

  host.send(b.id, 'to-b');
  assert.equal((await b.next('msg')).data, 'to-b');
  host.send(a.id, 'sentinel-2');
  assert.equal((await a.next('msg')).data, 'sentinel-2', 'a must not receive a message addressed to b');
  assert.equal(host.inbox.length, 0);
  assert.ok(hostId);

  host.ws.close();
  await relay.close();
});

test('joining a room that does not exist is refused with 4004', T, async () => {
  const relay = await createRelay({ port: 0 });
  const g = client(relay.port, 'AAAAAAAAAAAAAAAAAAAAAA');
  assert.equal((await g.next('error')).code, 'room-not-found');
  assert.equal(await g.closed, CLOSE_ROOM_NOT_FOUND);
  await relay.close();
});

test('a full room refuses the next guest with 4003', T, async () => {
  const { relay, host, roomId } = await room({ maxPeers: 2 }, 1);
  const extra = client(relay.port, roomId);
  assert.equal((await extra.next('error')).code, 'room-full');
  assert.equal(await extra.closed, CLOSE_ROOM_FULL);
  host.ws.close();
  await relay.close();
});

test('one address cannot hold more than maxPerIp connections at once', T, async () => {
  const { relay, host, roomId, guests: [a] } = await room({ maxPerIp: 2 }, 1);
  const extra = client(relay.port, roomId);
  assert.equal((await extra.next('error')).code, 'too-many-connections');
  assert.equal(await extra.closed, CLOSE_TOO_MANY);
  a.ws.close();
  await host.next('peer-left');
  const later = client(relay.port, roomId);
  await later.next('welcome');
  later.ws.close();
  host.ws.close();
  await relay.close();
});

test('behind a proxy the client address comes from the configured header', T, async () => {
  const relay = await createRelay({ port: 0, maxPerIp: 1, ipHeader: 'fly-client-ip' });
  const a = client(relay.port, 'new', { 'fly-client-ip': '203.0.113.1' });
  const b = client(relay.port, 'new', { 'fly-client-ip': '203.0.113.2' });
  await a.next('welcome');
  await b.next('welcome');
  const c = client(relay.port, 'new', { 'fly-client-ip': '203.0.113.1' });
  assert.equal(await c.closed, CLOSE_TOO_MANY);
  a.ws.close();
  b.ws.close();
  await relay.close();
});

test('the room dies with its host', T, async () => {
  const { relay, host, roomId, guests: [a] } = await room({}, 1);
  host.ws.close();
  await a.next('room-closed');
  assert.equal(await a.closed, CLOSE_ROOM_CLOSED);
  const again = client(relay.port, roomId);
  assert.equal(await again.closed, CLOSE_ROOM_NOT_FOUND);
  await relay.close();
});

test('a guest leaving is announced to the rest', T, async () => {
  const { relay, host, guests: [a] } = await room({}, 1);
  a.ws.close();
  assert.equal((await host.next('peer-left')).peerId, a.id);
  host.ws.close();
  await relay.close();
});

test('an oversize frame closes only the sender', T, async () => {
  const { relay, host, guests: [a, b] } = await room({ maxPayload: 1024 }, 2);
  a.send('host', 'x'.repeat(2048));
  assert.equal(await a.closed, 1009);
  b.send('host', 'still-open');
  assert.equal((await host.next('msg')).data, 'still-open');
  host.ws.close();
  await relay.close();
});

test('a flooding connection is told once and its excess is dropped', T, async () => {
  const { relay, host, guests: [a] } = await room({ rateMax: 5 }, 1);
  for (let i = 0; i < 10; i++) a.send('host', `m${i}`);
  assert.equal((await a.next('error')).code, 'rate-limited');
  a.send('all', 'flush');
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(host.inbox.filter((m) => m.type === 'msg').length, 5);
  assert.equal(a.inbox.filter((m) => m.type === 'error').length, 0);
  host.ws.close();
  await relay.close();
});
