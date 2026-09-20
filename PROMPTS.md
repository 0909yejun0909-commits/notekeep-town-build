# The prompts

**How this works on Sunday:**

1. Track A pastes **Prompt 0**. Its first job is to write `CLAUDE.md` into the new repo.
2. From then on, every agent session opened in that repo **auto-loads `CLAUDE.md`** — the
   stack, the type contract, and the rules for working as one of four parallel agents.
3. So B, C and D paste **only their own track prompt**. Short. No context block to copy.

That's the whole design. The context lives in the repo, not in four people's clipboards.

> **Belt and braces:** every track prompt still opens with *"Read CLAUDE.md and docs/ASSETS.md
> first."* If auto-loading doesn't happen in whatever interface we're using on the day, the
> instruction covers it. Don't remove that line.

> **Frozen after Saturday's rehearsal.** If a prompt is wrong on Sunday, correct it in the
> chat — don't stop to edit this file.

---

## Order of operations

**The build is 90 minutes.** Gate at 0:12, freeze at 1:05 — a 53-minute parallel window.

**Every track prompt below was walking, entering-a-house-and-reading-a-note, and
talking-to-an-NPC clean in a full four-track dress rehearsal** (foundation build, all four
tracks cold, real merge, real boot). **Roads, water, decoration, room dressing, multi-room
and the dressed-player fix were added afterward, live, against the running rehearsal build
— they're real working code, but they have NOT yet been through a cold four-track
merge-and-boot pass themselves.** If there's a rehearsal slot before Sunday, spend it there
first. Each prompt is internally ordered so the verified core comes first and the newer
additions come after, with an explicit CUT ORDER line saying what to drop first if the
clock runs out — an agent builds what is in front of it, and "cut it if you're late" does
not work when *late* is discovered at 0:40 with 25 minutes left, so the cut order has to be
decided in the prompt text, not improvised live. What didn't make it into base scope at all
is in the [appendix](#appendix--the-stretch-list), and it gets handed out one item at a
time, by Track A, only to a track that has already finished.

| Time | Who | Paste |
| --- | --- | --- |
| 0:00 | Track A **alone** | [Prompt 0](#prompt-0--foundation) (includes the CLAUDE.md content + the asset manifest) |
| 0:12 | — | A pushes `main`. Everyone pulls, branches, and **opens a fresh session in the repo**. |
| 0:14 | Track A | [Vault parser](#track-a--vault-parser) |
| 0:14 | Track B | [Overworld](#track-b--overworld) |
| 0:14 | Track C | [Interiors & note reader](#track-c--interiors--note-reader) |
| 0:14 | Track D | [Character, NPCs & the demo machine](#track-d--character-npcs--the-demo-machine) |

While A runs Prompt 0, B/C/D unzip assets, confirm the directory picker works, and get their
prompt ready. **Don't open a session in the repo before 0:12** — there's nothing to load yet.

---

## Prompt 0 — Foundation

**Track A, alone, at 0:00.** Paste this, then paste the filled-in contents of
[`ASSETS.md`](ASSETS.md) where the prompt says to.

```text
You are bootstrapping a 90-minute, 4-person parallel build. Three other people are
blocked until this is pushed, and they lose a minute for every minute you take.
Build exactly what is listed and nothing more.

STEP 1 — Write this file to the repo root as CLAUDE.md, verbatim, then append the
asset manifest I paste at the end of this message under the "## Asset manifest"
heading the file already ends with — do not add a second one, and drop the
manifest's own "# Asset manifest" H1.

Do this BEFORE step 2 if you can write it somewhere and copy it in afterwards, or
immediately AFTER step 2 otherwise: create-next-app writes its own CLAUDE.md and
AGENTS.md into the directory and will clobber yours. Overwrite both with no
discussion — theirs carries no authority here. Either order is fine, but CLAUDE.md
must be correct before you write any code:

---------------------------- BEGIN CLAUDE.md ----------------------------
# Notekeep Town

A Stardew/Pokemon-style pixel overworld generated from the user's real Obsidian
vault. Folders become regions, houses and rooms. Notes become furniture you walk
up to and open. Built live in 90 minutes by four agents working in parallel.

## Locked stack — never substitute

- Next.js (App Router) + TypeScript + Tailwind
- Phaser 3, pinned at phaser@^3.90.0. `npm install phaser` gives you v4, which
  breaks every v3 scene API in this project. If package.json ever says ^4, that
  is a bug — fix it before doing anything else.
- NO database, NO auth, NO backend, except one API route for NPC dialogue.
  The vault is read from the user's own disk with the File System Access API
  (showDirectoryPicker). Everything else is client-side.
- Phaser must be dynamically imported with ssr: false. It touches `window` at
  import time and crashes during server rendering.

Before writing Next.js code, read the relevant guide in node_modules/next/dist/docs/
— this Next.js version has breaking changes from what you may have memorised.

`npx tsc --noEmit` FAILS on a fresh clone with "Cannot find name 'LayoutProps'" in
app/layout.tsx. That is not a bug and it is not yours to fix — layout.tsx uses a type
Next generates into .next/types, and .next/ is gitignored. Run `npm run dev` once
first, then typecheck. Never edit app/layout.tsx to make it go away.

## Required Phaser config

pixelArt: true, roundPixels: true, antialias: false, integer zoom only (3).
Tiles are 16x16. The player is 2 tiles tall. Fractional scaling turns pixel art
to mush — never use it.

## The type contract

These live in lib/types.ts. Every track imports them from there. Nobody
redefines them and nobody adds or renames a field without telling the team.

  export type BiomeId = 'meadow' | 'forest' | 'desert' | 'volcano' | 'snow';
  export type FurnitureId =
    'desk' | 'shelf' | 'bed' | 'chest' | 'plant' | 'painting' | 'lamp' | 'rug';

  export type NoteRef = {
    id: string;        // path relative to vault root, e.g. "Work/Ideas/api.md"
    title: string;     // filename without extension
    furniture: FurnitureId;
    gx: number; gy: number;   // grid position inside its room
    preview: string;   // first 200 chars, plain text, no markdown syntax
  };

  export type Room  = { id: string; name: string; notes: NoteRef[] };

  export type House = {
    id: string; name: string;
    gx: number; gy: number;   // grid position inside its region
    variant: number;          // which building sprite, 0-4
    rooms: Room[];
  };

  export type Region = {
    id: string; name: string;
    biome: BiomeId;
    houses: House[];
  };

  export type WorldModel = { name: string; regions: Region[] };

  // Content loads lazily — never read every file up front.
  export type VaultHandle = {
    world: WorldModel;
    readNote: (id: string) => Promise<string>;
    readBinary: (path: string) => Promise<Blob>;
  };

  // Every piece's footprint in tiles: [cols, rows]. Both the track that PLACES
  // furniture (A) and the track that RENDERS it (C) need the same numbers, or
  // placement and rendering disagree about how big a piece is and pieces overlap.
  export const FOOTPRINT: Record<FurnitureId, [number, number]> = {
    desk: [2, 3], shelf: [2, 2], bed: [2, 2], chest: [1, 1],
    plant: [1, 2], painting: [1, 1], lamp: [1, 2], rug: [3, 3],
  };

## Folder to world mapping

  depth 1 folder       -> Region
  depth 2 folder       -> House
  depth 3+ folder      -> Room (anything deeper flattens into its nearest room)
  loose .md at depth 2 -> a default room named "Main"
  .md file             -> NoteRef

Any number of folders at any depth must work. Nothing hardcoded, no fixed counts,
no assumptions about how many regions or houses exist.

## Derived values — deterministic, so a vault always builds the same town

  biome     = BIOMES[hash(region.name) % BIOMES.length]
  variant   = hash(house.name) % 5
  furniture = FURNITURE[hash(note.id) % FURNITURE.length]

Use a stable string hash (djb2). Never Math.random() for anything that should
survive a reload.

## File ownership — four agents are working in this repo right now

  Track A  lib/types.ts, lib/vault/*, game/gridMovement.ts,
           game/scenes/BootScene.ts
  Track B  game/scenes/OverworldScene.ts, game/tilemap.ts
  Track C  game/scenes/InteriorScene.ts, components/NoteReader.tsx
  Track D  components/CharacterCreator.tsx, game/npc.ts,
           game/scenes/TitleScene.ts, game/playerSprite.ts

lib/vault/parse.ts exports `roomSize(room)` and `regionSize(region)` — the room and
region dimensions Track A's own placement code uses. Track C imports and uses
`roomSize()` as the ONLY source of room geometry rather than inventing its own; two
independent room models is how furniture ends up floating in the middle of a wall.

  NOBODY   package.json, game/config.ts, game/bus.ts, app/page.tsx,
           app/layout.tsx, components/PhaserCanvas.tsx
           These six are written by the foundation commit and are FROZEN.
           They already import and mount every component and wire every
           event. If you think you need to edit one, you have misread your
           prompt — the hook you want is already there.

## How the pieces talk to each other

Phaser cannot render React and React cannot reach into a scene, so everything
crosses through game/bus.ts, a tiny typed emitter that exists before anyone
branches. You never edit it. You emit on it and you listen to it.

  bus.emit('enter-house', { houseId })   Overworld -> Interior   (Track B emits)
  bus.emit('exit-house')                 Interior  -> Overworld  (Track C emits)
  bus.emit('open-note',  { note })       Interior  -> React      (Track C emits)
  bus.emit('close-note')                 React     -> Interior   (NoteReader emits)
  bus.emit('talk-npc',   { npcId, line })   Overworld -> React   (Track D emits)

app/page.tsx already subscribes to open-note and talk-npc and already renders
<NoteReader> and <CharacterCreator>. The scene switch on enter-house / exit-house
is already wired. Fill in your component or your scene; the plumbing is done.

Never use this.events or this.scene.start() to cross a boundary. A scene-local
emitter is invisible to React and to the other three tracks.

## Shared game state — the registry

The bus is for one-shot events, not standing data. World data and the player's own state have
to be readable from any scene at any time, so they go through Phaser's registry instead — the
one shared channel. Never invent a second one (no globals, no scene.data on someone else's
scene, no reaching into another scene's fields).

  game.registry.set('world', world)      Track A sets, right after parse AND after
                                          the demo-vault fallback — whichever resolves
  game.registry.set('player', sprite)    Track B sets, once, in OverworldScene.create()
  game.registry.set('isWalkable', fn)    Track B sets, once, in OverworldScene.create()

`game` is `(window as any).__game`, set once by the frozen PhaserCanvas.tsx. From inside any
scene it's just `this.game` — the window handle only matters for Track A, which sets 'world'
from React, outside any scene.

Read the registry with `this.game.registry.get('world')` etc. `world` may be undefined for a
moment before Track A's promise resolves — render an empty stub, don't crash. Every scene
reads `world`.

`player` and `isWalkable` are narrower than they look. They are Overworld's own sprite and
Overworld's own collision predicate, published for ONE consumer: spawnNpcs(), which runs
inside Overworld and needs the player's tile to decide whether Space is close enough to talk.

InteriorScene must NOT read either of them. A Phaser sprite belongs to the scene that made
it and cannot be rendered by another scene, and Overworld's walkability is grass and houses,
which is not what the inside of a house collides with. Interior builds its own player sprite
and its own predicate and passes both to GridMovement, exactly as Overworld does. Two sprites
exist; only one scene is ever running.

## Scene keys — the exact strings, so a transition is never silently a no-op

  BootScene | TitleScene | OverworldScene | InteriorScene

Every `super('X')` and every `scene.start('X')` in the whole codebase uses these four
strings verbatim. A typo here doesn't error, it just does nothing — the scene never
switches and there is no console warning. This bit real cold agents in rehearsal.

## The world-ready gate — why BootScene does NOT start OverworldScene directly

OverworldScene reads `registry.get('world')` in `create()` and renders whatever it finds —
including nothing, if no vault has been picked yet. `create()` runs exactly once per
`scene.start()`. If BootScene starts OverworldScene immediately, Overworld builds itself
from an empty world, and **nothing ever tells it to rebuild** once Track A's `openVault()`
resolves and calls `registry.set('world', world)` — the scene just sits there, permanently
empty, with no error anywhere. This is not hypothetical: it is the exact bug that hid every
house in the first full rehearsal of this plan, and it looked identical to "Track B's house
code is broken" until traced to the scene wiring.

The fix belongs in game/config.ts (frozen, Step 6), not in any one track's scene:
BootScene starts **TitleScene**, not OverworldScene. TitleScene.update() polls
`this.game.registry.get('world')` every frame and calls `this.scene.start('OverworldScene')`
the instant it's set. Track D still owns TitleScene's content (see Track D's prompt) but the
polling loop itself is written by the foundation commit in Step 8's stub, because it's the
one thing that must exist before Track D's code lands or the whole game is unreachable.

## The frozen React contract

app/page.tsx is frozen and it imports these four names from lib/vault/open.ts. Track A
fills in the bodies; the names and shapes below are fixed and nobody may change either
side. If you rename one of these, page.tsx breaks and no track is allowed to fix it.

  openVault(): Promise<VaultHandle | null>       picks a real vault, null on cancel
  openDemoVault(): Promise<VaultHandle | null>   the "Try the demo town" button
  VaultProvider({ children })                    wraps the whole tree
  useVault(): { vault: VaultHandle | null;       the ONLY context value
                setVault: (v: VaultHandle | null) => void }

Both open functions RETURN the handle. page.tsx does `setVault(await openVault())` —
they do not set the context themselves.

## Texture keys — one vocabulary, set by BootScene

Track A's BootScene loads these and every other track addresses them by these exact
strings. Do not invent a key and do not prefix one. Paths are relative to public/.

  player                    character/base.png              sheet 64x64
  farmer_bob                npc/farmer_bob.png              sheet 64x64
  bartender_katy            npc/bartender_katy.png          sheet 64x64
  terrain-grass             terrain/fill_grass_meadow.png   image
  terrain-path              terrain/fill_path.png           image
  terrain-water             terrain/fill_water.png          image
  house-0 .. house-4        buildings/house_<n>.png         image
  interior-floor            interior/floor.png              sheet 16x16
  interior-walls            interior/walls.png              sheet 16x16
  interior-doors            interior/doors.png              sheet 16x16
  furn_desk  furn_shelf  furn_bed    furn_chest
  furn_plant furn_lamp   furn_painting furn_rug              image, one per
                            furniture file in the manifest, then add the pixel
                            rect as a frame (see the manifest's furniture snippet)
  tree-oak                  terrain/tree_oak.png             sheet 32x48
  tree-spruce                terrain/tree_spruce.png          sheet 32x48
  flowers                    terrain/flowers.png              sheet 16x16
  grass-edges                terrain/grass_meadow.png         sheet 16x16
  water-edges                terrain/water.png                sheet 16x16
  cobble-edges                terrain/cobble.png                sheet 16x16
  player-shoes                character/shoes/black.png         sheet 64x64
  player-pants                character/pants/brown.png         sheet 64x64
  player-shirt                character/shirt/red.png           sheet 64x64
  player-hair                 character/hair/1_brown.png        sheet 64x64
  ui-book                   ui/book.png                     image
  ui-frames                 ui/frames.png                   image

Animations, created by BootScene:

  idle-down  idle-right  idle-up  walk-down  walk-right  walk-up

Played on the `player` texture and nowhere else — the player sheet is 9 columns
(576px) and NPC sheets are 6 columns (384px), so `generateFrameNumbers('player', ...)`
produces frame numbers that are wrong on an NPC texture. If you need an NPC to
animate, create separate `<npcId>-<anim>` animations off the NPC's own texture with
the same row layout (row 0 idle-down .. row 5 walk-up) but `start: row * 6`.

There is no left animation for player or NPCs — face left with flipX, per the manifest.

## Operating rules

1. READ BEFORE YOU WRITE. Before implementing anything, read the files your
   prompt names and any file you are about to import from. Another agent has
   very likely already built the helper you are about to write. Reinventing
   something that already exists is the single most expensive mistake available
   to you today.

2. STAY IN YOUR LANE. Your prompt names the files you own. Do not create, edit,
   rename or refactor anything else — not to tidy up, not to fix a type error in
   someone else's file, not to improve an import. If a file you need is broken,
   say so and work around it.

3. NEVER EDIT THE FROZEN FILES listed above. Every dependency is installed,
   every scene registered, every component mounted and every event wired by the
   foundation commit. If you think you need a new dependency, you almost
   certainly do not — check package.json first, it is already there.

4. IF SOMETHING YOU NEED DOES NOT EXIST YET, STUB IT LOCALLY AND MOVE ON. Do not
   build it properly — another agent owns it and is building it right now.

5. COMMIT EVERY 10 MINUTES with a one-line message. Small diffs merge; large
   ones fight.

6. NO SCOPE CREEP. No tests, no README, no documentation, no comments explaining
   what code does, no error handling for cases that cannot happen, no
   abstractions for a second use case that does not exist. Ninety minutes.

7. WHEN BLOCKED, STOP AND SAY SO. Never silently invent an alternative
   architecture.

## Conventions

Phaser scenes in game/scenes/. Shared game helpers in game/. React UI in
components/. All user-facing UI is React overlaid on the canvas — never build UI
inside Phaser.

## Asset manifest

Never guess a frame index or a sheet dimension. Every number is below. If a
number you need is missing, stop and ask — do not estimate.
----------------------------- END CLAUDE.md -----------------------------

STEP 2 — Scaffold a Next.js + TypeScript + Tailwind app in this empty directory.
Install phaser@^3.90.0 explicitly, plus every dependency the whole project will
need so nobody touches package.json again:
  phaser@^3.90.0
  react-markdown
  remark-gfm
Confirm .env* is in .gitignore. There is no API key and no server route today
— NPC dialogue is a hardcoded line, not a model call. See Track D.

STEP 3 — Create lib/types.ts with the type contract above verbatim, plus the
djb2 hash helper and the BIOMES / FURNITURE arrays.

STEP 4 — Create game/bus.ts, the typed emitter described in CLAUDE.md above.
Roughly twenty lines: a module-level emitter, an on/off/emit trio, and an event
map covering enter-house, exit-house, open-note, close-note and talk-npc. No
dependency — a Map of Sets of callbacks is enough. Everything else in this file
list depends on it, so write it before them.

STEP 5 — Create app/page.tsx. This is the file that makes four people's work
appear on one screen, and nobody may edit it after you, so wire ALL of it now
even though every component is still a stub:
  - everything wrapped in <VaultProvider> imported from lib/vault/open.ts, so
    Track A's useVault() hook has a provider without editing this file
  - a full-viewport dark page with a centred "Open your vault" button that calls
    openVault() from lib/vault/open.ts, plus a "Try the demo town" button that
    calls openDemoVault() from the same file. Both are `setVault(await fn())` —
    see "The frozen React contract" above and use those names exactly
  - the Phaser canvas in components/PhaserCanvas.tsx (a new frozen file — add
    it to the NOBODY list in CLAUDE.md alongside the other five), dynamically
    imported into page.tsx with ssr: false. PhaserCanvas creates the Phaser.Game
    instance and immediately does `(window as any).__game = game` — this is the
    only handle to it, and it's how Track A reaches `game.registry` to set
    'world', and how anyone debugging in the console can inspect it.
  - <CharacterCreator visible={!vault} /> rendered over the canvas — visible is
    the only prop it takes, true until the vault opens, then false
  - <NoteReader note={openNote} /> rendered over the canvas, mounted when a
    bus 'open-note' arrives and unmounted on 'close-note'
  - a bus listener for 'talk-npc' that renders a dialogue <div> showing the
    `line` field straight off the event payload — plain markup is fine, Track D
    supplies the text by emitting it, not by you looking anything up
It must compile and run with every component still a TODO stub. A stub that
renders null is correct at this stage.

STEP 6 — Create game/config.ts with the required Phaser config, REGISTER ALL
FOUR SCENES NOW as stubs so nobody edits this file again, and wire the scene
switch on the bus: 'enter-house' starts InteriorScene with { houseId },
'exit-house' returns to OverworldScene. Do this here, not in a scene — no track
owns both sides of that transition.
  game/scenes/BootScene.ts       loads every key in CLAUDE.md's "Texture keys"
                                 table, creates the six animations listed there,
                                 starts TitleScene on complete — NOT Overworld,
                                 see "The world-ready gate" above. Use those exact
                                 strings — three other tracks address them by
                                 name. public/assets/ is installed by hand after
                                 you finish, so expect 404s on this first run
  game/scenes/OverworldScene.ts  stub extending Phaser.Scene
  game/scenes/InteriorScene.ts   stub
  game/scenes/TitleScene.ts      stub, BUT its update() must already poll
                                 `this.game.registry.get('world')` and call
                                 `this.scene.start('OverworldScene')` the instant
                                 it exists — this one line of "stub" is load-
                                 bearing, see "The world-ready gate" above. Track
                                 D fills in what TitleScene shows before that;
                                 they do not need to touch this polling line.

STEP 7 — Create game/gridMovement.ts, the shared movement helper both the
overworld and interior scenes will import:
  - 16px grid, arrow keys and WASD
  - tweens between tile centres, one tile per press, input locked until the
    tween finishes (Pokemon Gen 3 movement — never free pixel movement)
  - takes a collision predicate (gx, gy) => boolean so each scene supplies its
    own walkability rules
  - drives a 4-direction walk animation and an idle frame on stop
Export it as a class constructed with a sprite and a collision function.

STEP 8 — Create stub files so no other track ever has to create them:
  game/tilemap.ts, game/npc.ts, game/playerSprite.ts,
  components/NoteReader.tsx, components/CharacterCreator.tsx,
  lib/vault/parse.ts, lib/vault/open.ts
Each exports one function with the correct signature and a TODO body. Three of
these matter more than the rest:
  - the two components must render null without throwing, because app/page.tsx
    already mounts them
  - lib/vault/open.ts must export all four names from "The frozen React contract"
    above — openVault, openDemoVault, VaultProvider and useVault — with exactly
    the signatures given there, because app/page.tsx already imports all four.
    useVault returns { vault, setVault } and nothing else
  - game/npc.ts must export spawnNpcs(scene, region) as a no-op, and
    game/playerSprite.ts must export dressPlayer(scene, sprite) as a no-op,
    because both OverworldScene and InteriorScene will call them and Track B/C
    may not wait on Track D to exist first

STEP 9 — Write docs/ASSETS.md containing the manifest I pasted, so other tracks
can read it from disk.

DEFINITION OF DONE: `npm run dev` serves the page, the button opens a directory
picker, a Phaser canvas mounts, `npx tsc --noEmit` passes AFTER that dev run, and
CLAUDE.md exists at the repo root with the manifest appended. The only console
errors allowed are 404s on public/assets/* — the art is installed by hand after
you finish. Anything else is yours. Commit and push to main immediately. Do not
polish anything.

THE ASSET MANIFEST FOLLOWS — append it to CLAUDE.md and write it to docs/ASSETS.md:

[paste docs/ASSETS.md here, DOWN TO THE "END OF PASTE" LINE AND NO FURTHER —
everything below that line documents features that were cut]
```

---

## Track A — Vault parser

```text
Read CLAUDE.md and docs/ASSETS.md first. You are Track A.

Build lib/vault/*, plus game/scenes/BootScene.ts (already exists as a stub, and
you're the only track allowed to touch it — everyone else is blocked on real
textures existing). Do not touch any other scene file or any component.

0. BootScene already exists from the foundation commit and already loads the
   textures in CLAUDE.md's "Texture keys" table. Read it first. Your job is to
   check it against docs/ASSETS.md — the exact file paths, and frameWidth/
   frameHeight where the manifest specifies a grid — and to fix anything that
   doesn't match. Do NOT rename a key or add one of your own: that table is the
   vocabulary three other tracks are already writing against. Same for the six
   animation names. This is quick; do it first so the other three tracks aren't
   rendering against missing textures for the whole build.

1. lib/vault/open.ts — openVault(): Promise<VaultHandle>
   - calls showDirectoryPicker({ mode: 'read' })
   - recursively walks the handle, skipping folders starting with "." (.obsidian,
     .trash) and non-.md files except images and video
   - builds the WorldModel using the folder mapping and derived values in CLAUDE.md
   - readNote(id) and readBinary(path) resolve file handles lazily and cache them
     in a Map. Never read every file up front — a real vault has thousands.

2. Grid placement. This drives everything visual, so get it right:
   - Export `roomSize(room): { w: number; h: number; door: { x: number; y: number } }`
     and `regionSize(region): { w: number; h: number }` from lib/vault/parse.ts. These
     are the ONLY definitions of room and region dimensions anywhere in the codebase —
     Track C imports and calls your `roomSize()` rather than computing its own, so
     whatever numbers you use here are exactly what Interior renders. Pick a simple
     rule (e.g. a square room sized off note count, a 1-tile wall border, door at
     bottom-centre) and be consistent — the actual formula matters far less than both
     tracks agreeing on it.
   - Houses sit on a loose grid with jitter inside their region, minimum 3 tiles
     apart so they never overlap, positions derived from the name hash so they
     are stable across reloads.
   - Furniture: place using `FOOTPRINT[note.furniture]` from lib/types.ts — a piece's
     real width and height, not a fixed 1-tile guess. Go against room walls first,
     then the interior, and check each candidate slot against every OTHER piece's
     real footprint (not just its centre point) before taking it, or a rug can
     overlap a painting that looks legal by centre-distance alone. Never on the
     door tile at the room's bottom centre.
   - A region with 1 house and a region with 30 houses must both look deliberate.
     Scale region dimensions to house count.

3. preview: strip frontmatter, markdown syntax and image embeds, then take the
   first 200 characters of plain prose.

4. One try/catch around openVault, falling back to openDemoVault(). That is the
   whole of this track's defensive work. We present on one laptop, in Chrome,
   with a vault we chose — do not write handling for empty vaults, for vaults
   with no subfolders, or for a folder with 500 notes. Those break off-camera or
   not at all, and you are the critical path.

   openDemoVault() runs YOUR SAME parseVault() over public/demo-vault/ — NOT a
   separate hardcoded WorldModel and NOT a flat JSON of previews. Two parsers for
   two sources is how the demo path quietly diverges from the real one (found in
   rehearsal: the demo button showed 183-character previews and broken images
   because its data had no note bodies). Instead:
   - public/demo-vault/ is a copy of the real demo-vault/ folder plus an
     index.json listing every file path in it, installed by hand before 0:12 the
     same way the art is (scripts/install-demo-vault.sh) — it will already be
     there when you reach this step.
   - Write a small FileSystemDirectoryHandle-shaped shim backed by `fetch` instead
     of disk: `entries()` groups index.json's paths by the current prefix into
     files and subdirectories, and a file entry's `getFile()` does
     `fetch('/demo-vault/' + path)` and wraps the response in a `File`. Your
     openVault() code only ever calls `entries()`, checks `.kind`, and calls
     `.getFile()` — so the same parseVault() runs unmodified over either source.
   - readNote/readBinary on this path are the same fetch-by-path pattern.

   The instant you have a WorldModel — real or demo-fallback — call
   `(window as any).__game.registry.set('world', world)`. That single line is
   how Phaser sees your parse; Tracks B and C read it from the registry and
   cannot get it any other way. `__game` is set by the frozen PhaserCanvas.tsx —
   don't create your own Phaser.Game reference. It is also what wakes
   TitleScene's poll and starts the game — see CLAUDE.md's "world-ready gate".

5. Fill in VaultProvider, useVault() and openDemoVault() in lib/vault/open.ts —
   all three already exist as stubs and app/page.tsx already imports and mounts
   them, so do not touch app/. Keep the signatures in CLAUDE.md's "The frozen
   React contract" exactly: useVault returns { vault, setVault }, and both open
   functions return the handle rather than setting context themselves. The
   provider holds the VaultHandle in context; scenes and the note reader both
   read it through the hook. Getting this right unblocks Tracks B and C, so do it
   before step 3 or 4 if you are running behind.

DONE WHEN: you pick the demo vault and console.log(world) shows the correct
nested structure, with positions identical across two reloads. Push to main.
```

---

## Track B — Overworld

```text
Read CLAUDE.md and docs/ASSETS.md first. You are Track B.

Fill in game/scenes/OverworldScene.ts and game/tilemap.ts. They already exist
as stubs. game/gridMovement.ts already exists too — read it and use it. Do not
write your own movement code.

Steps 1-2 are the floor — never behind on these. Steps 3-5 make the town look
like a place rather than a green rectangle; do them in order and stop wherever
the clock catches you. Commit after each step.

1. WALKING FIRST. Render a hardcoded 30x20 grass tilemap from the terrain sheet
   and put the player on it using the existing GridMovement class. Camera follows,
   clamped to map bounds. Nothing else matters until this feels right — tune the
   tween until walking feels like Pokemon, roughly 150-180ms per tile.

2. Houses from region.houses. Each is a building sprite chosen by its variant,
   a name label above it, a door tile at its bottom centre, solid collision
   everywhere except the door. Stepping on the door calls
   bus.emit('enter-house', { houseId: house.id }) — import the bus from
   game/bus.ts. The scene switch is already wired in game/config.ts; you only
   emit. Do NOT use this.events and do NOT call this.scene.start() yourself.
   The demo vault only has two houses, but region.houses can be any length —
   don't hardcode a count.

   One extra line at the end of create(): call spawnNpcs(this, region) from
   game/npc.ts. It is a stub that does nothing until Track D fills it in, and it
   is the only way NPCs can reach your scene — Track D is not allowed to edit
   OverworldScene. Write the call, don't write the function.

   Also at the end of create(), once your player sprite and collision predicate
   exist: `this.game.registry.set('player', this.player)` and
   `this.game.registry.set('isWalkable', this.isWalkable.bind(this))`. This is
   the only way Interior and NPCs reach your player/collision state — see
   CLAUDE.md's registry section. Do it once, not every frame.

   Dress the player sprite: import `dressPlayer` from game/playerSprite.ts
   (Track D's file, already exists as a stub) and call
   `dressPlayer(this, this.player)` right after creating the player sprite. It
   is a no-op until Track D fills it in — you are only wiring the call, same
   pattern as spawnNpcs. Without this call the character has no clothes on for
   the whole demo, because base.png alone is an unclothed body.

3. Roads. Each house has an entry tile (the tile directly below its door — same
   tile your enter-house trigger already uses). Connect every house to the
   others with a simple deterministic path: run one east-west trunk road a
   couple of tiles below the lowest door, then a straight north-south spur from
   each house's entry tile up to the trunk. No pathfinding, no curves — straight
   lines are correct and read fine at this zoom. Render it as an autotiled
   surface, not a flat image:
   - grass -> sand lip -> cobble is the layering, matching the art. Take the
     set of road tiles, GROW it by one tile in all eight directions for a
     second set, autotile the grown set with `grass-edges` on top of the base
     grass, then autotile the original road set on top of that with
     `cobble-edges`.
   - "Autotile" means: for every tile in a set, look at whether its 4-neighbour
     (N/S/E/W) is also in the set, and pick the frame from the sheet's 3x3
     outer-edge block (and 2x2 inner-corner block when all four neighbours are
     present but a diagonal neighbour is missing) using the origins in
     CLAUDE.md's asset manifest section. Write this as one small reusable
     helper in game/tilemap.ts — you'll call it again for water in step 4.
   - Roads block nothing; they're walkable ground, drawn above grass and below
     houses.

4. Water. One pond per region, positioned so it never touches a house, a road,
   or a door — pick a random rectangle (deterministic from region.name, not
   Math.random()), reject it and retry if it or a 1-tile margin around it
   overlaps anything already placed, give up after ~40 tries and skip the pond
   for that region rather than looping forever. Autotile it with `water-edges`
   using the same helper from step 3. The pond blocks movement.

5. Decoration. Scatter trees (`tree-oak` / `tree-spruce`, picked by hash) and
   flowers (`flowers`, any of its 100 frames, picked by hash) across the
   remaining open grass, deterministic from `region.name` plus each tile's
   coordinates so the same vault always looks the same. Trees are two tiles
   wide and block movement on their base — check a piece's whole footprint is
   clear (including a one-tile gap from roads, water, houses and doors) before
   placing it, the same way furniture placement avoids overlaps. Flowers don't
   block anything.

There is no step 6. Do not add extra biomes, weather, particles, or hand-place
anything. If everything above is solid and you still have time, say so and wait
to be handed more from the appendix — do not invent it.

CUT ORDER IF LATE: this list is already in the order to cut from the bottom.
Steps 1-2 are never optional. If you're behind at 0:40, stop wherever you are —
step 3 (roads) alone is a big visual improvement over flat grass, so it's worth
reaching even if 4 and 5 don't happen.

DONE WHEN: you can walk a region, movement is grid-locked and feels good, houses
show with labels and dressed player character, a door fires the event, and
(time permitting) roads connect the houses and the town has water and trees.
Push to track-b.
```

---

## Track C — Interiors & note reader

```text
Read CLAUDE.md and docs/ASSETS.md first. You are Track C.

Fill in game/scenes/InteriorScene.ts and components/NoteReader.tsx. Both exist as
stubs. game/gridMovement.ts already exists — read it and use it, do not write
your own movement. Do not touch OverworldScene or anything in lib/.

This track holds the single most important moment in the demo: walking up to a
piece of furniture and reading a real note. Everything else is scenery.

1. InteriorScene reads houseId (and, from step 1a on, roomIndex) from its scene
   data (game/config.ts passes houseId in on the bus 'enter-house' event — you
   do not wire that), looks up the House, and renders the room: a floor-and-wall
   tilemap using lib/vault/parse.ts's exported `roomSize(room)` for width,
   height and door position — call it, don't recompute your own. Two different
   room models is how furniture ends up floating in a wall; roomSize() is the
   only one that exists. Stepping on the bottom-centre door calls
   bus.emit('exit-house') — never this.scene.start().

   Furniture placement: each note already carries its own gx/gy from Track A's
   placement pass, in roomSize()'s coordinate space — render it there directly,
   using `FOOTPRINT[note.furniture]` from lib/types.ts for the sprite's real
   width/height. Don't reposition or re-pack notes; if two overlap, that is a
   Track A placement bug, not yours to paper over.

   Create your own player sprite spawned at the door and your own walkability
   predicate for the room, then pass both to GridMovement — see CLAUDE.md's
   registry section, do NOT read Overworld's player or isWalkable off the
   registry. Right after creating your sprite: import `dressPlayer` from
   game/playerSprite.ts and call `dressPlayer(this, this.player)`, same as
   Overworld does, or the character has no clothes on inside houses even
   though it's dressed outside.

1a. Multi-room houses: if `house.rooms.length > 1`, draw a labelled doorway in
   the top wall for each OTHER room (spread evenly along the wall), and walking
   into one does `this.scene.restart({ houseId, roomIndex: <that room's index> })`
   — restarting the SAME scene with new data, never a second scene. Track your
   current room index in scene data (default 0) so restart() can read it back
   in init(). This is the one piece of this track that's safe to drop first if
   you're behind — a house with one visible room is still a complete demo beat.

2. One furniture sprite per note at its gx/gy, by furniture type. Standing on the
   tile in front of it shows a small floating indicator. Space or Enter calls
   bus.emit('open-note', { note }). app/page.tsx is already listening and will
   mount your NoteReader — you do not render React from inside Phaser.

   Optional room dressing: once notes are placed, you may add a handful (3-5)
   of purely decorative furniture pieces — a centred rug, shelves/beds/lamps
   along the walls — picked deterministically from the room's id so it looks
   the same every reload. These are NOT notes and never open anything. Skip
   entirely if you're short on time; an empty room is still correct.
   Non-negotiable if you do this: never place one on a note's own approach
   tile, on the door, or on the player's spawn tile — check against everything
   already placed first, the same way furniture-vs-furniture overlap is
   checked in step 1.

3. components/NoteReader.tsx — a React overlay ABOVE the canvas, never drawn in
   Phaser. It is ALREADY MOUNTED by app/page.tsx; you are filling in the stub,
   not wiring it up. Takes a NoteRef, calls readNote(id) from useVault(), renders:
   - markdown via react-markdown + remark-gfm: headings, lists, task checkboxes,
     code blocks, tables, blockquotes
   - Obsidian embeds ![[image.png]] resolved through readBinary() as object URLs,
     revoked on unmount. IMPORTANT: react-markdown v10's default URL sanitiser
     strips `blob:` URLs silently — no error, the image just renders empty. Pass
     `urlTransform={(url) => url}` to the ReactMarkdown component or every
     embedded image and video is invisible.
   - video the same way, in <video controls>
   - Escape closes it via bus.emit('close-note'), and closing RE-ENABLES Phaser
     keyboard input. Forgetting this is the most common way this feature looks
     broken.

4. Style it to match the art: the UI pack's 9-slice panel frame,
   image-rendering: pixelated. But use a readable modern font for the note body —
   prose in a pixel font is unreadable on a projector, and this panel is what
   judges actually read. You own the only skinned panel in the build — Track D
   is not styling anything, so do not wait for a shared component.

CUT ORDER IF LATE: drop step 2's room-dressing extra first, then step 1a
(multi-room), then step 4. Never compromise 1, 2's note furniture, or 3.

DONE WHEN: from inside a house you walk to furniture, press Space, and read a
real vault note with its images rendering. Push to track-c.
```

---

## Track D — Character, NPCs & the demo machine

```text
Read CLAUDE.md and docs/ASSETS.md first. You are Track D.

Fill in components/CharacterCreator.tsx, game/npc.ts, game/scenes/TitleScene.ts
and game/playerSprite.ts. Do not touch OverworldScene, InteriorScene, NoteReader
or lib/ — public/demo-vault/ is installed by hand before 0:12, same as the art,
you don't write it.

You also own the demo working on the day, so do step 1 before anything else and
re-check it after every merge.

1. THE DEMO MACHINE FIRST. We present by screen-sharing one laptop running it
   locally — there is no deploy. In the first five minutes, confirm `npm run dev`
   serves main on that laptop with no console errors, and re-confirm after every
   merge. A build that only works on someone else's machine, found at 1:25, ends
   the demo.

2. game/playerSprite.ts — export `dressPlayer(scene, base)` where `base` is the
   player Sprite Tracks B and C already created and call — you don't create the
   player sprite, they do, and they already call `dressPlayer(this, this.player)`
   right after. Add child sprites for shoes/pants/shirt/hair using the
   `player-shoes` / `player-pants` / `player-shirt` / `player-hair` texture keys
   from CLAUDE.md — HARDCODE which colour/style file BootScene loaded, there is
   no picker. Every layer shares the base's grid and frame indices, so on
   `scene.events.on('update', ...)` just copy `base.x`, `base.y`, `base.flipX`
   and `base.frame.name` onto each layer sprite every frame — they animate for
   free, you never call `.play()` on them yourself. Set each layer's depth
   fractionally above the base's so they draw on top.

   Do NOT build a customiser of any kind — no shirt colour, no hair style, no
   shoe or trouser options, no palette tinting. The manifest lists 15,360
   combinations; you are shipping one. This feature appears in none of the six
   demo beats — CharacterCreator.tsx below is a menu-screen PREVIEW only, this
   step is what clothes the character IN the actual game.

3. Character preview — components/CharacterCreator.tsx. ALREADY MOUNTED by
   app/page.tsx as <CharacterCreator visible={...} /> — visible is the only prop
   it takes, true until the vault opens. Fill in the stub against that
   signature: a live animated preview of the same fixed outfit as step 2 (CSS
   layered `<img>` elements over the base sprite's walk-down frames is fine
   here — this is a DOM overlay, not Phaser, so it does not need to share code
   with dressPlayer). Nothing to interact with beyond however the user proceeds
   past it. Do not wire it up and do not edit app/page.tsx.

4. game/scenes/TitleScene.ts already exists with its world-ready polling loop
   written by the foundation commit — do not touch that `update()` method. Fill
   in `create()` only: whatever you want shown while waiting for a vault (a
   title, a hint to click "Open your vault"). Plain HTML-quality text is fine,
   see the no-UI-skin note below.

5. NPCs in game/npc.ts. Export spawnNpcs(scene, region) — OverworldScene already
   calls it and you may not edit that file, so everything you do happens inside
   this one function. Spawn EXACTLY TWO NPCs that wander the grid with a
   random walk respecting the same collision predicate. Give each NPC a fixed
   id (e.g. 'farmer_bob'). NPC sheets are 6 columns, not the player's 9 — see
   CLAUDE.md's Texture keys section, you need your own `<npcId>-<anim>`
   animations, the shared `walk-down` etc. only work on the `player` texture.
   Walk up to one, press Space, and call bus.emit('talk-npc', { npcId, line })
   — app/page.tsx already listens and renders the dialogue box using `line`
   directly. Never render UI inside Phaser.

6. Dialogue is a HARDCODED LINE, not a model call — there is no AI here and no
   API route. Keep a small id -> string map inside game/npc.ts, at least one
   line per NPC, in-world village flavour, e.g. "Heard you've been buried in
   your notes again." Look the line up by npcId and put it straight in the
   emit above. No network call, no key, nothing that can fail on venue wifi.

There is no step 7. Do not skin the title screen, the dialogue box or the vault
picker with the UI pack — Track C owns the one panel that gets styled today.
Plain, legible HTML is the correct finish for everything you own.

CUT ORDER IF LATE: step 3 (the CSS preview) is the first thing to drop — the
game character (step 2) is what's actually on screen for the whole demo and
matters far more than the title-screen preview. If you are behind at 0:40, ship
1, 2 and 4, drop to one NPC in 5, with 6 covering just that one, and skip 3.

DONE WHEN: main runs on the demo laptop, your character walks around DRESSED
(not the bare base sprite) in both Overworld and Interior, and both NPCs each
say their own hardcoded line when you talk to them. Push to track-d.
```

---

## Appendix — the stretch list

**Nobody pastes this at 0:14.** It is here so the work is written down, not so it gets
built. Track A hands a single item to a single track, by name, only if that track reports
its own prompt finished before **0:40**. One item at a time. A track that receives one and
then misses the freeze has cost the demo more than the item was worth.

Everything below was cut because it appears in none of the six golden-path beats
(`REHEARSAL.md`) and the parallel window is 53 minutes.

**Promoted out of this appendix on 20 September, after a rehearsal that showed a flat green
map read as broken rather than deliberate:** meadow-only autotiling (roads and water), tree/
flower decoration, and multi-room houses are now base scope — see Track B steps 3-5 and Track
C step 1a. This made the tracks meaningfully heavier; if the merge runs long on the day, these
three are where a track should stop first, in the order their own CUT ORDER lines describe.

**B — the other four biomes.** Load the five hand-drawn terrain tilesets (one per BiomeId)
per the per-biome descriptor in `ASSETS.md` and pick by `region.biome`. Each sheet has its
own size and edge-index origin, so use a per-biome descriptor rather than one shared index
table. No shader, just five images. The demo vault only ever exercises meadow.

**B — season overlay.** A tint plus a particle layer (snow, leaves, rain, fireflies). Cheap,
and reads instantly on a projector.

**C — note editing.** Write changes back to the .md file on disk via the same handle
`readNote` resolved, using `mode: 'readwrite'` on the directory picker. Deliberately NOT
promoted to base scope — Chrome's write-permission prompt is a bigger unknown on the demo
laptop than anything else in this list, and a denied write could cost the read path too.
Flagged for a cold test in rehearsal before it goes anywhere near base scope.

**D — the real character customiser.** Per-layer pickers over all of it: 6 hair styles x 5
hair colours x 8 shoes x 8 pants x 8 shirts, the full 15,360 in `ASSETS.md`. The shipped
build hardcodes all of it to one fixed outfit — not even a shirt colour. This is the
largest single item on the list; treat it as unreachable on the day.

**D — full UI skin.** The UI pack's panels and buttons on the dialogue box, vault picker and
title screen, so it reads as one game rather than a web app with a canvas in it.

**D — AI-generated NPC dialogue.** Cut on the 19th as too much live-demo risk for beat 6: an
`app/api/npc/route.ts` calling `@anthropic-ai/sdk` (`claude-haiku-4-5-20251001`, max_tokens 100)
with up to 12 real note titles plus the region name, returning a line that references what the
person has actually been writing about, with a canned-line fallback on any failure. Needs
`@anthropic-ai/sdk` added to package.json (not installed by Prompt 0 today) and an API key
pasted into `.env.local` on the demo laptop. Treat as unreachable unless handed out very early —
it needs a working route, a key, and live wifi, none of which get tested before the merge.

**Added post-freeze, 20 September — treat every item below as an unratified contract change,
not just a feature.** Four of these five touch `lib/types.ts` and/or `game/bus.ts`, both frozen
at 13:00 on the 20th. That means none of them can be handed out cold the way the items above
can: whichever track receives one has to get the type/event addition agreed with Track A
*before* touching code, the same as any other contract change per `CLAUDE.md`. Don't skip that
step just because it's already written down here — "written down" is not "ratified."

**D — NPC quiz mode.** Extends the AI-dialogue item above: `app/api/npc/route.ts` returns a
question drawn from the player's own note titles instead of a flavour line, and the NPC waits
for an answer before handing over its line. Needs a new `bus` event pair (e.g.
`npc-quiz` / `quiz-answer`) alongside the existing `talk-npc`/`open-note` pair, and a small
React overlay to take the answer — that overlay doesn't exist yet and would need a file added
to Track D's ownership row. Inherits every risk of the AI-dialogue item above (route, key,
live wifi) plus new UI surface; treat as strictly later-stage than that item, not a
replacement for it.

**C — customizable interior.** Let the player drag furniture within a room in
`InteriorScene.ts`. On its own this is a Track C-only change. It only becomes a contract
change if a moved piece has to survive a reload — that means overriding the `gx`/`gy` Track A
already computed on `NoteRef`, which is a `lib/types.ts` conversation, not a silent addition.
Cold-test: does an unsaved layout that resets on reopen actually read as a bug on stage, or is
"resets every time you re-enter" an acceptable demo behaviour? Decide that before promising the
persisted version.

**A + C — credit economy (notes earn credits, credits buy furniture).** Track A side: detect
new notes as the vault is walked and derive a credit balance from the count — lives in
`lib/vault/*`, published through a new registry key (e.g. `game.registry.set('credits', n)`;
new keys aren't frozen, only the ones already listed under "Shared game state" are). Track C
side: a shop UI to spend the balance and place bought furniture in a room — no existing
component owns this, so it needs a new file added to Track C's ownership row
(`components/FurnitureShop.tsx` or similar) rather than being folded into `NoteReader.tsx`.
Watch for double-counting: decide once, with Track A, whether "new note" means "not in the
WorldModel at last parse" or something that survives across sessions — there's no database, so
the honest answer may be "resets every reload," same caveat as the interior item above.

**A + C — bookshelf books.** Files stop being one-furniture-per-note; instead notes in a room
collapse onto a `shelf` piece, and each note becomes a book with the title on its spine.
Clicking the shelf zooms in to show its books; clicking a book fires the existing `open-note`
event unchanged. This is the heaviest of the five because it changes the vault→world mapping
itself, not just what sits on top of it: `FurnitureId`/`NoteRef` and the folder-to-world
mapping rules are Track A's (`lib/types.ts`, `lib/vault/parse.ts`), the zoomed shelf view and
book sprites are Track C's (`InteriorScene.ts`). Do not let one track guess the other's half —
agree the shape of the new type (something like `Room.shelves: { id, notes: NoteRef[] }[]`)
before either side writes code against it.

---

## When a prompt goes sideways

Don't re-explain the goal — that almost never works. **Name the exact file and the exact
existing function it should be using.** Nearly every derailment is an agent reinventing
something another track already built, and one sentence pointing at the real file fixes it.

Recovery phrases that work, collected during rehearsal:

> `game/gridMovement.ts` already exists and exports the GridMovement class. Read it and use
> it instead of writing movement code.

> That file belongs to another track. Revert your changes to it and work around the problem
> in a file you own.

> Stop. Check CLAUDE.md — the type you want is already defined in lib/types.ts.

Add to this list on Saturday.
