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
cp "$KENMI/Cute_Fantasy_Desert/Tiles/Desert_Grass.png"               "$DEST/terrain/desert.png"
cp "$KENMI/Cute_Fantasy_Desert/Tiles/Desert_Beach_Tiles_1.png"       "$DEST/terrain/desert_sand.png"
cp "$KENMI/Cute_Fantasy_Volcano/Tiles/Volcano_Tiles.png"             "$DEST/terrain/volcano.png"
cp "$KENMI/Cute_Fantasy_Christmass/Decorations/Christmass_Grass.png" "$DEST/terrain/snow.png"
cp "$CF/Trees/Medium_Oak_Tree.png"              "$DEST/terrain/tree_oak.png"
cp "$CF/Trees/Medium_Spruce_Tree.png"           "$DEST/terrain/tree_spruce.png"
cp "$CF/Outdoor decoration/Flowers.png"         "$DEST/terrain/flowers.png"

H="$CF/Buildings/Buildings/Houses"
# Every shape ships in Wood, Stone, and Limestone; material/wall/roof color are all picked
# independently (lib/houseCatalog.ts), so every combo Kenmi actually ships gets installed, not
# just each shape's original fixed combo. Coverage isn't uniform, though — Wood ships all 9
# wall/roof combos per shape, but Stone's shape index 3 (its "House_4") only ships the base
# wall look, and Limestone ships only one wall look per shape (all 3 roof colors). See
# lib/houseCatalog.ts's availableWallColors for the same rule the game enforces at runtime.
for shape in 1 2 3 4 5; do
  idx=$((shape - 1))

  for wc in Base Green Red; do
    for rc in Black Blue Red; do
      wl=$(echo "$wc" | tr '[:upper:]' '[:lower:]')
      rl=$(echo "$rc" | tr '[:upper:]' '[:lower:]')
      cp "$H/Wood/House_${shape}_Wood_${wc}_${rc}.png" "$DEST/buildings/house_${idx}_wood_${wl}_${rl}.png"
    done
  done

  for wc in Base Green Red; do
    if [ "$idx" = "3" ] && [ "$wc" != "Base" ]; then continue; fi
    for rc in Black Blue Red; do
      wl=$(echo "$wc" | tr '[:upper:]' '[:lower:]')
      rl=$(echo "$rc" | tr '[:upper:]' '[:lower:]')
      src="$H/Stone/House_${shape}_Stone_${wc}_${rc}.png"
      # House_2_Stone_Base_Black.png ships from Kenmi with a typo'd filename (missing the
      # underscore before "png") — the only mis-named file in the whole pack.
      if [ ! -f "$src" ]; then src="$H/Stone/House_${shape}_Stone_${wc}_${rc}png.png"; fi
      cp "$src" "$DEST/buildings/house_${idx}_stone_${wl}_${rl}.png"
    done
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

echo "copied $(find "$DEST" -type f | wc -l | tr -d ' ') files into $DEST"
