# Rooms: one per vault folder, added in-game, each sized separately — design

## Goal

A house's interior becomes several rooms instead of one. Every subfolder of a house folder is a
room, and adding a room in-game creates that subfolder in the real vault. Each room keeps its own
layout, including its own Small/Medium/Large size.

Today the parser already produces `house.rooms` (one per depth-3 folder), but `InteriorScene`
flattens every note in the house into a single room whose layout is saved per house.

## Decisions made in brainstorming

- **Two-way sync.** Vault subfolder → room; "add room" in-game → real subfolder on disk.
- **Doors off the entrance.** The entrance room has a labelled doorway for each other room.
  Walking through loads that room at its own size; every room has a door back.
- **Size stays three presets** (`small` 13×10, `medium` 16×12, `large` 20×15), stored per room.
  No free width/height, no camera scrolling.
- **No adding rooms while anyone else is in your town.** While a study session has at least one
  other player connected, the host cannot add rooms. Guests never can.

## Vault and data model

### Folders become rooms (`lib/vault/open.ts`, `lib/vault/parse.ts`)

`walk()` also collects every folder path it visits (dot-folders are already skipped), and both
`openVault()` and `openDemoVault()` pass them to `parseVault(name, paths, readHead, folders)`.
The demo vault's folders are derived from `DEMO_FILES`' paths plus any rooms added this session.

A depth-3 folder (`Region/House/Room`) becomes a room when either:
- it holds at least one note (anywhere beneath it — deeper folders still flatten into it, as
  today), or
- it holds **no files at all** — a freshly added room, or one made empty in Obsidian.

A folder holding only non-note files (an `attachments/` folder of images) is still **not** a
room, exactly as today. Empty folders only add rooms to houses that already exist from notes;
an empty folder never creates a new region or house, so the overworld is unchanged.

### Every house has an entrance (`lib/types.ts`, `parse.ts`)

`house.rooms[0]` is always the entrance: `{ id: house.id, name: 'Main', notes: <loose notes> }`,
created even when the house has no loose notes. Other rooms follow in the parser's existing
path order. Documented on the `House` type.

`splitRoom()` and `MAX_NOTES_PER_ROOM` are removed: rooms now map one-to-one to folders, and the
bookshelf already handles a long list. (Split ids like `Room#2` would otherwise leak into layout
storage keys and door labels.)

### `VaultHandle.createRoom` (`lib/types.ts`, `lib/vault/open.ts`)

```ts
// Optional: absent means rooms can't be added (read-only vault, multiplayer guest).
// Creates `<houseId>/<name>/` and returns the re-parsed world that contains the new room.
createRoom?: (houseId: string, name: string) => Promise<{ world: WorldModel; room: Room }>;
```

- **Real vault:** `ensureWritable(dir)`, walk to the house folder, `getDirectoryHandle(name,
  { create: true })`, add the folder to the tracked folder list, re-parse from cached heads
  (same as `createNote`).
- **Demo vault:** adds the folder to an in-memory list and re-parses.
- **Validation** (shared helper next to `newNotePath`): strip `BAD_TITLE_CHARS`, trim; reject
  empty, a leading `.`, over 60 characters, or a name matching an existing room folder of that
  house case-insensitively. Errors are thrown as `Error` with a user-facing message, like
  `createNote`.
- **Not for "Main" houses.** A house the parser synthesizes from loose notes in a region folder
  (or the vault root) has no folder of its own: its id has no `/`. A subfolder there would parse
  as a new *house*, so `InteriorScene` never offers adding a room in such a house.

### Layouts per room (`lib/interiorStore.ts`, `lib/interiorLayout.ts`)

- Storage key becomes `interior:<fingerprint>:<roomId>`. The entrance's room id is the house id,
  so **every existing saved layout becomes its house's entrance layout with no migration.**
