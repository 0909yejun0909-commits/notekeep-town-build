# Asset manifest

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

<!-- ===================== END OF PASTE ===================== -->

**STOP HERE when pasting into Prompt 0.** Everything above this line goes into `CLAUDE.md`.
Everything below documents scope that was cut on 19 September and must NOT be pasted — it is
~60 lines of frame indices for features nobody is building, and it would sit in all four
agents' context for the whole ninety minutes.

---

# Appendix — manifest for cut scope

Hand a track one of these only at the 0:40 call, per the appendix rules in `PROMPTS.md`.

## Edge sets

The convention across this pack: a transition is a **3x3 block of outer edges plus a 2x2 block
of inner corners**. The number given is the index of the block's top-left tile.

```text
FILE: public/assets/terrain/grass_meadow.png   (and grass_forest.png — identical layout)
  dimensions: 256x160,  16 cols x 10 rows,  index = row*16 + col

  grass over a transparent hole     3x3 origin   0   (centre tile 17 is empty)
    its inner corners               2x2 origin  48
  grass with a dirt lip             3x3 origin   3   (centre tile 20 is empty)
    its inner corners               2x2 origin  51
  grass -> PATH                     3x3 origin  80   (centre tile 97 is solid sand)
    its inner corners               2x2 origin 128
  grass with a stone lip            3x3 origin  83   (centre tile 100 is empty)
    its inner corners               2x2 origin 131

  Decoration (non-colliding, scatter on grass): tiles 149, 150, 151
  Columns 8-15 are log-wall and stone-wall blocks. Not used.

  Grass_Tiles_1..4 are the same layout in four colours — swapping the image keeps every
  index valid. 1 = meadow #3E8948, 2 = forest #33984B, 3 = olive #7C963C, 4 = teal #3F886C.

FILE: public/assets/terrain/water.png     48x80, 3 cols x 5 rows
  3x3 outer at origin 0, centre tile 4 is solid water, inner corners 9,10,12,13.
  NOTE: the grass colour is baked into these edge tiles, so water only borders grass.

FILE: public/assets/terrain/cobble.png    48x80, same 3x3 + 2x2 shape, sand baked into edges
FILE: public/assets/terrain/desert.png    48x80, same shape, sand baked into edges
FILE: public/assets/terrain/snow.png      128x80, 8 cols x 5 rows
  3x3 origin 0 (plain ice lip), 3x3 origin 3 (dirt lip), inner corners 24 and 27, fill 37.
FILE: public/assets/terrain/volcano.png   464x144, 29 cols x 9 rows
  rock 3x3 origin 1, lava 3x3 origin 181 (centre 211).
FILE: public/assets/terrain/cliff.png     224x96, 14 cols x 6 rows
```

**Don't wire a water animation.** In this version of the pack every water `_Anim` sheet (and
`Fountain_Anim`) is just N identical copies of the still frame — verified byte for byte. The
water does not move. `Chest_Anim` and `Campfire_Anim` do animate.

---

## DECIDED — no palette-swap shader

`BiomeId` is `meadow | forest | desert | volcano | snow`, and there is a real, hand-drawn
tileset for every one of them (rows above). Five images beats a shader — faster to build and
better looking. `game/paletteSwap.ts` is cut; it's out of the file-ownership table in
`PROMPTS.md` and Track B gets that time back.

Per-biome mapping — Track B's `game/tilemap.ts` picks one of these by `region.biome`:

```text
  meadow   terrain/grass_meadow.png   +  fill_grass_meadow.png
  forest   terrain/grass_forest.png   +  fill_grass_forest.png
  desert   terrain/desert.png         +  desert_sand.png tile 6
  volcano  terrain/volcano.png        (rock fill 31, lava 211)
  snow     terrain/snow.png           (fill 37)
```

The five sheets have different sizes and different edge-set origins, so `tilemap.ts` needs a
small per-biome descriptor instead of one shared index table. All the numbers it needs are in
the Terrain section above.
