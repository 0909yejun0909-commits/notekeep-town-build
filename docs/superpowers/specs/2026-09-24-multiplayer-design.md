# Multiplayer study sessions (v1) — design

## Goal

Let several people study together in one Notekeep Town. A host shares an invite link; friends
join, appear as avatars walking around the host's town (overworld and inside houses), and
text-chat. Today the app is entirely client-side — the vault is read in-browser via
`showDirectoryPicker` (`lib/vault/open.ts`), parsed into `WorldModel` (`lib/types.ts`), and
nothing leaves the machine. Solo play must keep working exactly as it does now, with no server.

## Non-goals

- Accounts, persistent rooms, a public room list, moderation.
- Voice, a shared focus timer, reading a note together.
- Guests editing anything (notes, house exteriors, interiors).
- Synchronized NPCs — each client keeps simulating its own NPCs, so they may stand in
  different spots for different players. Cosmetic, accepted.
- Mobile/touch controls.

## Decisions already made (in brainstorming)

| Question | Decision |
| --- | --- |
| Whose world are people in? | The host's town. Covers both "visit a friend's town" and "a study group that all has the same synced vault". |
| Who can join? | Anyone with the invite link. Display name only — no accounts, no database. |
| v1 features | Presence (seeing each other walk) + text chat. |
| Transport | A small, self-hostable WebSocket relay using `ws`, rooms held in memory. Rejected: peer-to-peer WebRTC (blocked on many school/office networks without a TURN server) and hosted realtime services (tie every self-hoster to a vendor). |
| Encryption | End-to-end. The AES-GCM key lives in the invite link's `#fragment`, which browsers never send to a server, so the relay only ever sees ciphertext. |
| Default note sharing | "Town + notes" is pre-selected in the invite dialog; the host can switch to "Town only". |

## Why the host's world is authoritative, even for a shared group vault

`parseVault` is deterministic (`lib/vault/parse.ts` sorts paths, placement is hash-based), so it
is tempting to let every guest in a group vault parse their own copy. That is unsafe:
`vaultFingerprint` (`lib/interiorStore.ts`) keys on the folder's display name plus its full file
listing, and a single extra note reshuffles placement, so two slightly-diverged synced copies
would build different towns and players would walk on different maps. Instead the host's
`WorldModel` is always the map. A guest's local copy is used only as a faster, private source
of **note bodies**.

## How a session works

1. The host opens their vault as today and clicks **Invite friends**. The button exists only
   when `NEXT_PUBLIC_RELAY_URL` is set and a vault is open. The dialog offers:
   - *Town + notes* (default) — guests can open any note and its images.
   - *Town only* — guests see houses, rooms and note titles; note bodies stay private and every
     `NoteRef.preview` is blanked before sending.

   The dialog states plainly that folder names (region/house/room labels) and note titles are
   always visible to guests.
2. The host's browser connects to the relay, which creates a room. The host gets a link of the
   form `https://<app>/?room=<128-bit id>#key=<AES key>`.
3. A guest opens the link and types a display name. Optionally they click **I have this vault
   too** and pick their own copy of the vault. Guests never need the File System Access API
   unless they pick a local copy, so they can join from any modern browser.
4. The host sends a **snapshot**: the `WorldModel` with the host's saved exterior overrides
   baked into each `House`, plus every saved `InteriorLayout`. The guest's game builds from it
   exactly as if they had opened the vault themselves.
5. Every step and chat message is broadcast. When a guest opens a note, it is read from their
   local copy if they have the file; otherwise the guest asks the host, whose browser reads it
   from disk and replies if sharing allows.
6. When the host leaves, the room closes and guests see "The host left" and return to the
   title screen.

## Architecture

### Relay — `relay/server.ts` (new)

- Run directly with `node relay/server.ts` (Node strips TypeScript types natively from 22.18 /
  23.6; Node 24 LTS is the target). Erasable syntax only — no enums, namespaces or parameter
  properties. Imports nothing from the app.
