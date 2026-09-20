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

H="$CF/Buildings/Buildings/Houses/Wood"
cp "$H/House_1_Wood_Base_Red.png"   "$DEST/buildings/house_0.png"
cp "$H/House_2_Wood_Base_Blue.png"  "$DEST/buildings/house_1.png"
cp "$H/House_3_Wood_Green_Red.png"  "$DEST/buildings/house_2.png"
cp "$H/House_4_Wood_Base_Black.png" "$DEST/buildings/house_3.png"
cp "$H/House_5_Wood_Red_Blue.png"   "$DEST/buildings/house_4.png"

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
