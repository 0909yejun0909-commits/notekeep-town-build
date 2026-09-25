# Multiplayer study sessions (v1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A host shares an invite link; friends join the host's town as avatars, walk around together (overworld and inside houses) and text-chat, with note bodies served end-to-end encrypted from the host's disk or the guest's own copy.

**Architecture:** A tiny `ws` relay (`relay/server.mts`) forwards opaque encrypted frames between peers in in-memory rooms. In the browser, `lib/multiplayer/room.ts` encrypts/decrypts with an AES-GCM key carried in the invite link's `#fragment`; `session.ts` is the one store React and Phaser both read (peers, chat, presence); `host.ts` / `guest.ts` plug into the existing `VaultHandle` + registry contract so `NoteReader`, `Bookshelf` and both scenes work unchanged for guests.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Phaser `^3.90.0`, `ws` 8, WebCrypto, Node ≥ 22.18 built-in test runner with native type stripping.

**Spec:** `docs/superpowers/specs/2026-09-24-multiplayer-design.md`

## Global Constraints

- Phaser stays `^3.90.0`. Never v4.
- Solo play is unchanged when `NEXT_PUBLIC_RELAY_URL` is unset: no multiplayer UI renders, no socket opens.
- Relay limits: 16 peers per room, `maxPayload` 8 MiB (`8 * 1024 * 1024`), 60 messages/second/connection, room ids `randomBytes(16).toString('base64url')`.
- Shared file cap: 4 MiB raw (`MAX_SHARED_BYTES`). Chat ≤ 500 chars (`MAX_CHAT`). Display name ≤ 24 chars (`MAX_NAME`).
- Files loaded by `node --test` (`relay/*.mts`, `lib/multiplayer/crypto.ts`, `protocol.ts`, `noteAccess.ts`, `room.ts`, `lib/safeUrl.ts`) must have **no runtime `@/` imports** (type-only `import type` is fine — Node erases it) and must write relative runtime imports with an explicit `.ts` extension. Only erasable TypeScript: no enums, namespaces or constructor parameter properties.
- Every text input rendered over the canvas stops keydown propagation (`onKeyDown={(e) => e.stopPropagation()}`), because Phaser's window-level key captures for W/A/S/D/Space/Enter persist across scenes.
- All user-facing UI is React overlaid on the canvas. Never UI inside Phaser.
- New dependencies: `ws` and dev `@types/ws` only.
- Commit titles are specific and descriptive (house convention); every commit ends with the `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` trailer.

## Deviations from the spec (decided while planning)

- **One `world` message instead of `snapshot` + `world-updated` + `share-changed`.** All three carried the same payload (`{world, layouts, share}`); the guest diff-checks what changed. `snapshot.players` is dropped: every peer re-sends its own presence to a newcomer on `peer-joined`, which also covers reconnects. `hello` carries no name (presence does).
- **Binary cap is 4 MiB, not ≈6 MiB.** Bytes are base64'd inside the JSON message and the ciphertext is base64'd again for the frame (×4/3 twice): 4 MiB → ≈7.5 MiB frame, under the 8 MiB relay limit. `Room.send` also refuses any frame over the limit so a host can never get its own socket (and therefore the room) closed by an oversize reply.
- **Chat focus key is `T`, not `Enter`.** `Enter` already opens notes and the shelf inside houses (`InteriorScene`).

## Review Focus

1. **Typing over a live game.** Typing "wasd", spaces or Enter into chat, the name fields or the invite dialog must type, not walk or open furniture. A movement key held while focusing chat must not leave the player walking. → Task 9, manual checks in Step 9.
2. **Invite link with a stripped or truncated `#key`** (messengers often mangle fragments) → the join screen says the link is broken within seconds; it never hangs on "Joining…". → Task 3 test `importRoomKey rejects malformed keys`, Task 7 maps it to `broken-link`, Task 10 manual step.
3. **A guest joining mid-session while the host is inside a house** sees everyone already present immediately, only in the scene they are actually in. → Task 6 re-sends presence on `peer-joined`; Task 10 manual step.
4. **A note whose embedded image does not exist on the host** still opens promptly with the image just missing — the host always replies, never lets the 15 s timeout run. → Task 5 test `missing binary returns an error reply`.
5. **Hostile chat text** (HTML, markdown, 10 000 characters) renders literally and is cut at 500. → Task 3 test `chat is trimmed and capped`, Task 10 manual step.

---

### Task 1: Safe markdown URLs + test runner

Guests will render notes written by someone else. `NoteReader` currently passes every URL through untouched.

**Files:**
- Create: `lib/safeUrl.ts`
- Create: `lib/safeUrl.test.mts`
- Modify: `components/NoteReader.tsx:3` (import), `:394` and `:431` (`urlTransform`)
- Modify: `package.json` (add `test` script)
- Modify: `tsconfig.json` (add `allowImportingTsExtensions`)

**Interfaces:**
- Produces: `safeUrl(url: string): string`; `npm test` runs every `relay/*.test.mts` and `lib/**/*.test.mts`.

- [ ] **Step 1: Add the test script and the tsconfig flag**

`package.json` scripts become:

```json
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "node --test \"relay/*.test.mts\" \"lib/**/*.test.mts\""
```

`tsconfig.json` `compilerOptions` gains (valid because `noEmit` is already true):

```json
    "allowImportingTsExtensions": true,
```

- [ ] **Step 2: Write the failing test** — `lib/safeUrl.test.mts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeUrl } from './safeUrl.ts';

test('keeps the blob: and wikilink: URLs the reader creates itself', () => {
  assert.equal(safeUrl('blob:http://localhost:3000/4f1c'), 'blob:http://localhost:3000/4f1c');
  assert.equal(safeUrl('wikilink:My%20Note'), 'wikilink:My%20Note');
});

test('keeps ordinary links and inline images', () => {
  assert.equal(safeUrl('https://example.com/a'), 'https://example.com/a');
  assert.equal(safeUrl('mailto:a@b.co'), 'mailto:a@b.co');
  assert.equal(safeUrl('relative/path.png'), 'relative/path.png');
  assert.equal(safeUrl('data:image/png;base64,iVBORw0KGgo='), 'data:image/png;base64,iVBORw0KGgo=');
});

test('drops script and document URLs', () => {
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl('JavaScript:alert(1)'), '');
  assert.equal(safeUrl('vbscript:msgbox(1)'), '');
  assert.equal(safeUrl('data:text/html,<script>alert(1)</script>'), '');
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../lib/safeUrl.ts'`.

- [ ] **Step 4: Implement** — `lib/safeUrl.ts`

```ts
import { defaultUrlTransform } from 'react-markdown';

// Notes can come from another player's vault, so only the reader's own blob:/wikilink:
// URLs and inline images skip react-markdown's scheme filter (which drops javascript: etc.).
export function safeUrl(url: string): string {
  if (url.startsWith('blob:') || url.startsWith('wikilink:') || /^data:image\//i.test(url)) return url;
  return defaultUrlTransform(url);
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npm test`
Expected: PASS, 3 tests.

- [ ] **Step 6: Use it in NoteReader**

Add `import { safeUrl } from '@/lib/safeUrl';` after the `remarkGfm` import, and replace both occurrences of `urlTransform={(url) => url}` with `urlTransform={safeUrl}`.

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add lib/safeUrl.ts lib/safeUrl.test.mts components/NoteReader.tsx package.json tsconfig.json
git commit -m "Stop NoteReader rendering javascript: and other unsafe URLs from notes"
```

---

### Task 2: The relay

**Files:**
- Create: `relay/server.mts`
- Create: `relay/server.test.mts`
- Modify: `package.json` (deps + `relay` script)

**Interfaces:**
- Produces: `createRelay(opts?: RelayOptions): Promise<{ port: number; close(): Promise<void> }>`; `RelayOptions = { port?, maxPeers?, maxPayload?, rateMax?, heartbeatMs? }`; close codes `CLOSE_ROOM_CLOSED = 4001`, `CLOSE_ROOM_FULL = 4003`, `CLOSE_ROOM_NOT_FOUND = 4004` (oversize frames get `ws`'s own 1009).
- Wire protocol. Connect to `ws(s)://relay/?room=new` (host) or `?room=<id>` (guest). Client → relay: `{"to": "all" | "host" | <peerId>, "data": <string>}`. Relay → client: `{"type":"welcome","peerId","roomId","hostId","peers":[...]}`, `{"type":"peer-joined","peerId"}`, `{"type":"peer-left","peerId"}`, `{"type":"msg","from","data"}`, `{"type":"room-closed"}`, `{"type":"error","code":"room-not-found"|"room-full"|"rate-limited"}`.

- [ ] **Step 1: Install the dependency and add the script**

Run: `npm install ws@^8 && npm install -D @types/ws@^8`

Add to `package.json` scripts: `"relay": "node relay/server.mts"`.

- [ ] **Step 2: Write the failing tests** — `relay/server.test.mts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import {
  createRelay,
  CLOSE_ROOM_CLOSED,
  CLOSE_ROOM_FULL,
  CLOSE_ROOM_NOT_FOUND,
  type RelayOptions,
} from './server.mts';

type Msg = { type: string; [key: string]: unknown };

function client(port: number, room: string) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/?room=${room}`);
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
```

- [ ] **Step 3: Run to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../relay/server.mts'`.

- [ ] **Step 4: Implement** — `relay/server.mts`

