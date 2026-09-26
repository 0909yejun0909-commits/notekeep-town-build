#!/usr/bin/env bash
set -euo pipefail
KENMI="${KENMI:-$HOME/kenmi-art}"
CF="$KENMI/Cute_Fantasy"
DEST="${1:-public/assets}"

# Two steps below need Python 3 with Pillow. On Windows `python3` is often missing or is the
# Microsoft Store placeholder, so try the usual names, and if none works skip those two steps
# instead of stopping: everything after them (the overworld scenery) would otherwise never be
# copied, and the game draws every missing sprite as a black box.
PY=""
for cand in python3 python "py -3"; do
  if $cand -c "import PIL" >/dev/null 2>&1; then PY="$cand"; break; fi
done
if [ -z "$PY" ]; then
  echo "warning: no Python 3 with Pillow found (install Python 3, then: pip install Pillow)." >&2
  echo "         Copying everything else; Stone houses keep Kenmi's plaster gable and the title menu's panel art is skipped." >&2
fi

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
cp "$KENMI/Cute_Fantasy_Desert/Tiles/Desert_Grass.png"               "$DEST/terrain/desert.png"
cp "$KENMI/Cute_Fantasy_Desert/Tiles/Desert_Beach_Tiles_1.png"       "$DEST/terrain/desert_sand.png"
cp "$KENMI/Cute_Fantasy_Volcano/Tiles/Volcano_Tiles.png"             "$DEST/terrain/volcano.png"
cp "$KENMI/Cute_Fantasy_Christmass/Decorations/Christmass_Grass.png" "$DEST/terrain/snow.png"
cp "$CF/Trees/Medium_Oak_Tree.png"              "$DEST/terrain/tree_oak.png"
cp "$CF/Trees/Medium_Spruce_Tree.png"           "$DEST/terrain/tree_spruce.png"
cp "$CF/Outdoor decoration/Flowers.png"         "$DEST/terrain/flowers.png"

H="$CF/Buildings/Buildings/Houses"
RECOLOR="$(cd "$(dirname "$0")" && pwd)/recolor-stone-houses.py"
# Every shape ships in Wood, Stone, and Limestone; material/wall/roof color are all picked
# independently (lib/houseCatalog.ts), so every combo Kenmi actually ships gets installed, not
# just each shape's original fixed combo. Coverage isn't uniform, though — Wood ships all 9
# wall/roof combos per shape, but Stone and Limestone are both single-tone materials with no
# separately-colorable wall area, so only the base wall look is installed for each (all 3 roof
# colors). Stone's Base art still ships with a colored plaster gable from Kenmi (a half-timber
# look) — recolor-stone-houses.py recolors it to match the stone foundation so Stone renders as
# a single uniform material. See lib/houseCatalog.ts's availableWallColors for the same rule the
# game enforces at runtime.
for shape in 1 2 3 4 5; do
  idx=$((shape - 1))

  for wc in Base Green Red; do
    for rc in Black Blue Red; do
      wl=$(echo "$wc" | tr '[:upper:]' '[:lower:]')
      rl=$(echo "$rc" | tr '[:upper:]' '[:lower:]')
      cp "$H/Wood/House_${shape}_Wood_${wc}_${rc}.png" "$DEST/buildings/house_${idx}_wood_${wl}_${rl}.png"
    done
  done

  for rc in Black Blue Red; do
    rl=$(echo "$rc" | tr '[:upper:]' '[:lower:]')
    src="$H/Stone/House_${shape}_Stone_Base_${rc}.png"
    # House_2_Stone_Base_Black.png ships from Kenmi with a typo'd filename (missing the
    # underscore before "png") — the only mis-named file in the whole pack.
    if [ ! -f "$src" ]; then src="$H/Stone/House_${shape}_Stone_Base_${rc}png.png"; fi
    dst="$DEST/buildings/house_${idx}_stone_base_${rl}.png"
    cp "$src" "$dst"
    if [ -n "$PY" ]; then $PY "$RECOLOR" "$H/Stone" "$dst" "$shape" "$rc"; fi
  done

  for rc in Black Blue Red; do
    rl=$(echo "$rc" | tr '[:upper:]' '[:lower:]')
    cp "$H/Limestone/House_${shape}_Limestone_Base_${rc}.png" "$DEST/buildings/house_${idx}_limestone_base_${rl}.png"
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
if [ -n "$PY" ]; then $PY "$(cd "$(dirname "$0")" && pwd)/crop-ui.py" "$KENMI/Cute_Fantasy_UI/UI" "$DEST/ui"; fi

