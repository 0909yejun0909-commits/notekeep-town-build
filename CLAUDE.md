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

> **Status: FILLED IN — measured from the actual PNGs on 17 September 2026.**
> Every number below was read out of the file, not eyeballed. The one section still open is
> marked OPEN at the bottom.

This file gets pasted at the end of the shared context block in every Sunday prompt.

**Why it matters more than it looks like it should:** four Fable sessions will each write code
that slices the same spritesheets. If they each guess a different frame layout, the characters
walk sideways, furniture renders as fence posts, and you lose half your remaining build at 0:50
to something nobody can debug under pressure. Every number in here is a bug that can't happen.

**Rule for Sunday: never let Fable guess a frame index. If a number isn't in this file, stop
and add it.**

---

## Where the art lives

Kenmi "Cute Fantasy" packs, unzipped to `~/kenmi-art/` (Cute_Fantasy, _UI, _Desert, _Volcano,
_ShroomLands, _Christmass, _Characters, _Dungeons, _MilitaryCamp, Old_Sprites,
Player_Aseprite_Files).

**Licence: commercial use and modification allowed, redistribution is not — even modified.**
So `public/assets/` never gets committed. Sunday's repo stays private *and* gitignores it.
Credit "Kenmi — kenmi-art.itch.io" in the project report.

## Getting the art into Sunday's repo

**Track A runs this by hand at ~0:08, after Prompt 0 finishes and before pushing `main`.** No
agent knows about it. It lives as a runnable file at [`scripts/install-assets.sh`](../scripts/install-assets.sh)
— don't copy it out of this markdown on the day, just run it with the destination as its one
argument:

```bash
~/"Projects/Claude Build Day"/scripts/install-assets.sh public/assets
```

It copies 100 files, 1.6 MB, and is the only step that touches the art. Set `KENMI=` if the
packs live somewhere else. Tested as written — if a `cp` fails it stops immediately rather
than half-copying. The copy below is what that file contains, kept here because this manifest
gets pasted into Prompt 0 whole.