```ts
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { pathToFileURL } from 'node:url';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';

// A dumb pipe for Notekeep Town study sessions. Rooms live in memory, frames are
// forwarded unread (clients encrypt end to end), and a room dies with its host.

export const CLOSE_ROOM_CLOSED = 4001;
export const CLOSE_ROOM_FULL = 4003;
export const CLOSE_ROOM_NOT_FOUND = 4004;

export type RelayOptions = {
  port?: number;
  maxPeers?: number;
  maxPayload?: number;
  rateMax?: number;
  heartbeatMs?: number;
};

type Peer = { id: string; ws: WebSocket; alive: boolean; windowStart: number; sent: number };
type Room = { id: string; host: Peer; peers: Map<string, Peer> };

function send(peer: Peer, msg: object) {
  if (peer.ws.readyState === peer.ws.OPEN) peer.ws.send(JSON.stringify(msg));
}

export async function createRelay(opts: RelayOptions = {}) {
  const maxPeers = opts.maxPeers ?? 16;
  const rateMax = opts.rateMax ?? 60;
  const rooms = new Map<string, Room>();
  const wss = new WebSocketServer({ port: opts.port ?? 8787, maxPayload: opts.maxPayload ?? 8 * 1024 * 1024 });

  wss.on('connection', (ws, req) => {
    ws.on('error', () => {});
    const wanted = new URL(req.url ?? '/', 'http://relay').searchParams.get('room');
    const peer: Peer = { id: randomBytes(8).toString('base64url'), ws, alive: true, windowStart: Date.now(), sent: 0 };
    ws.on('pong', () => {
      peer.alive = true;
    });

    let room: Room;
    if (wanted === 'new') {
      room = { id: randomBytes(16).toString('base64url'), host: peer, peers: new Map([[peer.id, peer]]) };
      rooms.set(room.id, room);
    } else {
      const existing = wanted ? rooms.get(wanted) : undefined;
      if (!existing) {
        send(peer, { type: 'error', code: 'room-not-found' });
        ws.close(CLOSE_ROOM_NOT_FOUND);
        return;
      }
      if (existing.peers.size >= maxPeers) {
        send(peer, { type: 'error', code: 'room-full' });
        ws.close(CLOSE_ROOM_FULL);
        return;
      }
      room = existing;
      for (const other of room.peers.values()) send(other, { type: 'peer-joined', peerId: peer.id });
      room.peers.set(peer.id, peer);
    }

    send(peer, {
      type: 'welcome',
      peerId: peer.id,
      roomId: room.id,
      hostId: room.host.id,
      peers: [...room.peers.keys()].filter((id) => id !== peer.id),
    });

    ws.on('message', (raw: RawData, isBinary: boolean) => {
      if (isBinary) return;
      const now = Date.now();
      if (now - peer.windowStart >= 1000) {
        peer.windowStart = now;
        peer.sent = 0;
      }
      peer.sent += 1;
      if (peer.sent > rateMax) {
        if (peer.sent === rateMax + 1) send(peer, { type: 'error', code: 'rate-limited' });
        return;
      }

      let msg: { to?: unknown; data?: unknown };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (typeof msg.to !== 'string' || typeof msg.data !== 'string') return;
      const out = { type: 'msg', from: peer.id, data: msg.data };
      if (msg.to === 'all') {
        for (const other of room.peers.values()) if (other !== peer) send(other, out);
      } else {
        const target = msg.to === 'host' ? room.host : room.peers.get(msg.to);
        if (target && target !== peer) send(target, out);
      }
    });

    ws.on('close', () => {
      if (!room.peers.delete(peer.id)) return;
      if (room.host === peer) {
        rooms.delete(room.id);
        const rest = [...room.peers.values()];
        room.peers.clear();
        for (const other of rest) {
          send(other, { type: 'room-closed' });
          other.ws.close(CLOSE_ROOM_CLOSED);
        }
      } else {
        for (const other of room.peers.values()) send(other, { type: 'peer-left', peerId: peer.id });
      }
    });
  });

  const heartbeat = setInterval(() => {
    for (const room of rooms.values()) {
      for (const peer of room.peers.values()) {
        if (!peer.alive) {
          peer.ws.terminate();
          continue;
        }
        peer.alive = false;
        peer.ws.ping();
      }
    }
  }, opts.heartbeatMs ?? 30_000);

  await once(wss, 'listening');
  return {
    port: (wss.address() as AddressInfo).port,
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(heartbeat);
        for (const ws of wss.clients) ws.terminate();
        wss.close(() => resolve());
      }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { port } = await createRelay({ port: Number(process.env.PORT) || 8787 });
  console.log(`Notekeep Town relay listening on ws://localhost:${port}`);
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `npm test`
Expected: PASS, all relay tests plus Task 1's.

- [ ] **Step 6: Smoke-run the entry point**

Run: `(PORT=8799 node relay/server.mts & pid=$!; sleep 1; kill $pid)`
Expected: prints `Notekeep Town relay listening on ws://localhost:8799`.

- [ ] **Step 7: Type-check and commit**

Run: `npx tsc --noEmit` — expected clean.

```bash
git add relay/ package.json package-lock.json
git commit -m "Add the self-hostable WebSocket relay for study sessions"
```

---

### Task 3: Encryption and message parsing

**Files:**
- Create: `lib/multiplayer/crypto.ts`, `lib/multiplayer/crypto.test.mts`
- Create: `lib/multiplayer/protocol.ts`, `lib/multiplayer/protocol.test.mts`

**Interfaces:**
- Produces (crypto): `bytesToBase64(bytes: Uint8Array): string`, `base64ToBytes(b64: string): Uint8Array<ArrayBuffer>`, `generateRoomKey(): Promise<CryptoKey>`, `exportRoomKey(key): Promise<string>` (43-char base64url), `importRoomKey(text): Promise<CryptoKey>` (throws on malformed), `sealMessage(key, plaintext): Promise<string>`, `openMessage(key, sealed): Promise<string>` (rejects on wrong key/tamper).
- Produces (protocol): types `ShareMode = 'notes' | 'town'`, `SceneId = 'overworld' | \`house:${string}\``, `Presence`, `WorldPayload`, `NoteRequest`, `NoteResponse`, `AppMessage`; constants `MAX_CHAT = 500`, `MAX_NAME = 24`; `cleanName(name: string): string`, `parseAppMessage(raw: string): AppMessage | null`.

- [ ] **Step 1: Write the failing tests** — `lib/multiplayer/crypto.test.mts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  base64ToBytes,
  bytesToBase64,
  exportRoomKey,
  generateRoomKey,
  importRoomKey,
  openMessage,
  sealMessage,
} from './crypto.ts';

test('a key survives the invite link and decrypts what the original sealed', async () => {
  const key = await generateRoomKey();
  const text = await exportRoomKey(key);
  assert.match(text, /^[A-Za-z0-9_-]{43}$/);
  const copy = await importRoomKey(text);
  assert.equal(await openMessage(copy, await sealMessage(key, 'hello ✏️')), 'hello ✏️');
});

test('sealing the same text twice gives different ciphertext', async () => {
  const key = await generateRoomKey();
  assert.notEqual(await sealMessage(key, 'same'), await sealMessage(key, 'same'));
});

test('the wrong key or a flipped byte is rejected', async () => {
  const key = await generateRoomKey();
  const sealed = await sealMessage(key, 'secret');
  await assert.rejects(openMessage(await generateRoomKey(), sealed));
  const bytes = base64ToBytes(sealed);
  bytes[bytes.length - 1] ^= 1;
  await assert.rejects(openMessage(key, bytesToBase64(bytes)));
});

test('importRoomKey rejects malformed keys', async () => {
  for (const bad of ['', 'abc', 'A'.repeat(42), 'A'.repeat(44), '!'.repeat(43)]) {
    await assert.rejects(importRoomKey(bad), `accepted ${JSON.stringify(bad)}`);
  }
});

test('base64 helpers handle large buffers', () => {
  const big = new Uint8Array(300_000).map((_, i) => i % 256);
  assert.deepEqual(base64ToBytes(bytesToBase64(big)), big);
});
```

- [ ] **Step 2: Write the failing tests** — `lib/multiplayer/protocol.test.mts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_CHAT, cleanName, parseAppMessage } from './protocol.ts';

const parse = (m: object) => parseAppMessage(JSON.stringify(m));

test('chat is trimmed and capped; empty chat is dropped', () => {
  assert.deepEqual(parse({ t: 'chat', text: '  hi  ' }), { t: 'chat', text: 'hi' });
  const long = parse({ t: 'chat', text: '<b>' + 'x'.repeat(10_000) });
  assert.equal(long?.t === 'chat' && long.text.length, MAX_CHAT);
  assert.equal(parse({ t: 'chat', text: '   ' }), null);
  assert.equal(parse({ t: 'chat', text: 42 }), null);
});

test('names collapse whitespace, cap at 24 and never come out empty', () => {
  assert.equal(cleanName('  Ada \n Lovelace '), 'Ada Lovelace');
  assert.equal(cleanName('x'.repeat(40)).length, 24);
  assert.equal(cleanName('   '), 'Guest');
});

test('presence needs integer tiles, a real facing and a known scene', () => {
  const ok = { t: 'presence', name: ' Bo ', scene: 'house:Work/Ideas', gx: 3, gy: 4, facing: 'left' };
  assert.deepEqual(parse(ok), { ...ok, name: 'Bo' });
  assert.deepEqual(parse({ ...ok, scene: null }), { ...ok, name: 'Bo', scene: null });
  assert.equal(parse({ ...ok, gx: 1.5 }), null);
  assert.equal(parse({ ...ok, facing: 'north' }), null);
  assert.equal(parse({ ...ok, scene: 'moon' }), null);
});

test('note requests need a path and a known kind', () => {
  assert.deepEqual(parse({ t: 'note-req', reqId: '1', path: 'a.md', kind: 'text' }), {
    t: 'note-req', reqId: '1', path: 'a.md', kind: 'text',
  });
  assert.equal(parse({ t: 'note-req', reqId: '1', path: 'a.md', kind: 'exec' }), null);
});

test('note responses keep only well-typed fields', () => {
  assert.deepEqual(parse({ t: 'note-res', reqId: '1', ok: false, error: 'nope' }), {
    t: 'note-res', reqId: '1', ok: false, error: 'nope',
  });
  assert.deepEqual(parse({ t: 'note-res', reqId: '1', ok: true, text: 'body', b64: 5 }), {
    t: 'note-res', reqId: '1', ok: true, text: 'body', b64: undefined, mime: undefined,
  });
});

test('world messages need regions and default to sharing notes', () => {
  const w = { t: 'world', world: { name: 'V', regions: [] }, layouts: {} };
  assert.deepEqual(parse(w), { ...w, share: 'notes' });
  assert.equal(parse({ ...w, share: 'town' })?.t, 'world');
  assert.equal(parse({ t: 'world', world: {}, layouts: {} }), null);
});

test('garbage and unknown types are ignored', () => {
  assert.equal(parseAppMessage('not json'), null);
  assert.equal(parseAppMessage('null'), null);
  assert.equal(parse({ t: 'shutdown' }), null);
  assert.deepEqual(parse({ t: 'hello', extra: 1 }), { t: 'hello' });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npm test` — expected FAIL, modules not found.

- [ ] **Step 4: Implement** — `lib/multiplayer/crypto.ts`

```ts
// End-to-end encryption for room traffic. The key travels only in the invite link's
// #fragment, which browsers never send to a server, so the relay only sees ciphertext.

const IV_BYTES = 12;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function generateRoomKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function exportRoomKey(key: CryptoKey): Promise<string> {
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key));
  return bytesToBase64(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function importRoomKey(text: string): Promise<CryptoKey> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(text)) throw new Error('Malformed room key');
  const raw = base64ToBytes(text.replace(/-/g, '+').replace(/_/g, '/') + '=');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function sealMessage(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plaintext)));
  const out = new Uint8Array(IV_BYTES + cipher.length);
  out.set(iv);
  out.set(cipher, IV_BYTES);
  return bytesToBase64(out);
}

export async function openMessage(key: CryptoKey, sealed: string): Promise<string> {
  const bytes = base64ToBytes(sealed);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytes.subarray(0, IV_BYTES) },
    key,
    bytes.subarray(IV_BYTES),
  );
  return decoder.decode(plain);
}
```