- Clients send `{to: 'all' | 'host' | <peerId>, data}`; the relay adds `from` and forwards.
  `data` is an opaque encrypted string the relay never inspects.
- Relay control messages: `welcome {peerId, roomId, isHost}`, `peer-joined {peerId}`,
  `peer-left {peerId}`, `room-closed`, `error {code}` with codes `room-not-found`, `room-full`,
  `rate-limited`, `too-large`.
- Limits: 16 peers per room; 8 MB per message (`maxPayload`); a per-connection rate limit; room
  ids from `crypto.randomBytes(16)`; the room is deleted when the host's socket closes; a
  heartbeat ping drops dead sockets. Stores and logs no message content.
- `PORT` env var, default `8787`. New dependency `ws`, dev dependency `@types/ws`. New script
  `"relay": "node relay/server.ts"`.

### Client — `lib/multiplayer/` (new)

- `protocol.ts` — the encrypted app-message union:
  - `hello {name}` (guest → host)
  - `snapshot {world, layouts, share, players}` (host → one guest)
  - `presence {name, scene, gx, gy, facing}` (anyone → all). `scene` is `'overworld'` or
    `'house:<houseId>'`.
  - `chat {text}` (anyone → all), at most 500 characters
  - `note-req {reqId, path, kind: 'text' | 'binary'}` (guest → host)
  - `note-res {reqId, ok, text?, b64?, mime?, error?}` (host → one guest)
  - `world-updated {world, layouts}` (host → all)
  - `share-changed {share}` (host → all)
- `crypto.ts` — generate, export and import an AES-GCM key (base64url in the fragment);
  encrypt and decrypt with a random 12-byte IV per message. WebCrypto only.
- `room.ts` — WebSocket wrapper: connect, typed send/receive with encryption, the presence map,
  guest auto-reconnect (3 attempts with backoff), request/response with a 15 s timeout.
- `host.ts` — `startHosting(vault, share)`: builds the snapshot (clones the world, applies
  `getExteriorOverride` per house, collects `getLayout` per house), answers `note-req` through
  the existing `vault.readNote` / `vault.readBinary` (binary capped at about 6 MB before base64),
  and re-broadcasts `world-updated` after the host commits an exterior or interior edit.
- `guest.ts` — `joinRoom(roomId, key, name, localDir?)` returns a `VaultHandle` whose `world` is
  the snapshot, whose `readNote` / `readBinary` resolve from the local copy first and the host
  second, and which has **no `writeNote`** — `NoteReader` already hides editing when
  `canWrite` is false. Local-copy lookup reuses `walk` (to be exported from
  `lib/vault/open.ts`) and `makeLinkResolver` (`lib/vault/parse.ts`).

### Game changes

- `game/gridMovement.ts` — an optional `onStep(gx, gy, facing)` callback, fired when a step
  starts or facing changes, so remote avatars tween in parallel with the local 150 ms tween.
- `game/remotePlayers.ts` (new) — `attachRemotePlayers(scene, sceneId)` spawns a sprite for each
  remote peer in the same `sceneId`, dresses it with `dressPlayer()` (`game/playerSprite.ts`),
  tweens 150 ms per one-tile step, snaps on larger jumps, sets depth from y, and cleans up on
  scene SHUTDOWN. It publishes each avatar's screen position for the React tag overlay.
- `OverworldScene.ts` / `InteriorScene.ts` — call `attachRemotePlayers` and pass an `onStep`
  that sends `presence`. For guests (`registry.get('role') === 'guest'`), skip wiring the
  exterior-editor click and the interior-editor key.
- Guests get **no `vaultFingerprint`** in the registry, so their own localStorage can never
  override the host's world (both scenes already skip overrides when it is absent).
  `InteriorScene` reads `registry.get('sessionLayouts')?.[houseId]` before falling back to its
  default layout.
- `lib/vault/open.ts` `publishWorld` — accepts a role and optional session layouts for guests.

### UI (React overlaid on the canvas — never UI inside Phaser)

