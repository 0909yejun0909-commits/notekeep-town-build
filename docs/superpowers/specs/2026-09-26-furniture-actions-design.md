# Furniture actions — design

**Goal:** make a house feel lived in. Some furniture does something when you walk up to it:
chairs let you sit, beds let you lie down, a wardrobe lets you change your outfit.

## Decisions (agreed with Jason, 2026-09-26)

- **Sitting and lying are just for feel.** No reward, no time skip. You stay posed until you
  press a movement key (or Space/Enter again), which puts you back on the tile you came from.
- **Wardrobe opens the existing character picker** (`CharacterCreator`) in game, and your
  character is redressed the moment you close it.
- **A bed that holds a note asks first.** Space brings up a small parchment menu: Read note /
  Lie down. A bed without a note lies you down straight away. Clicking a bed still opens its
  note, as before.
- **No new art.** Kenmi's character sheets have no sit or sleep animation (their Aseprite
  sources list idle, run, roll, jump, death, attack, bow, climb, push, fishing, the tool
  swings and horse riding). The poses below are built from frames we already load.

## Which pieces do what

One map in `lib/catalog.ts`, next to `WALKABLE`:

| Action | Categories |
|---|---|
| `sit` | sofa, armchair, chair, stool |
| `lie` | bed, single_bed |
| `wardrobe` | wardrobe |

A new action later is one line here plus its handler.

## Interaction

Same as notes: the approach tile is the one just below the middle of the piece's footprint,
`(gx + floor(w/2), gy + h)`. Standing there shows the `!` and Space/Enter acts. When one tile
is the approach for several pieces, a note wins, then the bookshelf, then an action, because
reading notes is the point of the game.

## Poses (measured on mockups of every variant)

All action pieces are upright (only mirrored, never quarter-turned), and every seat faces the
viewer, so you always sit facing down.

- **Sit:** your normal body and outfit keep playing `idle-down` (the breathing bob stays),
  placed at the horizontal middle of the piece and lifted onto the seat. The bottom strip of the
  piece is then drawn again on top, so your legs are inside the chair rather than in front of it.
  Chairs, armchairs and sofas: lift 3px, strip 5px. Stools, which are one tile tall: lift 6px,
  strip 8px.
- **Lie:** your standing body and clothes are hidden. Your head (base + outfit layers, frame 2
  of `idle-down` — the one with 1px eyes, which reads as closed) goes on the pillow, 6px above
  the bed's top edge, and the bed from 13px down is drawn again over it as the blanket. A small
  "z" drifts up on a loop.
- **Getting up** destroys the pose objects, shows the body again and puts it back on the
  approach tile, facing down.

`dressPlayer`'s layers now also copy the body's `visible`, so hiding the body hides its clothes.

## Wardrobe

`InteriorScene` emits `open-wardrobe`; `components/Wardrobe.tsx` shows `CharacterCreator` over
the game. The picker already saves every change to localStorage. Done emits `close-wardrobe`;
the scene reloads the appearance into the registry and redresses the player (drop the old
layers, dress again). `OverworldScene` reads the registry when you step outside, so it picks the
new look up for free. Remote players still see the default outfit (presence has no appearance
field), same as today.

## Bed menu

`InteriorScene` emits `open-bed-menu`; `components/BedMenu.tsx` shows the two choices with the
title menu's cursor style (arrows + Enter, mouse, Esc cancels) and emits
`bed-menu-choice: { choice: 'read' | 'lie' | 'cancel' }`.

## Keys shared by React and Phaser

Phaser sees every keydown the overlays see. The Enter that closes the wardrobe or picks from
the bed menu would otherwise count as a fresh Space/Enter on the next frame and reopen it (or
stand you straight back up). The scene calls `input.keyboard.resetKeys()` whenever one of these
overlays closes — the same fix `ChatPanel` uses.

## Out of scope

Other players seeing your pose (presence has no pose field), true closed eyes, sitting on
toilets/benches, actions for mirrors, pianos or anything else.

## Testing

- `lib/catalog.test.mts`: every action category exists in the catalog, action pieces are never
  walkable and never take a quarter turn (the pose geometry assumes upright pieces).
- In a real browser, demo town: sit on each seat kind, lie on a double and a single bed, the
  bed menu on a note bed (read, lie, cancel with keys and mouse), change outfit via a wardrobe
  and check the new look inside and outside.