- [ ] **Step 5: Implement** — `lib/multiplayer/protocol.ts`

```ts
import type { Direction } from '@/game/gridMovement';
import type { InteriorLayout, WorldModel } from '@/lib/types';

// Everything peers say to each other, inside the encryption. Every inbound message goes
// through parseAppMessage, because other players' clients are not ours.

export type ShareMode = 'notes' | 'town';
export type SceneId = 'overworld' | `house:${string}`;

export type Presence = {
  name: string;
  scene: SceneId | null; // null while still on the title screen
  gx: number;
  gy: number;
  facing: Direction;
};

export type WorldPayload = {
  world: WorldModel;
  layouts: Record<string, InteriorLayout>;
  share: ShareMode;
};

export type NoteRequest = { reqId: string; path: string; kind: 'text' | 'binary' };

export type NoteResponse =
  | { t: 'note-res'; reqId: string; ok: true; text?: string; b64?: string; mime?: string }
  | { t: 'note-res'; reqId: string; ok: false; error: string };

export type AppMessage =
  | { t: 'hello' }
  | ({ t: 'world' } & WorldPayload)
  | ({ t: 'presence' } & Presence)
  | { t: 'chat'; text: string }
  | ({ t: 'note-req' } & NoteRequest)
  | NoteResponse;

export const MAX_CHAT = 500;
export const MAX_NAME = 24;
const FACINGS = ['down', 'right', 'up', 'left'];

export function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) || 'Guest';
}

const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

export function parseAppMessage(raw: string): AppMessage | null {
  let m: Record<string, any>;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!m || typeof m !== 'object') return null;

  switch (m.t) {
    case 'hello':
      return { t: 'hello' };
    case 'world':
      if (!m.world || !Array.isArray(m.world.regions) || !m.layouts || typeof m.layouts !== 'object') return null;
      return { t: 'world', world: m.world, layouts: m.layouts, share: m.share === 'town' ? 'town' : 'notes' };
    case 'presence': {
      const sceneOk = m.scene === null || m.scene === 'overworld' || (typeof m.scene === 'string' && m.scene.startsWith('house:'));
      if (typeof m.name !== 'string' || !sceneOk || !Number.isInteger(m.gx) || !Number.isInteger(m.gy) || !FACINGS.includes(m.facing)) {
        return null;
      }
      return { t: 'presence', name: cleanName(m.name), scene: m.scene, gx: m.gx, gy: m.gy, facing: m.facing };
    }
    case 'chat': {
      const text = typeof m.text === 'string' ? m.text.trim().slice(0, MAX_CHAT) : '';
      return text ? { t: 'chat', text } : null;
    }
    case 'note-req':
      if (typeof m.reqId !== 'string' || typeof m.path !== 'string' || (m.kind !== 'text' && m.kind !== 'binary')) return null;
      return { t: 'note-req', reqId: m.reqId, path: m.path, kind: m.kind };
    case 'note-res':
      if (typeof m.reqId !== 'string') return null;
      if (m.ok === true) return { t: 'note-res', reqId: m.reqId, ok: true, text: str(m.text), b64: str(m.b64), mime: str(m.mime) };
      return { t: 'note-res', reqId: m.reqId, ok: false, error: str(m.error) ?? 'Request failed.' };
    default:
      return null;
  }
}
```

- [ ] **Step 6: Run to verify they pass**

Run: `npm test` — expected PASS.

- [ ] **Step 7: Type-check and commit**

Run: `npx tsc --noEmit` — expected clean.

```bash
git add lib/multiplayer/crypto.ts lib/multiplayer/crypto.test.mts lib/multiplayer/protocol.ts lib/multiplayer/protocol.test.mts
git commit -m "Add end-to-end room encryption and validated study-session messages"
```

---

### Task 4: Room transport

**Files:**
- Create: `lib/multiplayer/room.ts`
- Create: `lib/multiplayer/room.test.mts`

**Interfaces:**
- Consumes: `sealMessage`, `openMessage` (Task 3); `parseAppMessage`, `AppMessage` (Task 3); relay wire protocol (Task 2).
- Produces:
  - `type EndReason = 'host-left' | 'room-not-found' | 'room-full' | 'too-large' | 'connection-lost' | 'relay-unreachable'`
  - `class RoomError extends Error { reason: EndReason }`
  - `type RoomEvent = { kind: 'peer-joined'; peerId } | { kind: 'peer-left'; peerId } | { kind: 'message'; from: string; msg: AppMessage } | { kind: 'undecryptable'; from: string } | { kind: 'reconnected'; selfId: string } | { kind: 'closed'; reason: EndReason }`
  - `class Room { selfId: string; readonly roomId; readonly hostId; readonly isHost; static create(relayUrl, key): Promise<Room>; static join(relayUrl, roomId, key): Promise<Room>; send(to: 'all' | 'host' | string, msg: AppMessage): Promise<void>; on(listener: (e: RoomEvent) => void): () => void; close(): void }`
  - Events are delivered strictly in arrival order. `close()` never emits `closed`.

- [ ] **Step 1: Write the failing tests** — `lib/multiplayer/room.test.mts`

```ts
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test` — expected FAIL, `room.ts` not found.

- [ ] **Step 3: Implement** — `lib/multiplayer/room.ts`

```ts
import { openMessage, sealMessage } from './crypto.ts';
import { parseAppMessage, type AppMessage } from './protocol.ts';

// One encrypted connection to a relay room. Guests quietly retry a dropped
// connection a few times; a host's room cannot outlive its socket, so hosts don't.

export type EndReason =
  | 'host-left'
  | 'room-not-found'
  | 'room-full'
  | 'too-large'
  | 'connection-lost'
  | 'relay-unreachable';

export class RoomError extends Error {
  reason: EndReason;
  constructor(reason: EndReason) {
    super(reason);
    this.reason = reason;
  }
}

export type RoomEvent =
  | { kind: 'peer-joined'; peerId: string }
  | { kind: 'peer-left'; peerId: string }
  | { kind: 'message'; from: string; msg: AppMessage }
  | { kind: 'undecryptable'; from: string }
  | { kind: 'reconnected'; selfId: string }
  | { kind: 'closed'; reason: EndReason };

type Welcome = { peerId: string; roomId: string; hostId: string };

const MAX_FRAME = 8 * 1024 * 1024 - 1024;
const RECONNECT_DELAYS = [1000, 2000, 4000];

function reasonFor(code: number): EndReason {
  if (code === 4001) return 'host-left';
  if (code === 4003) return 'room-full';
  if (code === 4004) return 'room-not-found';
  if (code === 1009) return 'too-large';
  return 'connection-lost';
}

function connect(relayUrl: string, room: string): Promise<{ ws: WebSocket; welcome: Welcome }> {
  return new Promise((resolve, reject) => {
    let ws: WebSocket;
    try {
      const url = new URL(relayUrl);
      url.searchParams.set('room', room);
      ws = new WebSocket(url);
    } catch {
      reject(new RoomError('relay-unreachable'));
      return;
    }
    let opened = false;
    ws.onopen = () => {
      opened = true;
    };
    ws.onmessage = (ev) => {
      let msg: { type?: string } & Partial<Welcome>;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (msg.type !== 'welcome') return;
      ws.onmessage = null;
      ws.onclose = null;
      resolve({ ws, welcome: msg as Welcome });
    };
    ws.onclose = (ev) => reject(new RoomError(opened ? reasonFor(ev.code) : 'relay-unreachable'));
  });
}

export class Room {
  selfId: string;
  readonly roomId: string;
  readonly hostId: string;
  readonly isHost: boolean;
  private relayUrl: string;
  private key: CryptoKey;
  private ws!: WebSocket;
  private listeners = new Set<(e: RoomEvent) => void>();
  private outbox: Promise<unknown> = Promise.resolve();
  private inbox: Promise<unknown> = Promise.resolve();
  private closing = false;

  static async create(relayUrl: string, key: CryptoKey): Promise<Room> {
    const { ws, welcome } = await connect(relayUrl, 'new');
    return new Room(relayUrl, key, ws, welcome, true);
  }

  static async join(relayUrl: string, roomId: string, key: CryptoKey): Promise<Room> {
    const { ws, welcome } = await connect(relayUrl, roomId);
    return new Room(relayUrl, key, ws, welcome, false);
  }

  private constructor(relayUrl: string, key: CryptoKey, ws: WebSocket, welcome: Welcome, isHost: boolean) {
    this.relayUrl = relayUrl;
    this.key = key;
    this.selfId = welcome.peerId;
    this.roomId = welcome.roomId;
    this.hostId = welcome.hostId;
    this.isHost = isHost;
    this.attach(ws);
  }

  on(listener: (e: RoomEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  send(to: 'all' | 'host' | string, msg: AppMessage): Promise<void> {
    const result = this.outbox.then(async () => {
      const frame = JSON.stringify({ to, data: await sealMessage(this.key, JSON.stringify(msg)) });
      if (frame.length > MAX_FRAME) throw new RoomError('too-large');
      if (this.ws.readyState === WebSocket.OPEN) this.ws.send(frame);
    });
    this.outbox = result.catch(() => {});
    return result;
  }

  close() {
    this.closing = true;
    this.ws.close(1000);
  }

  // Every event goes through one promise chain so decryption never reorders them.
  private emit(event: RoomEvent | (() => Promise<RoomEvent | null>)) {
    this.inbox = this.inbox.then(async () => {
      const e = typeof event === 'function' ? await event() : event;
      if (e) this.listeners.forEach((l) => l(e));
    });
  }

  private attach(ws: WebSocket) {
    this.ws = ws;
    ws.onmessage = (ev) => {
      let msg: { type?: string; peerId?: string; from?: string; data?: unknown };
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (msg.type === 'peer-joined' && msg.peerId) this.emit({ kind: 'peer-joined', peerId: msg.peerId });
      else if (msg.type === 'peer-left' && msg.peerId) this.emit({ kind: 'peer-left', peerId: msg.peerId });
      else if (msg.type === 'msg' && msg.from && typeof msg.data === 'string') {
        const from = msg.from;
        const data = msg.data;
        this.emit(async () => {
          let plain: string;
          try {
            plain = await openMessage(this.key, data);
          } catch {
            return { kind: 'undecryptable', from };
          }
          const parsed = parseAppMessage(plain);
          return parsed ? { kind: 'message', from, msg: parsed } : null;
        });
      }
    };
    ws.onclose = (ev) => {
      void this.dropped(ev.code);
    };
  }

  private async dropped(code: number) {
    if (this.closing) return;
    const reason = reasonFor(code);
    if (!this.isHost && reason === 'connection-lost') {
      for (const delay of RECONNECT_DELAYS) {
        await new Promise((r) => setTimeout(r, delay));
        if (this.closing) return;
        try {
          const { ws, welcome } = await connect(this.relayUrl, this.roomId);
          this.selfId = welcome.peerId;
          this.attach(ws);
          this.emit({ kind: 'reconnected', selfId: this.selfId });
          return;
        } catch (err) {
          const r = err instanceof RoomError ? err.reason : 'connection-lost';
          if (r === 'room-not-found') return this.finish('host-left');
          if (r !== 'connection-lost' && r !== 'relay-unreachable') return this.finish(r);
        }
      }
    }
    this.finish(reason);
  }

  private finish(reason: EndReason) {
    this.closing = true;
    this.emit({ kind: 'closed', reason });
  }
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test` — expected PASS.

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit` — expected clean.

```bash
git add lib/multiplayer/room.ts lib/multiplayer/room.test.mts
git commit -m "Add the encrypted room connection with ordered delivery and guest reconnects"
```

---

### Task 5: What a host is willing to serve

**Files:**
- Create: `lib/multiplayer/noteAccess.ts`, `lib/multiplayer/noteAccess.test.mts`

**Interfaces:**
- Consumes: `NoteRequest`, `ShareMode` (Task 3); `VaultHandle`, `WorldModel` (`lib/types.ts`).
- Produces: `MAX_SHARED_BYTES = 4 * 1024 * 1024`; `NOT_SHARED = "The host isn't sharing notes."`; `type NoteReply = { ok: true; text: string } | { ok: true; bytes: Uint8Array; mime: string } | { ok: false; error: string }`; `noteIdsOf(world: WorldModel): Set<string>`; `resolveNoteRequest(vault: Pick<VaultHandle, 'readNote' | 'readBinary'>, share: ShareMode, noteIds: Set<string>, req: NoteRequest): Promise<NoteReply>` — never throws.

- [ ] **Step 1: Write the failing tests** — `lib/multiplayer/noteAccess.test.mts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_SHARED_BYTES, NOT_SHARED, noteIdsOf, resolveNoteRequest } from './noteAccess.ts';