- `components/RoomPanel.tsx` — host side: the Invite dialog (share toggle, visibility notice,
  copy link, player list, End session). Guest side: the join screen shown when `?room=` is in
  the URL (name, "I have this vault too", Join), plus the error states below.
- `components/ChatPanel.tsx` — a collapsible log and input, bottom-left. `Enter` focuses or
  sends, `Esc` blurs. Uses `NoteReader`'s `stopKeys` pattern (`components/NoteReader.tsx:358`)
  so typing W/A/S/D does not walk the player. Messages render as plain React text.
- `components/PlayerTags.tsx` — DOM name tags and 5-second chat bubbles above every avatar,
  including your own, positioned from the camera every frame through refs rather than React
  state, so text stays crisp at zoom 3 and nothing re-renders per frame.
- `app/page.tsx` — mounts the three components; the guest flow calls `setVault(remoteVault)`.
- `game/bus.ts` — one new event, `world-updated`, which the active scene handles by restarting
  at the player's current tile. Chat, the player list and room status flow from
  `lib/multiplayer/room.ts` to React directly, not through the bus, since Phaser never needs
  them.

### Security fix — lands first

`components/NoteReader.tsx` renders markdown with `urlTransform={(url) => url}` (lines 394 and
431), which passes every link and image URL through untouched. That is fine for your own notes
but not for notes written by someone else. Replace it with a transform that keeps `blob:` and
`wikilink:` URLs and otherwise defers to react-markdown's `defaultUrlTransform`, which strips
`javascript:` and other unsafe schemes.

## Failure handling

| Situation | Behavior |
| --- | --- |
| `NEXT_PUBLIC_RELAY_URL` unset | No multiplayer UI at all; the app is exactly today's solo app. |
| Relay unreachable | Invite shows an error; solo play is unaffected. |
| Guest connection drops | Auto-reconnect, re-request the snapshot, re-send presence. |
| Host closes the tab or drops | Relay sends `room-closed`; guests get "The host left" and return to the title screen. |
| Link missing or corrupted key | Decryption fails; "This invite link is broken or incomplete." |
| Room full / not found | A clear message on the join screen. |
| Note refused (Town only) | `NoteReader`'s existing error state: "The host isn't sharing notes." |
| Note request times out | "Couldn't reach the host." |
| Host commits an exterior/interior edit | `world-updated`; guest scenes restart at the guest's current tile via the existing `returnTile` mechanism. |

## Testing

- `npx tsc --noEmit` and `npm run build` pass.
- `node --test relay/` — relay tests for room create/join, `to` routing, room full, host leaving
  closes the room, oversize messages rejected; plus an encrypt/decrypt round-trip. Node's
  built-in runner, no new dependencies. This is a deliberate exception to the event-era "no
  tests" rule: the relay is the one security boundary in the app.
- Manual, two browser windows (one normal, one incognito), with `npm run relay` and
  `npm run dev` running:
  1. Host opens the demo town and clicks Invite; guest joins via the link.
  2. Both see each other walk in the overworld and inside the same house, and do **not** see
     each other when inside different houses.
  3. Chat works both ways with bubbles; typing "wasd" into chat does not move the player.
  4. Guest opens a note with an image.
  5. Host switches to Town only; guest's next note open is refused.
  6. Host changes a house exterior; the guest's town updates.
  7. Host closes the tab; guest sees "The host left".
- Group-vault case: the guest picks their own copy of the demo vault, the host is set to Town
  only, and the guest's note opens from local disk.
- Under Claude-in-Chrome automation, Phaser's loop stalls unless `fps.forceSetTimeOut` is on;
  it already is in `game/config.ts`.

## Implementation order

1. Security fix in `NoteReader`.
2. Relay + tests.
3. `crypto.ts`, `protocol.ts`, `room.ts`.
4. Host and guest `VaultHandle` paths.
5. `onStep` hook and `remotePlayers`.
6. `RoomPanel`, `ChatPanel`, `PlayerTags`, `app/page.tsx` wiring.
7. Manual verification.
