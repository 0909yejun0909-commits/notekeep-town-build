import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRelay } from '../../relay/server.mts';
import { generateRoomKey } from './crypto.ts';
import { Room, RoomError, type RoomEvent } from './room.ts';

function nextEvent(room: Room, match: (e: RoomEvent) => boolean): Promise<RoomEvent> {
  return new Promise((resolve) => {
    const off = room.on((e) => {
      if (!match(e)) return;
      off();
      resolve(e);
    });
  });
}

const T = { timeout: 5000 };

test('host and guest exchange decrypted, validated messages', T, async () => {
  const relay = await createRelay({ port: 0 });
  const url = `ws://127.0.0.1:${relay.port}`;
  const key = await generateRoomKey();
  const host = await Room.create(url, key);
  const joined = nextEvent(host, (e) => e.kind === 'peer-joined');
  const guest = await Room.join(url, host.roomId, key);
  assert.equal(guest.hostId, host.selfId);
  assert.equal(((await joined) as { peerId: string }).peerId, guest.selfId);

  const heard = nextEvent(host, (e) => e.kind === 'message');
  await guest.send('host', { t: 'chat', text: '  hi  ' });
  assert.deepEqual(await heard, { kind: 'message', from: guest.selfId, msg: { t: 'chat', text: 'hi' } });

  host.close();
  guest.close();
  await relay.close();
});

test('rapid messages arrive in the order they were sent', T, async () => {
  const relay = await createRelay({ port: 0 });
  const url = `ws://127.0.0.1:${relay.port}`;
  const key = await generateRoomKey();
  const host = await Room.create(url, key);
  const guest = await Room.join(url, host.roomId, key);
  const seen: number[] = [];
  const done = new Promise<void>((resolve) =>
    guest.on((e) => {
      if (e.kind === 'message' && e.msg.t === 'presence') seen.push(e.msg.gx);
      if (seen.length === 20) resolve();
    }),
  );
  for (let gx = 0; gx < 20; gx++) host.send('all', { t: 'presence', name: 'H', scene: 'overworld', gx, gy: 0, facing: 'down' });
  await done;
  assert.deepEqual(seen, [...Array(20).keys()]);
  host.close();
  guest.close();
  await relay.close();
});

test('the guest is told when the host ends the room', T, async () => {
  const relay = await createRelay({ port: 0 });
  const url = `ws://127.0.0.1:${relay.port}`;
  const key = await generateRoomKey();
  const host = await Room.create(url, key);
  const guest = await Room.join(url, host.roomId, key);
  const ended = nextEvent(guest, (e) => e.kind === 'closed');
  host.close();
  assert.deepEqual(await ended, { kind: 'closed', reason: 'host-left' });
  await relay.close();
});

test('a guest with the wrong key is heard as undecryptable', T, async () => {
  const relay = await createRelay({ port: 0 });
  const url = `ws://127.0.0.1:${relay.port}`;
  const host = await Room.create(url, await generateRoomKey());
  const guest = await Room.join(url, host.roomId, await generateRoomKey());
  const bad = nextEvent(host, (e) => e.kind === 'undecryptable');
  await guest.send('host', { t: 'hello' });
  assert.deepEqual(await bad, { kind: 'undecryptable', from: guest.selfId });
  host.close();
  guest.close();
  await relay.close();
});

test('joining a missing room or an absent relay fails with a reason', T, async () => {
  const relay = await createRelay({ port: 0 });
  const key = await generateRoomKey();
  await assert.rejects(
    Room.join(`ws://127.0.0.1:${relay.port}`, 'AAAAAAAAAAAAAAAAAAAAAA', key),
    (err) => err instanceof RoomError && err.reason === 'room-not-found',
  );
  await relay.close();
  await assert.rejects(
    Room.create(`ws://127.0.0.1:${relay.port}`, key),
    (err) => err instanceof RoomError && err.reason === 'relay-unreachable',
  );
});

test('a frame over the relay limit is refused locally instead of killing the socket', T, async () => {
  const relay = await createRelay({ port: 0 });
  const url = `ws://127.0.0.1:${relay.port}`;
  const key = await generateRoomKey();
  const host = await Room.create(url, key);
  await assert.rejects(
    host.send('all', { t: 'note-res', reqId: '1', ok: true, b64: 'A'.repeat(7 * 1024 * 1024) }),
    (err) => err instanceof RoomError && err.reason === 'too-large',
  );
  const guest = await Room.join(url, host.roomId, key);
  assert.ok(guest.selfId, 'room still alive after the refused send');
  host.close();
  guest.close();
  await relay.close();
});