# Overworld scenery (game/sceneryAssets.ts loads these; frame layouts are documented there).
S="$DEST/scenery"
mkdir -p "$S"
OD="$CF/Outdoor decoration"
AN="$OD/Outdoor_Decor_Animations"
for n in 2 3 4; do
  cp "$CF/Tiles/Grass/Grass_Tiles_$n.png"  "$S/grass$n.png"
  cp "$CF/Tiles/Grass/Grass_${n}_Middle.png" "$S/fill_grass$n.png"
done
cp "$CF/Tiles/Water/Water_Tile_1_Anim.png" "$S/water_anim.png"
cp "$AN/Water_Decor_Animations/Water_Plants/Lillypad_Green_1_Anim.png"  "$S/lily_1.png"
cp "$AN/Water_Decor_Animations/Water_Plants/Lillypad_Green_2_Anim.png"  "$S/lily_2.png"
cp "$AN/Water_Decor_Animations/Water_Plants/Lillypad_Purple_1_Anim.png" "$S/lily_3.png"
cp "$AN/Water_Decor_Animations/Water_Plants/Lillypad_Red_1_Anim.png"    "$S/lily_4.png"
cp "$AN/Water_Decor_Animations/Water_Plants/Cattail_1_Anim.png"         "$S/cattail_1.png"
cp "$AN/Water_Decor_Animations/Water_Plants/Cattail_2_Anim.png"         "$S/cattail_2.png"
cp "$AN/Water_Decor_Animations/Water_Rocks/Rock_3_Water_Anim.png"       "$S/water_rock_1.png"
cp "$AN/Water_Decor_Animations/Water_Rocks/Rock_5_Water_Anim.png"       "$S/water_rock_2.png"
cp "$CF/Trees/Big_Oak_Tree.png"      "$S/tree_big_oak.png"
cp "$CF/Trees/Big_Spruce_tree.png"   "$S/tree_big_spruce.png"
cp "$CF/Trees/Big_Birch_Tree.png"    "$S/tree_big_birch.png"
cp "$CF/Trees/Big_Fruit_Tree.png"    "$S/tree_big_fruit.png"
cp "$CF/Trees/Medium_Birch_Tree.png" "$S/tree_birch.png"
cp "$CF/Trees/Medium_Fruit_Tree.png" "$S/tree_fruit.png"
cp "$OD/Outdoor_Decor.png" "$S/decor.png"
for n in 1 2 3 4 5; do
  cp "$AN/Flower_Animations/Not_Potted/Flowers_${n}_Anim.png" "$S/flower_anim_$n.png"
done
for n in 1 2 3; do
  cp "$AN/Grass_Animations/Grass_${n}_Anim.png" "$S/grass_anim_$n.png"
done
for n in 1 2 3 4 5 6; do
  cp "$AN/Grass_Animations/Flower_Grass_${n}_Anim.png" "$S/flower_grass_$n.png"
done
cp "$OD/Lanter_Posts.png"  "$S/lamp_posts.png"
cp "$AN/Other_Animations/Fountain_Anim.png"          "$S/fountain.png"
cp "$AN/Other_Animations/Pole_and_Bunting_1_Anim.png" "$S/bunting.png"
cp "$OD/Well.png"     "$S/well.png"
cp "$OD/Benches.png"  "$S/benches.png"
cp "$OD/barrels.png"  "$S/barrels.png"
cp "$CF/Weather effects/Clouds.png"   "$S/clouds.png"
cp "$CF/Weather effects/Wind_Anim.png" "$S/wind.png"
cp "$CF/Animals/Butterfly/Butterfly.png" "$S/butterfly.png"
cp "$CF/Trees/Oak_Leaf_Particle.png"   "$S/leaf_oak.png"
cp "$CF/Trees/Birch_Leaf_Particle.png" "$S/leaf_birch.png"

echo "copied $(find "$DEST" -type f | wc -l | tr -d ' ') files into $DEST"
if [ -z "$PY" ]; then
  echo "incomplete: rerun after installing Python 3 and Pillow to finish the Stone houses and title menu." >&2
  exit 1
fi