const files: Record<string, Blob> = {
  'Study/Bio/cells.md': new Blob(['# Cells']),
  'Study/Bio/secret.md': new Blob(['not in the world']),
  'Study/Bio/cell.png': new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
  'Study/Bio/big.png': new Blob([new Uint8Array(MAX_SHARED_BYTES + 1)], { type: 'image/png' }),
  'Study/Bio/tax.pdf': new Blob(['%PDF']),
};
const vault = {
  readNote: async (id: string) => {
    if (!files[id]) throw new Error('missing');
    return files[id].text();
  },
  readBinary: async (path: string) => {
    if (!files[path]) throw new Error('missing');
    return files[path];
  },
};
const world = {
  name: 'V',
  regions: [{ id: 'Study', name: 'Study', biome: 'meadow' as const, houses: [{
    id: 'Study/Bio', name: 'Bio', gx: 0, gy: 0, variant: 0, material: 'wood' as const, wallColor: 'base' as const,
    roofColor: 'red' as const,
    rooms: [{ id: 'r', name: 'Main', notes: [{ id: 'Study/Bio/cells.md', title: 'cells', furniture: 'desk' as const, gx: 0, gy: 0, preview: '' }] }],
  }] }],
};
const ids = noteIdsOf(world);
const req = (path: string, kind: 'text' | 'binary') => ({ reqId: '1', path, kind });

test('nothing is served while the host shares the town only', async () => {
  assert.deepEqual(await resolveNoteRequest(vault, 'town', ids, req('Study/Bio/cells.md', 'text')), { ok: false, error: NOT_SHARED });
  assert.deepEqual(await resolveNoteRequest(vault, 'town', ids, req('Study/Bio/cell.png', 'binary')), { ok: false, error: NOT_SHARED });
});

test('notes in the town are served as text', async () => {
  assert.deepEqual(await resolveNoteRequest(vault, 'notes', ids, req('Study/Bio/cells.md', 'text')), { ok: true, text: '# Cells' });
});

test('files outside the town are refused even if they exist on disk', async () => {
  const reply = await resolveNoteRequest(vault, 'notes', ids, req('Study/Bio/secret.md', 'text'));
  assert.equal(reply.ok, false);
});

test('images are served as bytes with their type; other attachments are not', async () => {
  const img = await resolveNoteRequest(vault, 'notes', ids, req('Study/Bio/cell.png', 'binary'));
  assert.ok(img.ok && 'bytes' in img);
  assert.deepEqual([...img.bytes], [1, 2, 3]);
  assert.equal(img.mime, 'image/png');
  assert.equal((await resolveNoteRequest(vault, 'notes', ids, req('Study/Bio/tax.pdf', 'binary'))).ok, false);
});

test('missing binary returns an error reply instead of throwing', async () => {
  assert.equal((await resolveNoteRequest(vault, 'notes', ids, req('Study/Bio/nope.png', 'binary'))).ok, false);
});

