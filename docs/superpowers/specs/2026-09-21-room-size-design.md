# Adjustable room size (small/medium/large) — design

## Goal

Let a house's interior room be one of three fixed sizes — small, medium, large — chosen in the
customize editor, with large equal to today's `MIN_ROOM_W`/`MIN_ROOM_H` floor. Today, room
dimensions (`w`, `h`) are computed once per `InteriorScene.create()` from the browser viewport
(`Math.max(MIN_ROOM_W, ceil(viewport width / 16))` and the `H` equivalent) — never a stored
per-house value, and the room always grows to at least fill the visible window.

## Decisions already made (in brainstorming)

- All three tiers are **fixed** tile dimensions, not viewport-derived. Room size stops growing
  to fill a bigger browser window — that's the deliberate trade-off of making it a discrete,
  storable, per-house setting.
- `small: [13, 10]`, `medium: [16, 12]`, `large: [20, 15]`. Large equals today's
  `MIN_ROOM_W`/`MIN_ROOM_H`, which is already proven to fit any window the game supports — so no
  tier ever needs to be larger than the viewport, and **no camera scrolling/follow work is
  needed**. (A room smaller than the actual browser window just leaves the dark background
  color, `#141018`, visible around it, top-left anchored — no centering, matching today's
  `cameras.main.setScroll(0, 0)` behavior exactly.)
- Shrinking a room that has furniture (or the shelf) near what would become the new edge is
  **blocked with an error**, not auto-resolved. No silent deletion of a piece — especially one
  holding a note-launcher.

## Data model (`lib/types.ts`)

```ts
export type RoomSize = 'small' | 'medium' | 'large';

export type InteriorLayout = {
  floorFrame: number;
  wallTriple: number;
  roomSize: RoomSize;
  shelf: { gx: number; gy: number };
  placements: FurniturePlacement[];
};
```

## `lib/interiorLayout.ts` changes

```ts
export const ROOM_SIZES: Record<RoomSize, [number, number]> = {
  small: [13, 10],
  medium: [16, 12],
  large: [20, 15],
};

export function doorPositionFor(w: number, h: number): [number, number] {
  return [Math.floor(w / 2), h - 1];
}
```

