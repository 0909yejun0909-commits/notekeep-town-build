# More furniture — design

**Goal.** Players will earn credits by writing notes and spend them on furniture. With 23 catalog
items (16 of them colour variants of a bed, lamp or plant) there was not enough to shop for.
This grows the catalog to 114 pieces from Kenmi sheets we already license. No new art.

## Decisions

- **New kinds are decoration only.** 26 new `DecorKind`s (sofa, armchair, chair, stool, fireplace,
  clock, single_bed, wardrobe, cabinet, sideboard, nightstand, mirror, table, stove, sink, fridge,
  barrel, bathtub, toilet, basin, vanity, bookcase, piano, guitar, planter, mat). The vault parser
  still only puts notes on the 8 `FurnitureId` kinds, so parsing, saved layouts and the multiplayer
  world payload are unchanged. `CatalogEntry.category` widened to `FurnitureId | DecorKind`.
- **Existing kinds got more variants too.** Colour and treasure chests (iron, gold, ruby, sapphire,
  emerald), tablecloth tables, rugs, lamps and flowerpots. A note-holder can be swapped to any of
  these, and notes still only sit on the original kinds.
- **Every entry has a `tier`**: `common | uncommon | rare | treasure`. The shop should map tiers to
  credit prices in one place, not price 114 entries individually.
- **Every entry has a display `name`**, shown in the editor and ready for the shop.
- **The catalog is the only place sprite rects live.** BootScene loads every sheet in
  `FURNITURE_SHEETS` and carves each entry's frame from its `rect`. `footprint` is derived from the
  rect, so a sprite, its thumbnail and the tiles it blocks can't disagree.
- **Editor tabs by room theme** (`CATALOG_GROUPS`): Living, Bedroom, Kitchen, Bath, Study, Plants,
  Chests. Pieces show as sprite thumbnails with a tier-coloured underline, and pieces too big for
  the clicked spot are dimmed.
- **Walkable pieces** are listed in `WALKABLE` (rug, mat). Everything else blocks its footprint.

## Adding a piece

1. If the sheet is new, copy it in `scripts/install-assets.sh` and add its file name to
   `FURNITURE_SHEETS`.
2. Add an `item(...)` line to `CATALOG`. The rect must be whole tiles and bottom-aligned to the
   sprite. A new kind also needs a `DecorKind` member and a place in one `CATALOG_GROUPS` tab.
3. `npm test` checks tile-sized rects, one footprint per kind, a tab for every kind, and (with art
   installed) that every rect lies inside its sheet.

## Not included

- Credits, prices, ownership and the shop screen itself.
- Wall-hung art (windows, wall clocks, wall mirrors, towels): it needs a "hangs on the back wall"
  placement rule that doesn't exist yet.
- Tabletop props (potions, candles, books): there is no "on a table" placement.
- Default room layouts are unchanged, so new pieces only appear once placed.