- `computeDefaultLayout(house, room)`: seeds floor/wallpaper from `room.id`/`room.name` (the
  entrance keeps `house.id`/`house.name`, so an untouched entrance looks exactly as today) and
  puts only `room.notes` on its note-holding furniture. Default size: `large` for the entrance
  (today's default), `medium` for other rooms.
- A note-holding placement opens its note by id wherever it sits (lookup across the whole
  house), so older layouts whose entrance furniture points at notes now living in a subfolder
  room keep working.
- `vaultFingerprint` is built from house ids only, so adding a room never orphans saved layouts.

## In the game

### Door slots (`lib/interiorLayout.ts`)

A pure function shared by `InteriorScene` and `InteriorEditor`, so the game and the editor
preview always agree:

```ts
export type DoorSlot = {
  gx: number; gy: number;               // the doorway tile, on the perimeter
  side: 'top' | 'left' | 'right' | 'bottom';
  inside: [number, number][];           // tiles kept clear so the doorway is reachable
};
export function doorSlots(
  layout: InteriorLayout,
  catalogById: Record<CatalogItemId, { footprint: [number, number] }>,
  max: number,
): DoorSlot[];
```

Candidates, in order, every second tile:
1. **Top wall** (`gy = 0`), `gx` from 2 to `w − 3`, skipping the centre band
   `floor(w/2) − 4 … floor(w/2) + 3` where the house-name and CUSTOMIZE labels sit.
   `inside` = `(gx, 1)` and `(gx, 2)`. Row 1 is the back wall's second row when the shelf is
   against it, so the doorway opens that tile too.
2. **Left wall** (`gx = 0`), `gy` from 2 to `h − 3`. `inside` = `(1, gy)`.
3. **Right wall** (`gx = w − 1`), same rows. `inside` = `(w − 2, gy)`.
4. **Bottom wall** (`gy = h − 1`), `gx` from 2 to `w − 3`, skipping EXIT's column and its two
   neighbours. `inside` = `(gx, h − 2)`.

A candidate is skipped if any `inside` tile is covered by the shelf, its approach row, or any
placement's footprint. So an old layout never gets a door walled off by furniture, and door
positions need no saved state. Returns up to `max` slots.

Capacity with an empty room: about 11 (small), 15 (medium), 23 (large); furniture reduces this.

The editor unions each slot's doorway and `inside` tiles into the structural set, so
`canPlace`/`canPlaceShelf` refuse to put furniture on them. `canResize` gains a `doorsNeeded`
argument and also blocks a shrink that would leave fewer slots than the entrance's rooms need.
The same "Some furniture won't fit" style error applies: "These doors won't fit at this size."

### Entrance (`game/scenes/InteriorScene.ts`)

- `init(data: { houseId: string; roomId?: string; fromRoomId?: string })`. A missing `roomId`
  means the entrance (so `game/config.ts`'s `enter-house` handler is unchanged).
- Rooms other than the entrance are assigned slots in `house.rooms` order. Each doorway is drawn
  as floor instead of wall, with the room name as an 8px label like EXIT (cut to 6 characters on
  the top and bottom walls, 10 on the side walls, `…` after). Rooms beyond capacity get no door; their notes stay reachable from the entrance
  bookshelf. This is a known limit that only affects houses with more than 11–23 subfolders.
- **[+] doorway:** when the player isn't a guest (`registry.get('role') !== 'guest'`, the same
  check CUSTOMIZE uses; both real and demo vault handles have `createRoom`, guests' never do),
  the house has its own folder (its id contains `/`), and a slot is left, the next slot shows a `+` doorway. Walking into it or clicking it emits
  `open-room-namer`. With no slot left, the entrance shows "Make this room bigger to add rooms"
  under the CUSTOMIZE label instead.
- Header reads `House · N` in the entrance and `House / Room · N` in other rooms.

### Moving between rooms

- Stepping onto a room's doorway: `this.scene.restart({ houseId, roomId: slotRoom.id })`.
- In a non-entrance room, the bottom-centre door (today's EXIT position) is labelled **BACK**;
  stepping on it restarts into the entrance with `fromRoomId`, and the player spawns on that
  room's first `inside` tile. Standing in front of any room door shows its full name above the
  player, since door labels on the top and bottom walls are cut to 6 characters (2 tiles apart). If that room has no slot (overflow),
  they spawn at EXIT as usual.
- EXIT in the entrance emits `exit-house` exactly as today.
- Non-entrance rooms have no doors of their own besides BACK, and no [+]: rooms are one level
  deep, like folders.

### Adding a room (`components/RoomNamer.tsx`, new; mounted in `app/page.tsx`)

A parchment prompt in the Bookshelf namer's style: "New room in <House>", a name field,
Create / Cancel. On Create:

1. **Multiplayer guard:** if `getSession()` is `live` with at least one peer, refuse with
   "You can't add rooms while friends are in your town." (Checked again here, not just when
   opening, since someone can join while the prompt is open.)
2. `vault.createRoom(houseId, name)` → `setVault({ ...vault, world })`, `replaceWorld(world)`.
3. Emit `close-room-namer` with `{ roomId }`. The scene restarts into the new, empty room.

Errors (bad name, duplicate, write permission refused) show inline and keep the prompt open.
Cancel/Escape emits `close-room-namer` with no room id and resets keys, like the other overlays.

When the [+] doorway is entered while a peer is connected, the namer opens in a message-only
state showing the same sentence, with just an OK button. So it's clear why nothing happens,
instead of the doorway silently disappearing when a friend joins.

### Customizing (`components/InteriorEditor.tsx`)

- CUSTOMIZE edits the room you're standing in; the Small/Medium/Large row is unchanged but now
  applies to this room only.
- Session gains `roomId` and `doorsNeeded` (entrance: other-room count, not counting [+]; else 0).
  The [+] slot is not reserved: furniture placed on it just moves [+] to the next free slot. The grid shows
  door slots from `doorSlots(draft, …)` as doorway cells and blocks placement on them, updating
  live as size, shelf, or furniture changes.
- `commit-interior-layout` payload becomes `{ roomId, layout }`; the scene saves under `roomId`.

### Bookshelf (`components/Bookshelf.tsx`)

`open-shelf` gains `roomId`. In a non-entrance room, the shelf's tree is rooted at that room's
folder (its breadcrumb starts at the room name and can't go above it) and "+ New note" saves
there. The entrance shelf still shows the whole house, as today.

### Bus (`game/bus.ts`)

```ts
'open-shelf': { houseId: string; roomId: string };
'open-interior-editor': { houseId: string; roomId: string; layout: InteriorLayout; doorsNeeded: number };
'commit-interior-layout': { roomId: string; layout: InteriorLayout };
'open-room-namer': { houseId: string; houseName: string; blocked: boolean };
'close-room-namer': { roomId?: string };
```

## Multiplayer (`lib/multiplayer/host.ts`, `game/scenes/InteriorScene.ts`)

- `buildWorldPayload` sends a layout for every room (`layouts[room.id]`). The wire shape
  `Record<string, InteriorLayout>` is unchanged, so `protocol.ts` doesn't change.
- Presence scene id becomes `house:<roomId>`, so players only see each other in the same room.
  The entrance's id equals the house id, and the protocol's `startsWith('house:')` check already
  accepts it.
- Guests read `sessionLayouts[roomId]` and can walk between rooms, but see no [+].
- **Existing bug fixed along the way:** `startHosting` captures `vault.world` (and `noteIds`) once, so a note or
  room added after hosting started never reaches guests who join later. `sendWorld` and note
  access now read the current world from the game registry at send time.

## Non-goals

- Renaming or deleting rooms in-game (deleting a vault folder from a game is too destructive).
- Rooms inside rooms, or doors between non-entrance rooms.
- Adding houses or regions in-game.
- Moving doors by hand in the editor.
- Free-form room sizes or rooms bigger than the screen.

## Testing

Unit tests (`node --test`, alongside the existing `*.test.mts`):
- `lib/vault/parse.test.mts`: depth-3 folders become rooms; an empty folder is a room; an
  images-only folder is not; an empty folder in a note-less house adds no house; the entrance is
  always `rooms[0]` with the house id, even with no loose notes; no more `#n` split rooms.
- `lib/interiorLayout.test.mts`: `doorSlots` order and capacity for each size; slots skip the
  header band, EXIT, the shelf and furniture; `canResize` refuses a shrink that loses doors.
- `lib/multiplayer/host.test.mts` (new): `buildWorldPayload` keys layouts by room id and includes
  a layout saved for a non-entrance room.

End to end, in headless Chrome against `next dev`:
- A real on-disk vault via OPFS (`showDirectoryPicker` stubbed to an OPFS handle): add a room →
  the folder exists in OPFS → walk in → resize it to small while the entrance stays large →
  add a note there → it lands in the folder → reload and reopen → room, size and note persist.
- Demo town: add a room, walk in and out through BACK, spawn in front of the right door.
- An existing saved single-room layout still renders unchanged as the entrance.
- Multiplayer guard: with a fake connected peer in the session store, [+] shows the refusal and
  `createRoom` is never called.

Plus `npm test`, `npx tsc --noEmit`, `npm run build`.