```bash
#!/usr/bin/env bash
set -euo pipefail
KENMI="${KENMI:-$HOME/kenmi-art}"
CF="$KENMI/Cute_Fantasy"
DEST="${1:-public/assets}"

mkdir -p "$DEST"/{terrain,buildings,interior,furniture,character/hair,character/shirt,character/pants,character/shoes,npc,ui}

cp "$CF/Tiles/Grass/Grass_Tiles_1.png"          "$DEST/terrain/grass_meadow.png"
cp "$CF/Tiles/Grass/Grass_Tiles_2.png"          "$DEST/terrain/grass_forest.png"
cp "$CF/Tiles/Grass/Grass_1_Middle.png"         "$DEST/terrain/fill_grass_meadow.png"
cp "$CF/Tiles/Grass/Grass_2_Middle.png"         "$DEST/terrain/fill_grass_forest.png"
cp "$CF/Tiles/Grass/Path_Middle.png"            "$DEST/terrain/fill_path.png"
cp "$CF/Tiles/Grass/Path_Decoration.png"        "$DEST/terrain/path_decor.png"
cp "$CF/Tiles/Water/Water_Middle.png"           "$DEST/terrain/fill_water.png"
cp "$CF/Tiles/Water/Water_Tile_1.png"           "$DEST/terrain/water.png"
cp "$CF/Tiles/Cobble_Road/Cobble_Road_1.png"    "$DEST/terrain/cobble.png"
cp "$CF/Tiles/Cliff/Stone_Cliff_1_Tile.png"     "$DEST/terrain/cliff.png"
cp "$CF/Trees/Medium_Oak_Tree.png"              "$DEST/terrain/tree_oak.png"      # 96x48, 3 frames of 32x48
cp "$CF/Trees/Medium_Spruce_Tree.png"           "$DEST/terrain/tree_spruce.png"   # 96x48, 3 frames of 32x48
cp "$CF/Outdoor decoration/Flowers.png"         "$DEST/terrain/flowers.png"       # 160x160, 100 frames of 16x16
cp "$KENMI/Cute_Fantasy_Desert/Tiles/Desert_Grass.png"               "$DEST/terrain/desert.png"
cp "$KENMI/Cute_Fantasy_Desert/Tiles/Desert_Beach_Tiles_1.png"       "$DEST/terrain/desert_sand.png"
cp "$KENMI/Cute_Fantasy_Volcano/Tiles/Volcano_Tiles.png"             "$DEST/terrain/volcano.png"
cp "$KENMI/Cute_Fantasy_Christmass/Decorations/Christmass_Grass.png" "$DEST/terrain/snow.png"

H="$CF/Buildings/Buildings/Houses/Wood"
# Every shape ships in all 9 wall/roof color combos; wall/roof color is picked independently
# of shape (lib/houseCatalog.ts), so all 45 are installed, not just each shape's original combo.
for shape in 1 2 3 4 5; do
  for wc in Base Green Red; do
    for rc in Black Blue Red; do
      wl=$(echo "$wc" | tr '[:upper:]' '[:lower:]')
      rl=$(echo "$rc" | tr '[:upper:]' '[:lower:]')
      cp "$H/House_${shape}_Wood_${wc}_${rc}.png" "$DEST/buildings/house_$((shape - 1))_${wl}_${rl}.png"
    done
  done
done

cp "$CF/Buildings/Houses_Interiors/Wood_Floor_Tiles.png" "$DEST/interior/floor.png"
cp "$CF/Buildings/Houses_Interiors/Interior_Walls.png"   "$DEST/interior/walls.png"
cp "$CF/Buildings/House_Decor/Doors.png"                 "$DEST/interior/doors.png"

D="$CF/Buildings/House_Decor"
cp "$D/Tables.png"         "$DEST/furniture/tables.png"
cp "$D/BookShelves.png"    "$DEST/furniture/bookshelves.png"
cp "$D/Beds.png"           "$DEST/furniture/beds.png"
cp "$D/Chest_Anim.png"     "$DEST/furniture/chest.png"
cp "$D/House_Plants.png"   "$DEST/furniture/plants.png"
cp "$D/Indoor_Decor.png"   "$DEST/furniture/decor.png"
cp "$D/Standing_Lamps.png" "$DEST/furniture/lamps.png"
cp "$D/Carpets.png"        "$DEST/furniture/carpets.png"

P="$CF/Player"
cp "$P/Player_Base/Player_Base_animations.png" "$DEST/character/base.png"
cp "$P/Hands/Hands_1_Bare.png"                 "$DEST/character/hands.png"
for n in 1 2 3 4 5 6; do
  for c in Black Blonde Brown Ginger Grey; do
    cp "$P/Head/Hair_$n/Hair_${n}_$c.png" "$DEST/character/hair/${n}_$(echo "$c" | tr '[:upper:]' '[:lower:]').png"
  done
done
for c in Black Blue Brown Green Orange Pink Purple Red; do
  l=$(echo "$c" | tr '[:upper:]' '[:lower:]')
  cp "$P/Chest/OG_Shirt/Shirt_1_$c.png" "$DEST/character/shirt/$l.png"
  cp "$P/Legs/OG_Pants/Pants_1_$c.png"  "$DEST/character/pants/$l.png"
  cp "$P/Feet/Shoes_1_$c.png"           "$DEST/character/shoes/$l.png"
done

for n in Farmer_Bob Lumberjack_Jack Miner_Mike Chef_Chloe Bartender_Katy Bartender_Bruno Fisherman_Fin Farmer_Buba; do
  cp "$CF/NPCs (Premade)/$n.png" "$DEST/npc/$(echo "$n" | tr '[:upper:]' '[:lower:]').png"
done

cp "$KENMI/Cute_Fantasy_UI/UI/Book_UI.png"             "$DEST/ui/book.png"
cp "$KENMI/Cute_Fantasy_UI/UI/UI_Frames.png"           "$DEST/ui/frames.png"
cp "$KENMI/Cute_Fantasy_UI/Fonts/CuteFantasy-5x9.ttf"  "$DEST/ui/cute-fantasy.ttf"

echo "copied $(find "$DEST" -type f | wc -l | tr -d ' ') files into $DEST"
```

---

## Global