test('files over the size cap are refused', async () => {
  assert.equal((await resolveNoteRequest(vault, 'notes', ids, req('Study/Bio/big.png', 'binary'))).ok, false);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test` — expected FAIL, module not found.

- [ ] **Step 3: Implement** — `lib/multiplayer/noteAccess.ts`

```ts
import type { NoteRequest, ShareMode } from './protocol.ts';
import type { VaultHandle, WorldModel } from '@/lib/types';

// The host's side of "can I read that?": only notes that are in the town, only images
// and videos as attachments, only while sharing notes. Never throws — every request
// gets a reply so a guest's reader never waits out the timeout.

export const MAX_SHARED_BYTES = 4 * 1024 * 1024;
export const NOT_SHARED = "The host isn't sharing notes.";

const MEDIA_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'mp4', 'webm', 'ogg', 'mov'];
const encoder = new TextEncoder();

export type NoteReply =
  | { ok: true; text: string }
  | { ok: true; bytes: Uint8Array; mime: string }
  | { ok: false; error: string };

export function noteIdsOf(world: WorldModel): Set<string> {
  return new Set(world.regions.flatMap((r) => r.houses.flatMap((h) => h.rooms.flatMap((room) => room.notes.map((n) => n.id)))));
}

export async function resolveNoteRequest(
  vault: Pick<VaultHandle, 'readNote' | 'readBinary'>,
  share: ShareMode,
  noteIds: Set<string>,
  req: NoteRequest,
): Promise<NoteReply> {
  if (share !== 'notes') return { ok: false, error: NOT_SHARED };
  try {
    if (req.kind === 'text') {
      if (!noteIds.has(req.path)) return { ok: false, error: 'That note is not in this town.' };
      const text = await vault.readNote(req.path);
      if (encoder.encode(text).length > MAX_SHARED_BYTES) return { ok: false, error: 'This note is too large to share.' };
      return { ok: true, text };
    }
    const ext = req.path.split(/[#?]/)[0].split('.').pop()?.toLowerCase() ?? '';
    if (!MEDIA_EXT.includes(ext)) return { ok: false, error: 'Only images and videos are shared.' };
    const blob = await vault.readBinary(req.path);
    if (blob.size > MAX_SHARED_BYTES) return { ok: false, error: 'This file is too large to share.' };
    return { ok: true, bytes: new Uint8Array(await blob.arrayBuffer()), mime: blob.type };
  } catch {
    return { ok: false, error: 'Not found.' };
  }
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test` — expected PASS.

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit` — expected clean.

```bash
git add lib/multiplayer/noteAccess.ts lib/multiplayer/noteAccess.test.mts
git commit -m "Limit what a host serves to guests: town notes and media, under 4 MiB"
```

---

### Task 6: The session store

One module both React (via `useSession`) and Phaser (via `onPresence`) read. Presence updates never go through React state (they arrive ~7×/s per walking player).

**Files:**
- Create: `lib/multiplayer/session.ts`

**Interfaces:**
- Consumes: `Room`, `RoomEvent`, `EndReason` (Task 4); `Presence`, `SceneId`, `ShareMode`, `MAX_CHAT`, `cleanName` (Task 3).
- Produces:
  - `RELAY_URL: string` (from `NEXT_PUBLIC_RELAY_URL`, `''` when unset)
  - `type SessionEnd = EndReason | 'broken-link'`; `END_MESSAGES: Record<SessionEnd, string>`
  - `type Peer = { id: string; name: string }`; `type ChatLine = { id: number; from: string; name: string; text: string; at: number }`
  - `type SessionState = { status: 'off' | 'live' | 'ended'; role: 'host' | 'guest' | null; selfId: string | null; name: string; share: ShareMode; invite: string | null; peers: Peer[]; chat: ChatLine[]; end: SessionEnd | null }`
  - `getSession()`, `subscribeSession(cb)`, `useSession(): SessionState`
  - `startSession(room: Room, role, name: string, opts: { share: ShareMode; invite: string | null }, cleanup: () => void): void`
  - `endSession(reason: SessionEnd | null): void` (null = ended on purpose → `off`), `dismissEnd(): void`
  - `setSessionShare(share: ShareMode): void`
  - `sendChat(text: string): void`
  - `setSelfPresence(p: { scene: SceneId; gx: number; gy: number; facing: Direction }): void`
  - `onPresence(cb: (peerId: string, p: Presence | null) => void): () => void`; `currentPresences(): Array<[string, Presence]>`
  - `loadName(): string`, `saveName(name: string): void`

- [ ] **Step 1: Implement** — `lib/multiplayer/session.ts`

```ts
'use client';

import { useSyncExternalStore } from 'react';
import type { Direction } from '@/game/gridMovement';
import { MAX_CHAT, cleanName, type Presence, type SceneId, type ShareMode } from './protocol.ts';
import type { EndReason, Room, RoomEvent } from './room.ts';

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
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit` — expected clean. (Behavior is exercised end-to-end in Task 10; the pieces it composes are unit-tested in Tasks 3–4.)

- [ ] **Step 3: Commit**

```bash
git add lib/multiplayer/session.ts
git commit -m "Add the study-session store shared by the React UI and Phaser scenes"
```

---

### Task 7: Hosting and joining

**Files:**
- Modify: `lib/exteriorStore.ts` (add `applyExteriorOverride`)
- Modify: `game/scenes/OverworldScene.ts:59-78` (use it; drop now-unused imports)
- Modify: `lib/vault/open.ts` (export `walk`; `publishWorld` exported with guest mode)
- Create: `lib/multiplayer/host.ts`
- Create: `lib/multiplayer/guest.ts`
- Modify: `game/bus.ts` (add `'world-updated': { exteriorChanged: boolean }`)

**Interfaces:**
- Consumes: Tasks 3–6.
- Produces:
  - `applyExteriorOverride(house: House, saved: ExteriorOverride): void`
  - `walk(dir, prefix, out)` exported; `publishWorld(world: WorldModel, fingerprint: string | null, guest?: { layouts: Record<string, InteriorLayout> }): void` — guest mode sets registry `role = 'guest'` and `sessionLayouts`, removes `vaultFingerprint`.
  - `buildWorldPayload(world, fingerprint: string | undefined, share): WorldPayload`; `startHosting(vault: VaultHandle, name: string, share: ShareMode): Promise<void>` (throws `RoomError`); `setHostShare(share: ShareMode): void`
  - `type Invite = { roomId: string; key: string }`; `readInvite(): Invite | null`; `class JoinError extends Error { reason: SessionEnd }`; `joinRoom(invite, name, localDir: FileSystemDirectoryHandle | null, onVault: (v: VaultHandle) => void): Promise<void>` (throws `JoinError`)
  - Guest `VaultHandle` errors for host refusals/timeouts are `new Error(message, { cause: 'host' })`.

- [ ] **Step 1: Extract `applyExteriorOverride`** — append to `lib/exteriorStore.ts`, and change its imports

```ts
import type { House, MaterialId, RoofColor, WallColor } from './types';
import {
  HOUSE_VARIANTS, MATERIALS, WALL_COLORS, ROOF_COLORS,
  DEFAULT_MATERIAL, DEFAULT_WALL_COLOR, DEFAULT_ROOF_COLOR, availableWallColors,
} from './houseCatalog';
```

```ts
export function applyExteriorOverride(house: House, saved: ExteriorOverride): void {
  house.variant = saved.variant;
  house.material = saved.material ?? DEFAULT_MATERIAL[saved.variant];
  // A saved wallColor is only structurally valid (one of the 3 known colors), not
  // necessarily available for this material+shape combo — Limestone and Stone's
  // shape 3 only ship a subset. Fall back to 'base', always available everywhere.
  const wallColor = saved.wallColor ?? DEFAULT_WALL_COLOR[saved.variant];
  house.wallColor = availableWallColors(house.material, house.variant).includes(wallColor) ? wallColor : 'base';
  house.roofColor = saved.roofColor ?? DEFAULT_ROOF_COLOR[saved.variant];
}
```

In `OverworldScene.create()` replace the body of `if (saved !== null) { … }` with `applyExteriorOverride(house, saved);`, change the store import to `import { applyExteriorOverride, getExteriorOverride, saveExteriorOverride } from '@/lib/exteriorStore';`, and delete the `@/lib/houseCatalog` import (no longer used there).

- [ ] **Step 2: Export `walk` and give `publishWorld` a guest mode** — `lib/vault/open.ts`

Change `async function walk(` to `export async function walk(`, add `InteriorLayout` to the `@/lib/types` import, and replace `publishWorld` with:

```ts
export function publishWorld(
  world: WorldModel,
  fingerprint: string | null,
  guest?: { layouts: Record<string, InteriorLayout> },
) {
  const attempt = () => {
    const game = (window as any).__game;
    if (!game?.registry) return false;
    if (guest) {
      // No fingerprint: a guest's own saved customizations must never repaint the host's town.
      game.registry.set('role', 'guest');
      game.registry.set('sessionLayouts', guest.layouts);
      game.registry.remove('vaultFingerprint');
    } else {
      game.registry.remove('role');
      game.registry.remove('sessionLayouts');
      game.registry.set('vaultFingerprint', fingerprint);
    }
    // Last: TitleScene starts the overworld the moment this lands.
    game.registry.set('world', world);
    return true;
  };
  if (attempt()) return;
  const timer = setInterval(() => { if (attempt()) clearInterval(timer); }, 100);
}
```

- [ ] **Step 3: Add the bus event** — `game/bus.ts`, inside `BusEvents`:

```ts
  'world-updated': { exteriorChanged: boolean };
```

- [ ] **Step 4: Implement hosting** — `lib/multiplayer/host.ts`

```ts
'use client';

import { bus } from '@/game/bus';
import { applyExteriorOverride, getExteriorOverride } from '@/lib/exteriorStore';
import { getLayout } from '@/lib/interiorStore';
import type { InteriorLayout, VaultHandle, WorldModel } from '@/lib/types';
import { bytesToBase64, exportRoomKey, generateRoomKey } from './crypto.ts';
import { noteIdsOf, resolveNoteRequest } from './noteAccess.ts';
import type { NoteResponse, ShareMode, WorldPayload } from './protocol.ts';
import { Room } from './room.ts';
import { RELAY_URL, setSessionShare, startSession } from './session.ts';

let changeShare: ((share: ShareMode) => void) | null = null;

function hostFingerprint(): string | undefined {
  return (window as any).__game?.registry?.get('vaultFingerprint');
}

// The town exactly as the host sees it: saved exteriors baked into each house, every
// saved interior alongside, previews blanked unless notes are shared.
export function buildWorldPayload(world: WorldModel, fingerprint: string | undefined, share: ShareMode): WorldPayload {
  const copy: WorldModel = structuredClone(world);
  const layouts: Record<string, InteriorLayout> = {};
  for (const region of copy.regions) {
    for (const house of region.houses) {
      if (fingerprint) {
        const exterior = getExteriorOverride(fingerprint, house.id);
        if (exterior) applyExteriorOverride(house, exterior);
        const layout = getLayout(fingerprint, house.id);
        if (layout) layouts[house.id] = layout;
      }
      if (share === 'town') {
        for (const room of house.rooms) for (const note of room.notes) note.preview = '';
      }
    }
  }
  return { world: copy, layouts, share };
}

export async function startHosting(vault: VaultHandle, name: string, share: ShareMode): Promise<void> {
  const key = await generateRoomKey();
  const room = await Room.create(RELAY_URL, key);
  const invite = `${location.origin}${location.pathname}?room=${room.roomId}#key=${await exportRoomKey(key)}`;
  const noteIds = noteIdsOf(vault.world);
  let current = share;

  const sendWorld = (to: string) => {
    room.send(to, { t: 'world', ...buildWorldPayload(vault.world, hostFingerprint(), current) }).catch(() => {});
  };

  const offRoom = room.on(async (e) => {
    if (e.kind !== 'message') return;
    if (e.msg.t === 'hello') sendWorld(e.from);
    if (e.msg.t !== 'note-req') return;
    const { reqId } = e.msg;
    const reply = await resolveNoteRequest(vault, current, noteIds, e.msg);
    const res: NoteResponse = !reply.ok
      ? { t: 'note-res', reqId, ok: false, error: reply.error }
      : 'text' in reply
        ? { t: 'note-res', reqId, ok: true, text: reply.text }
        : { t: 'note-res', reqId, ok: true, b64: bytesToBase64(reply.bytes), mime: reply.mime };
    room.send(e.from, res).catch(() =>
      room.send(e.from, { t: 'note-res', reqId, ok: false, error: 'This file is too large to share.' }).catch(() => {}),
    );
  });

  // The scene saves the edit in its own handler; broadcast on the next tick so the save is in.
  const onCommit = () => setTimeout(() => sendWorld('all'), 0);
  bus.on('commit-exterior-variant', onCommit);
  bus.on('commit-interior-layout', onCommit);

  changeShare = (next) => {
    current = next;
    setSessionShare(next);
    sendWorld('all');
  };

  startSession(room, 'host', name, { share, invite }, () => {
    offRoom();
    bus.off('commit-exterior-variant', onCommit);
    bus.off('commit-interior-layout', onCommit);
    changeShare = null;
  });
}

export function setHostShare(share: ShareMode) {
  changeShare?.(share);
}
```

- [ ] **Step 5: Implement joining** — `lib/multiplayer/guest.ts`

```ts
'use client';

import { bus } from '@/game/bus';
import { publishWorld, walk } from '@/lib/vault/open';
import { makeLinkResolver } from '@/lib/vault/parse';
import type { VaultHandle } from '@/lib/types';
import { base64ToBytes, importRoomKey } from './crypto.ts';
import type { NoteResponse, WorldPayload } from './protocol.ts';
import { Room, RoomError } from './room.ts';
import { RELAY_URL, endSession, setSessionShare, startSession, type SessionEnd } from './session.ts';

export type Invite = { roomId: string; key: string };

export class JoinError extends Error {
  reason: SessionEnd;
  constructor(reason: SessionEnd) {
    super(reason);
    this.reason = reason;
  }
}

const REQUEST_TIMEOUT_MS = 15_000;
const WORLD_TIMEOUT_MS = 15_000;

export function readInvite(): Invite | null {
  const roomId = new URLSearchParams(location.search).get('room');
  if (!roomId) return null;
  return { roomId, key: new URLSearchParams(location.hash.slice(1)).get('key') ?? '' };
}

function exteriorKey(p: WorldPayload): string {
  return JSON.stringify(p.world.regions.map((r) => r.houses.map((h) => [h.id, h.variant, h.material, h.wallColor, h.roofColor])));
}

export async function joinRoom(
  invite: Invite,
  name: string,
  localDir: FileSystemDirectoryHandle | null,
  onVault: (v: VaultHandle) => void,
): Promise<void> {
  let key: CryptoKey;
  try {
    key = await importRoomKey(invite.key);
  } catch {
    throw new JoinError('broken-link');
  }

  let room: Room;
  try {
    room = await Room.join(RELAY_URL, invite.roomId, key);
  } catch (err) {
    throw new JoinError(err instanceof RoomError ? err.reason : 'relay-unreachable');
  }

  const local = new Map<string, FileSystemFileHandle>();
  if (localDir) await walk(localDir, '', local);
  const resolveLocal = makeLinkResolver([...local.keys()]);
  const readLocal = async (link: string): Promise<File | null> => {
    const path = resolveLocal(link);
    const handle = path ? local.get(path) : undefined;
    return handle ? handle.getFile() : null;
  };

  const pending = new Map<string, { resolve: (r: NoteResponse) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  let reqCounter = 0;
  const ask = (path: string, kind: 'text' | 'binary') =>
    new Promise<NoteResponse>((resolve, reject) => {
      const reqId = String(++reqCounter);
      const timer = setTimeout(() => {
        pending.delete(reqId);
        reject(new Error("Couldn't reach the host.", { cause: 'host' }));
      }, REQUEST_TIMEOUT_MS);
      pending.set(reqId, { resolve, reject, timer });
      room.send('host', { t: 'note-req', reqId, path, kind }).catch(() => {});
    });

  const makeHandle = (p: WorldPayload): VaultHandle => ({
    world: p.world,
    readNote: async (id) => {
      const file = await readLocal(id);
      if (file) return file.text();
      const res = await ask(id, 'text');
      if (!res.ok) throw new Error(res.error, { cause: 'host' });
      return res.text ?? '';
    },
    readBinary: async (path) => {
      const file = await readLocal(path);
      if (file) return file;
      const res = await ask(path, 'binary');
      if (!res.ok) throw new Error(res.error, { cause: 'host' });
      return new Blob([base64ToBytes(res.b64 ?? '')], { type: res.mime ?? '' });
    },
  });

  let lastExterior = '';
  let lastLayouts = '';
  const apply = (p: WorldPayload, initial: boolean) => {
    const exterior = exteriorKey(p);
    const layouts = JSON.stringify(p.layouts);
    const exteriorChanged = exterior !== lastExterior;
    const layoutsChanged = layouts !== lastLayouts;
    lastExterior = exterior;
    lastLayouts = layouts;
    publishWorld(p.world, null, { layouts: p.layouts });
    onVault(makeHandle(p));
    setSessionShare(p.share);
    if (!initial && (exteriorChanged || layoutsChanged)) bus.emit('world-updated', { exteriorChanged });
  };

  let first: (p: WorldPayload) => void = () => {};
  let failed: (reason: SessionEnd) => void = () => {};
  const firstWorld = new Promise<WorldPayload>((resolve, reject) => {
    first = resolve;
    failed = (reason) => reject(new JoinError(reason));
  });
  const worldTimer = setTimeout(() => failed('broken-link'), WORLD_TIMEOUT_MS);
  let joined = false;

  // Listen before anything is sent: the host's presence arrives right after we join.
  const offRoom = room.on((e) => {
    if (e.kind === 'reconnected') room.send('host', { t: 'hello' }).catch(() => {});
    if (e.kind === 'closed' && !joined) failed(e.reason);
    if (e.kind === 'undecryptable' && e.from === room.hostId && !joined) failed('broken-link');
    if (e.kind !== 'message' || e.from !== room.hostId) return;
    if (e.msg.t === 'world') {
      if (joined) apply(e.msg, false);
      else first(e.msg);
    } else if (e.msg.t === 'note-res') {
      const waiting = pending.get(e.msg.reqId);
      if (!waiting) return;
      clearTimeout(waiting.timer);
      pending.delete(e.msg.reqId);
      waiting.resolve(e.msg);
    }
  });

  startSession(room, 'guest', name, { share: 'notes', invite: null }, () => {
    offRoom();
    clearTimeout(worldTimer);
    for (const waiting of pending.values()) {
      clearTimeout(waiting.timer);
      waiting.reject(new Error("Couldn't reach the host.", { cause: 'host' }));
    }
    pending.clear();
  });
  room.send('host', { t: 'hello' }).catch(() => {});

  let payload: WorldPayload;
  try {
    payload = await firstWorld;
  } catch (err) {
    endSession(null);
    throw err;
  }
  clearTimeout(worldTimer);
  joined = true;
  apply(payload, true);
}
```

- [ ] **Step 6: Type-check and run the suite**

Run: `npx tsc --noEmit && npm test`
Expected: clean, all tests pass. Then `npm run dev`, open the demo town solo and confirm a house you customized earlier still shows its saved exterior (the extracted helper is behavior-preserving).

- [ ] **Step 7: Commit**

```bash
git add lib/exteriorStore.ts game/scenes/OverworldScene.ts lib/vault/open.ts game/bus.ts lib/multiplayer/host.ts lib/multiplayer/guest.ts
git commit -m "Let a host serve their town to guests and guests join it as a read-only vault"
```

---

### Task 8: Other players in the game world

**Files:**
- Modify: `game/gridMovement.ts` (add `onStep`)
- Modify: `game/playerSprite.ts` (return an undress function)
- Create: `game/remotePlayers.ts`
- Modify: `game/scenes/OverworldScene.ts` (presence, remote players, guest restrictions, `world-updated`)
- Modify: `game/scenes/InteriorScene.ts` (same, plus `sessionLayouts`)

**Interfaces:**
- Consumes: `setSelfPresence`, `onPresence`, `currentPresences`, `getSession` (Task 6); `Presence`, `SceneId` (Task 3); bus `world-updated` (Task 7).
- Produces: `GridMovement.onStep: ((gx, gy, facing) => void) | null`; `dressPlayer(...)` returns `() => void`; `attachRemotePlayers(scene, sceneId, local: Phaser.GameObjects.Sprite): void`; `type AvatarAnchor = { id: string; x: number; y: number }`; `avatarAnchors(): AvatarAnchor[]` (viewport CSS px, just above each head, including your own under your `selfId`).

- [ ] **Step 1: `onStep` in GridMovement** — `game/gridMovement.ts`

Add the field after `enabled = true;`:

```ts
  onStep: ((gx: number, gy: number, facing: Direction) => void) | null = null;
```

In `update()`, replace from `this.facing = dir;` through `this.sprite.play(\`walk-${animDir}\`, true);` with:

```ts
    const turned = dir !== this.facing;
    this.facing = dir;
    const [dx, dy] = DELTA[dir];
    const { gx, gy } = this.getTile();
    const targetGx = gx + dx;
    const targetGy = gy + dy;

    const animDir = dir === 'left' ? 'right' : dir;
    this.sprite.setFlipX(dir === 'left');

    if (!this.isWalkable(targetGx, targetGy)) {
      this.sprite.play(`idle-${animDir}`, true);
      if (turned) this.onStep?.(gx, gy, dir);
      return;
    }

    this.moving = true;
    this.onStep?.(targetGx, targetGy, dir);
    this.sprite.play(`walk-${animDir}`, true);
```

- [ ] **Step 2: Let a dressed sprite be undressed** — `game/playerSprite.ts`

Change the signature to `export function dressPlayer(scene: Phaser.Scene, sprite: Phaser.GameObjects.Sprite): () => void {` and replace the final `scene.events.on(...POST_UPDATE...)` / `once(SHUTDOWN...)` block with:

```ts
  scene.events.on(Phaser.Scenes.Events.POST_UPDATE, tick);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off(Phaser.Scenes.Events.POST_UPDATE, tick);
  });

  // For avatars that leave mid-scene; everything else is torn down with the scene.
  return () => {
    scene.events.off(Phaser.Scenes.Events.POST_UPDATE, tick);
    layers.forEach((layer) => layer.destroy());
  };
```

- [ ] **Step 3: Remote players** — `game/remotePlayers.ts`

```ts
import Phaser from 'phaser';
import { tileToWorld, type Direction } from '@/game/gridMovement';
import { dressPlayer } from '@/game/playerSprite';
import type { Presence, SceneId } from '@/lib/multiplayer/protocol';
import { currentPresences, getSession, onPresence } from '@/lib/multiplayer/session';

const STEP_MS = 150; // matches GridMovement's own tween
const HEAD = 32; // world px from a sprite's feet to just above its head

type Avatar = { sprite: Phaser.GameObjects.Sprite; undress: () => void; gx: number; gy: number; facing: Direction };
export type AvatarAnchor = { id: string; x: number; y: number };

let anchors: (() => AvatarAnchor[]) | null = null;

// Viewport points just above every avatar's head in the running scene, for the
// React name-tag overlay (text stays crisp there instead of being pixel-scaled).
export function avatarAnchors(): AvatarAnchor[] {
  return anchors ? anchors() : [];
}

function animate(sprite: Phaser.GameObjects.Sprite, kind: 'idle' | 'walk', facing: Direction) {
  sprite.setFlipX(facing === 'left');
  sprite.play(`${kind}-${facing === 'left' ? 'right' : facing}`, true);
}

export function attachRemotePlayers(scene: Phaser.Scene, sceneId: SceneId, local: Phaser.GameObjects.Sprite) {
  const avatars = new Map<string, Avatar>();
  const depthByY = sceneId === 'overworld';

  const place = (peerId: string, p: Presence | null) => {
    const avatar = avatars.get(peerId);
    if (!p || p.scene !== sceneId) {
      if (!avatar) return;
      scene.tweens.killTweensOf(avatar.sprite);
      avatar.undress();
      avatar.sprite.destroy();
      avatars.delete(peerId);
      return;
    }

    const target = tileToWorld(p.gx, p.gy);
    if (!avatar) {
      const sprite = scene.add.sprite(target.x, target.y, 'player').setOrigin(0.5, 0.64);
      sprite.setDepth(depthByY ? sprite.y : 10);
      avatars.set(peerId, { sprite, undress: dressPlayer(scene, sprite), gx: p.gx, gy: p.gy, facing: p.facing });
      animate(sprite, 'idle', p.facing);
      return;
    }

    const steps = Math.abs(p.gx - avatar.gx) + Math.abs(p.gy - avatar.gy);
    avatar.facing = p.facing;
    if (steps === 0) {
      animate(avatar.sprite, 'idle', p.facing);
      return;
    }
    const from = tileToWorld(avatar.gx, avatar.gy);
    avatar.gx = p.gx;
    avatar.gy = p.gy;
    scene.tweens.killTweensOf(avatar.sprite);
    if (steps > 1) {
      avatar.sprite.setPosition(target.x, target.y);
      animate(avatar.sprite, 'idle', p.facing);
      return;
    }
    avatar.sprite.setPosition(from.x, from.y);
    animate(avatar.sprite, 'walk', p.facing);
    scene.tweens.add({
      targets: avatar.sprite,
      x: target.x,
      y: target.y,
      duration: STEP_MS,
      onComplete: () => animate(avatar.sprite, 'idle', avatar.facing),
    });
  };

  for (const [peerId, p] of currentPresences()) place(peerId, p);
  const off = onPresence(place);

  const sortDepth = () => {
    for (const a of avatars.values()) a.sprite.setDepth(depthByY ? a.sprite.y : 10);
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE, sortDepth);

  const mine = () => {
    const cam = scene.cameras.main;
    const rect = scene.game.canvas.getBoundingClientRect();
    const scale = rect.width / scene.scale.width;
    const at = (id: string, s: Phaser.GameObjects.Sprite): AvatarAnchor => ({
      id,
      x: rect.left + (s.x - cam.worldView.x) * scale,
      y: rect.top + (s.y - HEAD - cam.worldView.y) * scale,
    });
    const out: AvatarAnchor[] = [];
    const selfId = getSession().selfId;
    if (selfId) out.push(at(selfId, local));
    for (const [peerId, a] of avatars) out.push(at(peerId, a.sprite));
    return out;
  };
  anchors = mine;

  // The scene destroys the sprites and their clothes itself on shutdown.
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    off();
    scene.events.off(Phaser.Scenes.Events.UPDATE, sortDepth);
    avatars.clear();
    if (anchors === mine) anchors = null;
  });
}
```

- [ ] **Step 4: Wire the overworld** — `game/scenes/OverworldScene.ts`

Imports: add `import { attachRemotePlayers } from '@/game/remotePlayers';` and `import { setSelfPresence } from '@/lib/multiplayer/session';`.

Add a handler next to `onCloseExteriorEditor`:

```ts
  private onWorldUpdated = ({ exteriorChanged }: { exteriorChanged: boolean }) => {
    if (!exteriorChanged || !this.player) return;
    const { gx, gy } = worldToTile(this.player.x, this.player.y);
    this.game.registry.set('returnTile', { gx, gy });
    this.scene.restart();
  };
```

In `create()`, right after `this.fingerprint = …`, add `const isGuest = this.game.registry.get('role') === 'guest';`, and wrap the house-click wiring loop (`for (const house of region.houses) { const img = … .on('pointerdown', …) }`) in `if (!isGuest) { … }` — guests can't open the exterior editor.

After `this.movement = new GridMovement(this, player, isWalkable);` add:

```ts
    this.movement.onStep = (gx, gy, facing) => setSelfPresence({ scene: 'overworld', gx, gy, facing });
    setSelfPresence({ scene: 'overworld', gx: spawnGx, gy: spawnGy, facing: 'down' });
    attachRemotePlayers(this, 'overworld', player);
```

Register/unregister with the other bus handlers at the end of `create()`:

```ts
    bus.on('world-updated', this.onWorldUpdated);
```

and inside the existing `this.events.once('shutdown', …)`:

```ts
      bus.off('world-updated', this.onWorldUpdated);
```

- [ ] **Step 5: Wire the interior** — `game/scenes/InteriorScene.ts`

Imports: add `import { attachRemotePlayers } from '@/game/remotePlayers';` and `import { setSelfPresence } from '@/lib/multiplayer/session';`.

Add a handler next to `onCommitLayout`:

```ts
  private onWorldUpdated = () => {
    if (this.fingerprint) return;
    const layouts = this.game.registry.get('sessionLayouts') as Record<string, InteriorLayout> | undefined;
    const next = layouts?.[this.houseId];
    if (next && JSON.stringify(next) !== JSON.stringify(this.layout)) this.scene.restart({ houseId: this.houseId });
  };
```

In `create()` replace the `const saved = …` line with:

```ts
    const sessionLayouts = this.game.registry.get('sessionLayouts') as Record<string, InteriorLayout> | undefined;
    const saved = this.fingerprint
      ? getLayout(this.fingerprint, this.houseId)
      : (sessionLayouts?.[this.houseId] ?? null);
```

Wrap the `CUSTOMIZE` label (`this.add.text(labelCenterX, 13, 'CUSTOMIZE', …).on('pointerdown', () => this.openEditor());`) in `if (this.game.registry.get('role') !== 'guest') { … }`.

After `this.movement = new GridMovement(this, this.player, isWalkable);` add:

```ts
    const sceneId = `house:${this.houseId}` as const;
    this.movement.onStep = (gx, gy, facing) => setSelfPresence({ scene: sceneId, gx, gy, facing });
    setSelfPresence({ scene: sceneId, gx: this.doorGx, gy: this.doorGy, facing: 'down' });
    attachRemotePlayers(this, sceneId, this.player);
```

Add `bus.on('world-updated', this.onWorldUpdated);` with the other `bus.on` calls and `bus.off('world-updated', this.onWorldUpdated);` in the shutdown handler.

- [ ] **Step 6: Type-check, suite, solo regression**

Run: `npx tsc --noEmit && npm test` — expected clean/pass.
Run `npm run dev` with `NEXT_PUBLIC_RELAY_URL` unset; open the demo town: walk, enter a house, open a note, customize an exterior and an interior, exit. Everything must behave exactly as before.

- [ ] **Step 7: Commit**

```bash
git add game/gridMovement.ts game/playerSprite.ts game/remotePlayers.ts game/scenes/OverworldScene.ts game/scenes/InteriorScene.ts
git commit -m "Show other players walking in the overworld and inside houses"
```

---

### Task 9: Session UI

**Files:**
- Create: `components/RoomPanel.tsx`, `components/JoinScreen.tsx`, `components/ChatPanel.tsx`, `components/PlayerTags.tsx`
- Modify: `app/page.tsx`
- Modify: `components/NoteReader.tsx` (show host refusal text)

**Interfaces:**
- Consumes: everything in `lib/multiplayer/`; `avatarAnchors` (Task 8).
- Produces: the user-visible feature.

- [ ] **Step 1: PlayerTags** — `components/PlayerTags.tsx`

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { avatarAnchors } from '@/game/remotePlayers';
import { useSession } from '@/lib/multiplayer/session';

const BUBBLE_MS = 5000;

export default function PlayerTags() {
  const session = useSession();
  const tags = useRef(new Map<string, HTMLDivElement>());
  const [, rerender] = useState(0);
  const live = session.status === 'live';

  useEffect(() => {
    if (!live) return;
    let raf = 0;
    const place = () => {
      const seen = new Set<string>();
      for (const a of avatarAnchors()) {
        const el = tags.current.get(a.id);
        if (!el) continue;
        seen.add(a.id);
        el.style.transform = `translate(${Math.round(a.x)}px, ${Math.round(a.y)}px) translate(-50%, -100%)`;
        el.style.visibility = 'visible';
      }
      for (const [id, el] of tags.current) if (!seen.has(id)) el.style.visibility = 'hidden';
      raf = requestAnimationFrame(place);
    };
    raf = requestAnimationFrame(place);
    return () => cancelAnimationFrame(raf);
  }, [live]);

  // Re-render when the next speech bubble should disappear.
  useEffect(() => {
    const now = Date.now();
    const expiries = session.chat.map((l) => l.at + BUBBLE_MS).filter((t) => t > now);
    if (expiries.length === 0) return;
    const timer = setTimeout(() => rerender((n) => n + 1), Math.min(...expiries) - now + 20);
    return () => clearTimeout(timer);
  });

  if (!live || !session.selfId) return null;

  const now = Date.now();
  const bubbles = new Map<string, string>();
  for (const line of session.chat) if (now - line.at < BUBBLE_MS) bubbles.set(line.from, line.text);
  const people = [{ id: session.selfId, name: session.name }, ...session.peers];

  return (
    <div className="pointer-events-none fixed inset-0 z-30 overflow-hidden">
      {people.map((p) => (
        <div
          key={p.id}
          ref={(el) => {
            if (el) tags.current.set(p.id, el);
            else tags.current.delete(p.id);
          }}
          className="absolute left-0 top-0 flex flex-col items-center"
          style={{ visibility: 'hidden' }}
        >
          {bubbles.has(p.id) && (
            <div className="mb-1 max-w-56 break-words rounded bg-white px-2 py-1 text-xs text-black shadow">
              {bubbles.get(p.id)}
            </div>
          )}
          <div className="whitespace-nowrap rounded bg-black/70 px-1.5 text-[11px] leading-4 text-white">{p.name}</div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: ChatPanel** — `components/ChatPanel.tsx`

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { MAX_CHAT } from '@/lib/multiplayer/protocol';
import { sendChat, useSession } from '@/lib/multiplayer/session';

// A key held down while the input takes focus never gets its keyup through to Phaser,
// so the player would keep walking. Drop every key's held state on focus.
function releaseGameKeys() {
  const game = (window as any).__game;
  game?.scene?.getScenes(true).forEach((s: any) => s.input?.keyboard?.resetKeys());
}

export default function ChatPanel() {
  const session = useSession();
  const [draft, setDraft] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const live = session.status === 'live';

  useEffect(() => {
    if (!live) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 't' && e.key !== 'T') return;
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      input.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [live]);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [session.chat]);

  if (!live) return null;

  return (
    <div className="absolute bottom-4 left-4 z-40 flex w-80 flex-col gap-2 rounded bg-black/70 p-2 text-sm text-white">
      <div ref={log} className="max-h-40 overflow-y-auto">
        {session.chat.length === 0 && <p className="text-white/50">Press T to chat.</p>}
        {session.chat.map((line) => (
          <p key={line.id} className="break-words">
            <span className="font-semibold">{line.name}:</span> {line.text}
          </p>
        ))}
      </div>
      <input
        ref={input}
        value={draft}
        maxLength={MAX_CHAT}
        placeholder="Say something… (T)"
        className="rounded bg-white/10 px-2 py-1 outline-none placeholder:text-white/40 focus:bg-white/20"
        onFocus={releaseGameKeys}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          // Keep Phaser's window-level key handlers (WASD, Space, Enter) from eating keystrokes.
          e.stopPropagation();
          if (e.key === 'Enter') {
            sendChat(draft);
            setDraft('');
          }
          if (e.key === 'Escape') e.currentTarget.blur();
        }}
      />
    </div>
  );
}
```

- [ ] **Step 3: JoinScreen** — `components/JoinScreen.tsx`

```tsx
'use client';

import { useState } from 'react';
import { JoinError, joinRoom, type Invite } from '@/lib/multiplayer/guest';
import { MAX_NAME } from '@/lib/multiplayer/protocol';
import { END_MESSAGES, loadName, saveName } from '@/lib/multiplayer/session';
import type { VaultHandle } from '@/lib/types';

export default function JoinScreen({ invite, onVault }: { invite: Invite; onVault: (v: VaultHandle) => void }) {
  const [name, setName] = useState(loadName);
  const [dir, setDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canPick = 'showDirectoryPicker' in window;

  const pick = async () => {
    try {
      setDir(await (window as any).showDirectoryPicker({ mode: 'read' }));
    } catch {
      // Picker cancelled.
    }
  };

  const join = async () => {
    setBusy(true);
    setError(null);
    saveName(name);
    try {
      await joinRoom(invite, name, dir, onVault);
    } catch (err) {
      setError(END_MESSAGES[err instanceof JoinError ? err.reason : 'connection-lost']);
      setBusy(false);
    }
  };

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40">
      <form
        className="flex w-80 flex-col gap-3 rounded bg-black/85 p-6 text-white"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy && name.trim()) join();
        }}
      >
        <h2 className="text-lg font-semibold">Join a study session</h2>
        <label className="flex flex-col gap-1 text-sm">
          Your name
          <input
            autoFocus
            value={name}
            maxLength={MAX_NAME}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            className="rounded bg-white px-2 py-1 text-black"
          />
        </label>
        {canPick && (
          <button type="button" onClick={pick} className="rounded border border-white/60 px-3 py-2 text-left text-sm">
            {dir ? `Reading notes from your copy: ${dir.name}` : 'I have this vault too (optional)'}
          </button>
        )}
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="rounded bg-white px-6 py-3 font-medium text-black disabled:opacity-50"
        >
          {busy ? 'Joining…' : 'Join'}
        </button>
        {error && <p className="text-sm text-red-300">{error}</p>}
      </form>
    </div>
  );
}
```

- [ ] **Step 4: RoomPanel** — `components/RoomPanel.tsx`

```tsx
'use client';

import { useState } from 'react';
import { setHostShare, startHosting } from '@/lib/multiplayer/host';
import { MAX_NAME, type ShareMode } from '@/lib/multiplayer/protocol';
import { RoomError } from '@/lib/multiplayer/room';
import {
  END_MESSAGES, RELAY_URL, dismissEnd, endSession, loadName, saveName, useSession,
} from '@/lib/multiplayer/session';
import { useVault } from '@/lib/vault/open';

const backToTitle = () => window.location.assign(window.location.pathname);

const SHARE_LABELS: Record<ShareMode, string> = {
  notes: 'Town + notes: guests can open any note and its images',
  town: 'Town only: guests see houses and note titles, not what notes say',
};

function ShareChoice({ value, onChange }: { value: ShareMode; onChange: (s: ShareMode) => void }) {
  return (
    <fieldset className="flex flex-col gap-1 text-sm">
      {(Object.keys(SHARE_LABELS) as ShareMode[]).map((mode) => (
        <label key={mode} className="flex items-start gap-2">
          <input type="radio" name="share" checked={value === mode} onChange={() => onChange(mode)} className="mt-1" />
          {SHARE_LABELS[mode]}
        </label>
      ))}
    </fieldset>
  );
}

export default function RoomPanel() {
  const { vault } = useVault();
  const session = useSession();
  const [setupOpen, setSetupOpen] = useState(false);
  const [name, setName] = useState(loadName);
  const [share, setShare] = useState<ShareMode>('notes');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!RELAY_URL) return null;

  if (session.status === 'ended' && session.end) {
    return (
      <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/60">
        <div className="flex w-80 flex-col gap-4 rounded bg-black/90 p-6 text-white">
          <p>{END_MESSAGES[session.end]}</p>
          {session.role === 'guest' ? (
            <button className="rounded bg-white px-4 py-2 font-medium text-black" onClick={backToTitle}>
              Back to title
            </button>
          ) : (
            <button className="rounded bg-white px-4 py-2 font-medium text-black" onClick={dismissEnd}>
              Keep studying alone
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!vault) return null;

  if (session.status === 'live' && session.role === 'guest') {
    return (
      <div className="absolute right-4 top-4 z-40 flex items-center gap-3 rounded bg-black/70 px-3 py-2 text-sm text-white">
        <span>Study session · {session.peers.length + 1} here</span>
        <button
          className="rounded border border-white/60 px-2 py-0.5"
          onClick={() => {
            endSession(null);
            backToTitle();
          }}
        >
          Leave
        </button>
      </div>
    );
  }

  if (session.status === 'live') {
    return (
      <div className="absolute right-4 top-4 z-40 flex w-80 flex-col gap-3 rounded bg-black/80 p-4 text-sm text-white">
        <div className="flex gap-2">
          <input readOnly value={session.invite ?? ''} className="min-w-0 flex-1 rounded bg-white/10 px-2 py-1" onFocus={(e) => e.target.select()} />
          <button
            className="rounded bg-white px-3 py-1 font-medium text-black"
            onClick={async () => {
              await navigator.clipboard.writeText(session.invite ?? '');
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <ShareChoice value={session.share} onChange={setHostShare} />
        <div>
          <p className="font-semibold">Here now</p>
          <p>{session.name} (you)</p>
          {session.peers.map((p) => <p key={p.id}>{p.name}</p>)}
        </div>
        <button className="rounded border border-white/60 px-3 py-1" onClick={() => endSession(null)}>
          End session
        </button>
      </div>
    );
  }

  if (!setupOpen) {
    return (
      <button
        className="absolute right-4 top-4 z-40 rounded bg-white px-4 py-2 font-medium text-black"
        onClick={() => setSetupOpen(true)}
      >
        Invite friends
      </button>
    );
  }

  const start = async () => {
    setBusy(true);
    setError(null);
    saveName(name);
    try {
      await startHosting(vault, name, share);
      setSetupOpen(false);
    } catch (err) {
      setError(END_MESSAGES[err instanceof RoomError ? err.reason : 'relay-unreachable']);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={() => setSetupOpen(false)}>
      <form
        className="flex w-96 flex-col gap-3 rounded bg-black/90 p-6 text-sm text-white"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy && name.trim()) start();
        }}
      >
        <h2 className="text-lg font-semibold">Invite friends to study</h2>
        <label className="flex flex-col gap-1">
          Your name
          <input
            autoFocus
            value={name}
            maxLength={MAX_NAME}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            className="rounded bg-white px-2 py-1 text-black"
          />
        </label>
        <ShareChoice value={share} onChange={setShare} />
        <p className="text-white/70">
          Guests always see your folder names and note titles. Everything is end-to-end encrypted; the relay can&apos;t read it.
        </p>
        <div className="flex gap-2">
          <button type="submit" disabled={busy || !name.trim()} className="flex-1 rounded bg-white px-4 py-2 font-medium text-black disabled:opacity-50">
            {busy ? 'Starting…' : 'Start session'}
          </button>
          <button type="button" className="rounded border border-white/60 px-4 py-2" onClick={() => setSetupOpen(false)}>
            Cancel
          </button>
        </div>
        {error && <p className="text-red-300">{error}</p>}
      </form>
    </div>
  );
}
```

- [ ] **Step 5: Mount it all** — `app/page.tsx`

Add imports:

```tsx
import RoomPanel from '@/components/RoomPanel';
import JoinScreen from '@/components/JoinScreen';
import ChatPanel from '@/components/ChatPanel';
import PlayerTags from '@/components/PlayerTags';
import { readInvite, type Invite } from '@/lib/multiplayer/guest';
import { RELAY_URL } from '@/lib/multiplayer/session';
```

In `Game()` add state and read the invite once on the client:

```tsx
  const [invite, setInvite] = useState<Invite | null>(null);

  useEffect(() => {
    if (RELAY_URL) setInvite(readInvite());
  }, []);
```

Change the vault-picker overlay condition from `{!vault && (` to `{!vault && !invite && (`, add `{!vault && invite && <JoinScreen invite={invite} onVault={setVault} />}` right after it, and mount `<PlayerTags />`, `<ChatPanel />` and `<RoomPanel />` after `<ExteriorEditor />`.

- [ ] **Step 6: Show why a note couldn't load** — `components/NoteReader.tsx`

Add `const [errorText, setErrorText] = useState<string | null>(null);` beside `status`. In the loading effect's reset block add `setErrorText(null);`, and change its `catch {` to:

```tsx
      } catch (err) {
        if (cancelled) return;
        setErrorText(err instanceof Error && err.cause === 'host' ? err.message : null);
        setStatus('error');
      }
```

Change the error line to:

```tsx
                {status === 'error' && <p style={{ color: INK_SOFT }}>{errorText ?? 'Could not read this note.'}</p>}
```

- [ ] **Step 7: Type-check and build**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: clean, pass, build succeeds (this is the first build that bundles `lib/multiplayer/*`'s `.ts`-suffixed imports).

- [ ] **Step 8: Two-window smoke test**

Create `.env.local` with `NEXT_PUBLIC_RELAY_URL=ws://localhost:8787`, run `npm run relay` and `npm run dev`. Normal window: demo town → Invite friends → Start session → Copy. Incognito window: paste the link → name → Join. Expected: both avatars visible with name tags; walking shows on the other side.

- [ ] **Step 9: Review Focus #1 — typing over a live game**

In the guest window: hold W, press T while still holding → release W → the player must be standing still. Type "wasd space" and Enter into chat while standing at a desk's note spot inside a house → the message sends, the player does not move, no note opens. Same check in the host's name field in the Invite dialog.

- [ ] **Step 10: Commit**

```bash
git add components/RoomPanel.tsx components/JoinScreen.tsx components/ChatPanel.tsx components/PlayerTags.tsx components/NoteReader.tsx app/page.tsx
git commit -m "Add invite, join, chat and name-tag UI for study sessions"
```

---

### Task 10: README and end-to-end verification

**Files:**
- Modify: `README.md` (new "Studying together" section; fix the `app/api/` claim)

- [ ] **Step 1: README**

Replace the `- \`app/api/\` — the one server route, for NPC dialogue.` bullet with:

```md
- `lib/multiplayer/` and `relay/` — optional study sessions (see below).
```

Add after the "Running it" section:

````md
## Studying together

A host can invite friends into their town: everyone walks around as their own character
and chats, and guests can open the host's notes. It needs one small relay server, which
never sees note or chat contents — everything is end-to-end encrypted, and the key only
exists in the invite link's `#fragment`, which browsers never send to any server.

```bash
npm run relay                                          # ws://localhost:8787
echo 'NEXT_PUBLIC_RELAY_URL=ws://localhost:8787' > .env.local
npm run dev
```

Open your vault, click **Invite friends**, and send the link. Guests can join from any
modern browser. If they have the same vault synced locally they can pick their copy, and
notes load from their own disk.

- **Hosting the relay:** `relay/server.mts` is a single file with one dependency (`ws`)
  and no database. Run it anywhere with Node 22.18+ (`PORT` sets the port). Put it behind
  TLS and use a `wss://` URL when the app itself is served over HTTPS.
- **What guests can see:** your folder names and note titles, always. Note contents and
  images only while you share "Town + notes" (the default); switch to "Town only" at any
  time. Guests can't edit anything.
- **Limits:** 16 people per session; images and notes up to 4 MB each. The session ends
  when the host leaves.
- Without `NEXT_PUBLIC_RELAY_URL` the app is exactly the solo game — no invite button,
  no network traffic.
````

- [ ] **Step 2: Full automated pass**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: clean, all pass, build succeeds.

- [ ] **Step 3: Manual end-to-end** (relay + dev running, two windows as in Task 9)

1. Host enters a house **before** the guest joins. Guest joins → sees nobody in the overworld; enters the same house → sees the host there immediately (Review Focus #3).
2. Guest enters a *different* house → neither sees the other.
3. Chat both ways; bubbles appear above the right heads and fade after ~5 s. Send `<img src=x onerror=alert(1)> **bold**` and a 600-character line → both render literally; the long one is cut at 500 (Review Focus #5).
4. Guest opens a note → text loads. With a real vault containing an embedded image, the image loads; a note embedding a missing image still opens promptly (Review Focus #4).
5. Host switches to "Town only" → guest's next note shows "The host isn't sharing notes." and bookshelf hover previews are blank.
6. Host changes a house exterior → guest's overworld updates in place. Host rearranges an interior while the guest is in that house → guest's room updates.
7. Open the invite link with the `#key=…` part deleted, and again with its last character removed → join screen says the link is broken within 15 s (Review Focus #2).
8. Group vault: guest joins with "I have this vault too" pointed at a copy of the same vault, host on "Town only" → guest's notes still open (from disk).
9. Stop the relay process → host sees "Lost the connection…" with "Keep studying alone" and keeps playing; guest gets the ended dialog and "Back to title".
10. Host clicks End session → guest gets "The host left…".
11. Remove `NEXT_PUBLIC_RELAY_URL`, restart dev → no Invite button; solo play unchanged.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "Document running and self-hosting study sessions"
```