`computeDefaultLayout`'s signature simplifies — it no longer takes `w`/`h`/`doorGx`/`doorGy` as
caller-supplied parameters (that was only ever viewport-derived data); it takes an optional
`roomSize` (defaulting to `'large'`, matching today's minimum-size behavior for anyone who
hasn't touched this) and derives everything itself:

```ts
export function computeDefaultLayout(house: House, roomSize: RoomSize = 'large'): InteriorLayout {
  const [w, h] = ROOM_SIZES[roomSize];
  const [doorGx, doorGy] = doorPositionFor(w, h);
  const shelfGx = shelfGxFor(w);
  const shelfGy = SHELF_GY;
  // ...unchanged body (floorFrame/wallTriple/occupied/placements)...
  return { floorFrame, wallTriple, roomSize, shelf: { gx: shelfGx, gy: shelfGy }, placements };
}
```

This also resolves an ordering problem: today `w`/`h` must be computed *before* `getLayout()` is
even checked, because the fallback path needs them. Once size is a stored property of the
layout itself, there's no such ordering constraint — the caller just checks storage first, then
falls back to `computeDefaultLayout(house)` (or `computeDefaultLayout(house, 'large')`
explicitly — same thing) if nothing was saved.

New `canResize`, reusing the existing footprint/overlap-check helpers:

```ts
// Would every existing placement, and the shelf, still fit inside a room
// resized to (newW, newH)? Used to block a shrink that would strand
// furniture outside the new walls or on top of the (possibly relocated)
// door lane. Nothing moves relative to the room's top-left corner, so this
// only needs to check bounds + the new structural set — pieces can't newly
// overlap each other, since their relative positions don't change.
export function canResize(
  layout: InteriorLayout,
  catalogById: Record<CatalogItemId, { footprint: [number, number] }>,
  newW: number,
  newH: number,
): boolean {
  const [newDoorGx] = doorPositionFor(newW, newH);
  const structural = structuralOccupied(newW, newH, newDoorGx);

  const shelfCells = footprintCells(layout.shelf.gx, layout.shelf.gy, SHELF_W, 2);
  if (
    layout.shelf.gx < 1 || layout.shelf.gy < 1 ||
    layout.shelf.gx + SHELF_W > newW - 1 || layout.shelf.gy + 2 > newH - 1 ||
    shelfCells.some((c) => structural.has(c))
  ) {
    return false;
  }

  for (const p of layout.placements) {
    const entry = catalogById[p.item];
    if (!entry) continue;
    const [fw, fh] = entry.footprint;
    if (p.gx < 1 || p.gy < 1 || p.gx + fw > newW - 1 || p.gy + fh > newH - 1) return false;
    const cells = footprintCells(p.gx, p.gy, fw, fh);
    if (cells.some((c) => structural.has(c))) return false;
  }
  return true;
}
```

## `lib/interiorStore.ts`

`getLayout()`'s shape guard gains a `roomSize` check (`parsed.roomSize === 'small' ||
'medium' || 'large'`), alongside the existing `floorFrame`/`wallTriple`/`shelf`/`placements`
checks — a layout saved before this feature existed fails validation and falls back to the
default, exactly like the shelf-move feature's own migration handled it.

## `game/scenes/InteriorScene.ts`

- Delete the local `MIN_ROOM_W`/`MIN_ROOM_H` constants and the viewport-derived `w`/`h`
  computation (`Math.max(MIN_ROOM_W, Math.ceil(this.scale.width / TILE))` and its `H`
  equivalent). Import `ROOM_SIZES`/`doorPositionFor` from `lib/interiorLayout.ts` instead.
- New order in `create()`: look up `getLayout()` first; `this.layout = saved ??
  computeDefaultLayout(house)`; then `const [w, h] = ROOM_SIZES[this.layout.roomSize];
  [this.doorGx, this.doorGy] = doorPositionFor(w, h);`. Everything below (floor/wall loops,
  shelf rendering, furniture rendering, camera) is unchanged — it already only consumes `w`/`h`/
  `doorGx`/`doorGy` as local values, not caring where they came from.
- `openEditor()`'s bus payload no longer needs to include `w`/`h`/`doorGx`/`doorGy` — the editor
  now derives room geometry itself from `layout.roomSize` (see below), so the payload shrinks to
  `{ houseId, layout: this.layout }`.
- The window-resize handler (`this.scale.on(Phaser.Scale.Events.RESIZE, onResize)` and its
  `onResize` callback, plus the matching `shutdown` cleanup) is **deleted entirely**. Its only
  reason to exist was recomputing `w`/`h` for a new viewport size; room size is no longer
  viewport-derived, so a window resize no longer changes anything about the room. Keeping it
  would just force a disruptive full scene restart (dropping the player back at the door,
  closing the editor if it's open) on every resize for zero benefit — worth removing as part of
  this change, not keeping as dead weight.

## `game/bus.ts`

```ts
'open-interior-editor': { houseId: string; layout: InteriorLayout };
```
(`w`, `h`, `doorGx`, `doorGy` removed — dead weight once the editor is self-sufficient.)

## `components/InteriorEditor.tsx`

- `Session` type shrinks to `{ houseId: string }`.
- `w`, `h`, `doorGx`, `doorGy` are no longer destructured from `session` — they're derived live
  from `draft.roomSize` on every render: `const [w, h] = ROOM_SIZES[draft.roomSize]; const
  [doorGx, doorGy] = doorPositionFor(w, h);`. This is what makes the grid preview update
  immediately when a size button is clicked, before Save — the grid's `gridTemplateColumns`/
  `gridTemplateRows`, `structural`, and every cell's door/shelf/placement check already read
  from these local `w`/`h`/`doorGx` values, so no other rendering code needs to change.
- New **Room Size** row, styled like the existing Floor/Wallpaper rows, with three buttons
  (Small/Medium/Large) instead of swatches:
  ```tsx
  <div className="flex gap-2">
    <span className="text-xs uppercase text-neutral-400">Room Size</span>
    {(['small', 'medium', 'large'] as const).map((size) => (
      <button
        key={size}
        className={`rounded border px-2 py-1 text-xs capitalize ${
          draft.roomSize === size ? 'border-yellow-400 text-yellow-400' : 'border-neutral-600'
        }`}
        onClick={() => {
          const [newW, newH] = ROOM_SIZES[size];
          if (!canResize(draft, CATALOG_BY_ID, newW, newH)) {
            setError("Some furniture won't fit at this size — move or remove it first.");
            return;
          }
          setError(null);
          setDraft({ ...draft, roomSize: size });
        }}
      >
        {size}
      </button>
    ))}
  </div>
  ```
- No other interaction changes. Selecting/moving/rotating/removing furniture and the shelf all
  already operate purely in terms of the local `w`/`h`/`doorGx` — since those are now derived
  from `draft.roomSize` instead of a frozen `session` value, every existing check (`canPlace`,
  `canPlaceShelf`, `cellPlacementIndex`, `isShelfCell`, `structuralOccupied`) automatically
  operates against the *current* draft size with zero changes to their call sites.

## Non-goals

- No camera scrolling/follow — ruled out by capping every tier at a size proven to fit.
- No per-size furniture repacking/auto-rearrange on shrink — blocked with an error instead
  (decided in brainstorming).
- No change to floor/wallpaper swatch behavior, rotation, or the shelf's single fixed style —
  orthogonal to this feature.

## Verification

No automated test suite exists in this project (project convention). Verify by: opening a house
with the default (untouched) layout and confirming it still renders at today's size (20×15,
`large`); shrinking to medium and small and confirming the grid preview updates immediately;
placing furniture near the edge of a small room, growing back to large, confirming positions are
undisturbed; shrinking with furniture near the new edge and confirming the error blocks the
change without mutating `draft`; saving a resized room and reloading, confirming the size
persists; confirming `npx tsc --noEmit` and `npm run build` are clean.