```text
TILE SIZE:    16x16
GAME ZOOM:    3 (integer only)
PLAYER FRAME: 64x64 (the drawn character is ~13x18 inside it — see Character)
```

Tile indices in this file are **row-major**: `index = row * columns + column`, columns being
the sheet width in tiles. Pixel rects are `x,y,w,h` from the sheet's top-left.

---

## Character

`public/assets/character/base.png` — and every clothing layer — share one grid. Verified by
compositing base + shoes + pants + shirt + hair: the layers line up frame for frame.

```text
FILE: public/assets/character/base.png
  dimensions:  576x3584
  frame size:  64x64
  grid:        9 columns x 56 rows   (index = row*9 + col)

  Rows we use (0-indexed) — VERIFIED, do not guess the rest:
    row 0: idle down     frames 0-5   (6 frames)
    row 1: idle RIGHT    frames 0-5
    row 2: idle up       frames 0-5
    row 3: walk down     frames 0-5
    row 4: walk RIGHT    frames 0-5
    row 5: walk up       frames 0-5

  There is NO left row. Left = row 1/4 with flipX = true.
  Facing order inside every group of three is down, right, up.

  Frame rate: 10 fps (the Aseprite source is 100 ms per frame).

  Rows 6-55 are tool and action animations (axe, hoe, fishing, attack, roll, jump,
  climb, death, horse). We do not use them. Do not guess which is which.

  Placement inside the 64x64 frame (measured on row 0, frame 0):
    drawn pixels: x 25-37, y 23-40  (13 wide, 18 tall, shadow included)
    the feet/shadow sit at y=40, so setOrigin(0.5, 0.64) puts the feet on a tile.
```

### Customiser layers

Every file below is **576x3584, same 9x56 grid, same frame indices as the base**. Draw them in
this order on top of the base: shoes -> pants -> shirt -> hair (-> hands, optional).

```text
public/assets/character/shoes/<colour>.png   8 colours
public/assets/character/pants/<colour>.png   8 colours
public/assets/character/shirt/<colour>.png   8 colours
  colours: black, blue, brown, green, orange, pink, purple, red

public/assets/character/hair/<style>_<colour>.png
  styles: 1-6     colours: black, blonde, brown, ginger, grey    (30 files)

public/assets/character/hands.png            bare hands overlay, same grid
```

That is 6 x 5 x 8 x 8 x 8 = 15,360 combinations. **We are shipping six.** Shoes, pants and
hair are hardcoded to one look; only the shirt colour is selectable. The numbers above are
here so the layers composite correctly, not as a menu — see Track D, step 2.

---

## NPCs

`public/assets/npc/*.png` — 8 premade NPCs, **same 64x64 frame and same first six rows as the
player** (verified on farmer_bob and bartender_katy).

```text
  frame size: 64x64,  6 columns
  row 0 idle down / 1 idle right / 2 idle up / 3 walk down / 4 walk right / 5 walk up
  rows 6+ are job animations, sheet height varies per NPC, ignore them.

  FILE                                  dimensions
  public/assets/npc/farmer_bob.png      384x832
  public/assets/npc/farmer_buba.png     384x832
  public/assets/npc/lumberjack_jack.png 384x640
  public/assets/npc/miner_mike.png      384x640
  public/assets/npc/chef_chloe.png      384x448
  public/assets/npc/bartender_katy.png  384x448
  public/assets/npc/bartender_bruno.png 384x448
  public/assets/npc/fisherman_fin.png   576x832
```

**Demo uses exactly two: `farmer_bob` and `bartender_katy`** (the two verified above). Track D
should not pick a different pair — those two are the ones confirmed to match the player's
frame layout.

---

## Terrain and biomes

**Track B builds meadow only.** There is real art for all five biomes, but four of them were
cut on the 19th — their sheets and per-biome mapping are in the appendix below the paste
boundary. The only fill you need today is `fill_grass_meadow.png`.

### Ground fills (one solid tile each, just repeat it)

```text
  meadow grass   public/assets/terrain/fill_grass_meadow.png   16x16 solid  #3E8948
  forest grass   public/assets/terrain/fill_grass_forest.png   16x16 solid  #33984B
  path / sand    public/assets/terrain/fill_path.png           16x16 solid  #E4A672
  water          public/assets/terrain/fill_water.png          16x16 solid  #0095E9
  desert scrub   terrain/desert.png        tile 11             solid        #7D8542
  desert sand    terrain/desert_sand.png   tile 6              solid        #E4A672
  volcano rock   terrain/volcano.png       tiles 30,31,32,59,60,61 (any)    #625565
  volcano lava   terrain/volcano.png       tile 211            solid        #FB6B1D
  snow / ice     terrain/snow.png          tile 37             solid        #94F3F4
```

### Edge sets — roads and water only, meadow biome

Autotiling is back in base scope for grass/road/water (see PROMPTS.md's Track B). The other
four biomes are still cut — their sheets and per-biome mapping are in the appendix below the
paste boundary, in case a stretch item is handed out.

The convention across this pack: a transition is a **3x3 block of outer edges plus a 2x2
block of inner corners**. The number given is the index of the block's top-left tile.

```text
FILE: public/assets/terrain/grass_meadow.png   (texture key: grass-edges)
  dimensions: 256x160,  16 cols x 10 rows,  index = row*16 + col

  grass -> PATH (use this one for the sand lip under roads)
    3x3 origin  80   (centre tile 97 is solid sand)
    2x2 inner corners  128

FILE: public/assets/terrain/water.png   (texture key: water-edges)
  48x80, 3 cols x 5 rows
  3x3 outer at origin 0, centre tile 4 is solid water, inner corners 9,10,12,13.

FILE: public/assets/terrain/cobble.png   (texture key: cobble-edges)
  48x80, same 3x3 + 2x2 shape as water.png: outer origin 0, inner corners 9,10,12,13.
```

**Don't wire a water animation.** In this version of the pack every water `_Anim` sheet is
just N identical copies of the still frame — verified byte for byte. The water does not move.

### Decoration — trees and flowers

```text
FILE: public/assets/terrain/tree_oak.png     (texture key: tree-oak)
FILE: public/assets/terrain/tree_spruce.png  (texture key: tree-spruce)
  Both: 96x48, frame size 32x48, 3 cols. Frame 0 is a stump/sapling — don't use
  it. Frames 1 and 2 are full trees, visually interchangeable, pick either.
  setOrigin(0, 1) at the base so the trunk sits on the ground tile; footprint
  for collision is 2 tiles wide x 2 tall (the canopy overhangs the tile behind).

FILE: public/assets/terrain/flowers.png      (texture key: flowers)
  160x160, 16x16 frames, 10 cols x 10 rows = 100 frames, all decorative and all
  non-colliding. Any frame index 0-99 is a valid flower — pick by hash, no
  frame is special.
```

---

## Buildings

Separate files, not a spritesheet. Each of the 5 shapes (`variant` 0-4) ships in all 9
wall/roof color combos — color is picked independently of shape (`lib/houseCatalog.ts`) and
never changes a shape's footprint or door tile, only which of the 45 files loads. Filename is
`house_{variant}_{wallColor}_{roofColor}.png`, wallColor one of `base`/`green`/`red`, roofColor
one of `black`/`blue`/`red`. Door tile is given in tiles from the sprite's top-left; it is the
**lower** of the two door tiles, so the player walks onto the tile directly below it. Dimensions
and door tile are the same across every color combo of a given shape — only listing one row
each below.

```text
  public/assets/buildings/house_0_*.png    96x128    6 x 8 tiles    door tile (2, 6)
  public/assets/buildings/house_1_*.png   144x128    9 x 8 tiles    door tile (2, 6)
  public/assets/buildings/house_2_*.png   144x128    9 x 8 tiles    door tile (5, 6)
  public/assets/buildings/house_3_*.png   112x96     7 x 6 tiles    door tile (2, 4)
  public/assets/buildings/house_4_*.png   192x128   12 x 8 tiles    door tile (5, 6)

  Every house has one empty tile row at the bottom (shadow space), so the building's
  solid rows end at the door row. Collide everything except the entry tile below the door.
```

---

## Interior

```text
FILE: public/assets/interior/floor.png    128x128, 8 cols x 8 rows, index = row*8 + col
  Every tile is a seamless fill — pick one and repeat it. Useful ones:
    0  dark wood brick     2  light wood brick    4  herringbone     6  diagonal
    16 vertical plank     32  blue stone tile    34  red diamond    48  wood plank
    50 grey plank         52  pink plank         54  black/cream checker

FILE: public/assets/interior/walls.png    224x96, 14 cols x 6 rows, index = row*14 + col
  Walls are 3 tiles tall — top, middle, base — read downward from row 3.
    plaster wall     42 / 56 / 70   (3 tiles wide: 42,43,44 across)
    wood plank wall  45 / 59 / 73
    stone wall       46 / 60 / 74
    brick wall       47 / 61 / 75
    plaster + posts  48..50 / 62..64 / 76..78
  Rows 0-2 are hollow window and door frames to overlay on a wall.
```

---

## Furniture — the eight FurnitureId values

These sprites are not tile-aligned, so they are given as **pixel rects**, which is also the
easiest thing to use:

```js
this.textures.get('furn_bed').add('bed', 0, x, y, w, h);   // then add.image(px, py, 'furn_bed', 'bed')
```

```text
  FurnitureId   file                                  rect x,y,w,h     footprint
  desk          public/assets/furniture/tables.png       72, 8,32,48    2x3 tiles
  shelf         public/assets/furniture/bookshelves.png  16, 0,32,32    2x2
  bed           public/assets/furniture/beds.png          0, 0,32,32    2x2
  chest         public/assets/furniture/chest.png         0, 0,16,16    1x1
  plant         public/assets/furniture/plants.png       32, 0,16,32    1x2
  painting      public/assets/furniture/decor.png        48,32,16,16    1x1
  lamp          public/assets/furniture/lamps.png         0, 0,16,32    1x2
  rug           public/assets/furniture/carpets.png       0, 0,48,48    3x3
```

All eight were cropped at exactly these rects and eyeballed — they are complete sprites, not
clipped. Colour variants, if anyone wants them:

```text
  beds.png        next colour is +2 rows: blue at y=32, green y=64, pink y=96,
                  yellow y=128, red y=160 (same x, same 32x32)
  carpets.png     next colour is +5 rows: cyan rug at 0,80,48,48
  lamps.png       shades across the row: blue x=32, green x=64, pink x=96, yellow x=128
  plants.png      other plants across the row at x = 0, 16, 32, 48, 64, 80, 96 (all 16x32)
  chest.png       6 frames, 16px apart: frame 0 closed .. frame 5 open. It really animates.
```

Painting note: `decor.png` is `Indoor_Decor.png`, 6 cols wide. The framed picture is at tile
(col 3, row 2) = index 15 = rect 48,32,16,16.

---

## UI

All user-facing UI is React over the canvas, so the useful things here are a font and one
panel image.

```text
FONT:  public/assets/ui/cute-fantasy.ttf   (Kenmi's CuteFantasy-5x9)
       @font-face it and set it on the whole overlay. Single biggest visual win for
       zero effort. Render at integer multiples of 9px.

PANEL: public/assets/ui/book.png   1680x432
       open-book panel at rect 8,0,224,144 — use it as the note reader background
       (CSS: border-image, or just an <img> behind the text).
       A second parchment book is at rect 248,0,224,144.

FRAMES: public/assets/ui/frames.png  1296x336, a grid of 3x3 panel frames in 10 colours,
       three tiles per frame. Only needed if the book panel doesn't fit.
```

---

## Master palette

Pulled straight from the PNGs, so these match the art exactly.

```text
  grass meadow  #3E8948      grass forest  #33984B      grass olive  #7C963C
  grass teal    #3F886C      grass dark    #265C42      (edge shade)
  sand / path   #E4A672      dirt          #6D483B      dirt dark    #3F2832
  water         #0095E9      water light   #00CDF9
  stone         #525F7A      stone light   #828FAB      stone dark   #262B44
  desert scrub  #7D8542      volcano rock  #625565      lava         #FB6B1D
  snow / ice    #94F3F4      shroom blue   #357B9C      shroom purple #825E80
  wood floor    #91533B      wood light    #B86F50
```

---

---

