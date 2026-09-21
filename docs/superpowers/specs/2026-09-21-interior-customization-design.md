# Interior customization ("Animal Crossing" house editing) — design

## Goal

Let a player customize a house interior — move/add/remove furniture, rotate it, and swap
wallpaper/flooring — with changes persisting across reloads. Today, interior layout
(floor tile, wall style, furniture positions) is entirely hash-derived from `house.id`/`house.name`
in `InteriorScene.ts` and recomputed from scratch every time the scene is created; nothing is
stored.

## Non-goals

- No new art generation. Catalog expansion uses color/species variants already present but
  unwired in the existing Kenmi sheets (`beds.png`, `carpets.png`, `lamps.png`, `plants.png`,
  `decor.png`). No image-generation tool is introduced.
- No true multi-room interiors. `InteriorScene` continues to render one physical room per house;
  the vault parser's unused `layoutRoom()`/multi-room contract is not revived here.
- No animated chest frames. `chest` stays a static frame-0 image.
- No new drag-and-drop dependency. Phaser 3.90's native input already covers what the in-scene
  parts of the app need, and the editor itself is a plain React grid, not a drag surface.

## Data model (`lib/types.ts`)

```ts
export type CatalogItemId = string; // e.g. 'desk', 'bed_blue', 'lamp_pink', 'plant_fern'

export type CatalogEntry = {
  id: CatalogItemId;
  category: FurnitureId; // which of the 8 base kinds this is a variant of
  textureKey: string;
  frameKey: string;
  footprint: [number, number];
  rotations: Array<0 | 90 | 180 | 270>; // which rotations are visually valid for this sprite
};

export type FurniturePlacement = {
  item: CatalogItemId;
  gx: number;
  gy: number;
  rotation: 0 | 90 | 180 | 270;
  noteId?: string; // set when this placement still hosts a note from the original auto-layout
};

export type InteriorLayout = {
  floorFrame: number;
  wallTriple: number;
  placements: FurniturePlacement[];
};
```

`CatalogItemId` widens from the closed `FurnitureId` union to a string so variants can be added
without touching the type per item. A new `CATALOG: CatalogEntry[]` (colocated with `FOOTPRINT`/
`FURNITURE` in `lib/types.ts`) becomes the source of truth for what's placeable; existing
`FOOTPRINT` stays as-is for the 8 base categories and `CatalogEntry.footprint` mirrors it per
variant (all variants of one category share its footprint — only the frame changes).

`InteriorLayout` is not a field on `House` (which comes from `parseVault` and is re-derived every
vault open) — it's a separate value looked up by fingerprint+houseId from storage and merged in
at `InteriorScene.create()` time.

## Persistence (new `lib/interiorStore.ts`)

`localStorage`, key = `` interior:${fingerprint}:${houseId} ``, value = JSON-serialized
`InteriorLayout`.

`fingerprint = hash(vaultName + '\n' + sortedFilePaths.join('\n'))`, computed once in
`lib/vault/open.ts` right after the `paths` list exists (both `openVault` and `openDemoVault`
already build this list), then published via `game.registry.set('vaultFingerprint', fingerprint)`
alongside `world` so `InteriorScene` can read it without re-deriving it. This avoids needing a
real filesystem path (the File System Access API never exposes one) while being far stronger than
vault name alone — two vaults would need an identical name *and* an identical file listing to
collide.

```ts
export function getLayout(fingerprint: string, houseId: string): InteriorLayout | null;
export function saveLayout(fingerprint: string, houseId: string, layout: InteriorLayout): void;
```

Opening a different vault (different fingerprint) never reads another vault's saved layouts;
each vault's houses start from today's deterministic hash-derived defaults until customized.

## Catalog expansion (`game/scenes/BootScene.ts`)

Wire the documented-but-unused variants already in the installed sheets into named texture
frames, one `CatalogEntry` per frame:

- `beds.png`: base + blue/green/pink/yellow/red (same 32×32 rect, offset rows) → `bed`, `bed_blue`, …
- `carpets.png`: base + 5 colors including cyan → `rug`, `rug_cyan`, …
- `lamps.png`: base + blue/green/pink/yellow shades → `lamp`, `lamp_blue`, …
- `plants.png`: base + other species across the row → `plant`, `plant_fern`, …
- `decor.png`: check the remaining 5 slots on the 6-column sheet beyond the currently-wired
  painting for additional `painting_*` variants.
- `desk`, `shelf`, `chest` stay single-variant (no unused frames documented for these).

Each variant's `rotations` array is set by inspection of the sprite: symmetric items (rug,
painting) get `[0, 90, 180, 270]`; single-facing items (desk, bed, lamp, plant, chest) get
`[0, 180]` (mirrored via `flipX`, not a true quarter turn, since there's no rotated art).

## Bus events (`game/bus.ts`)

```ts
'open-interior-editor': { houseId: string };
'close-interior-editor': undefined;
'commit-interior-layout': { houseId: string; layout: InteriorLayout };
```

Mirrors the existing `open-shelf`/`close-shelf` pair. `open-interior-editor` is emitted by
`InteriorScene` from a "Customize" prompt near the door (same floating-`!`/click affordance
already used for the shelf and note furniture). `commit-interior-layout` is emitted by the React
editor on Save; `InteriorScene` listens for it, calls `saveLayout(...)`, then
`this.scene.restart({ houseId })` — the same restart mechanism already used on window resize.

## Editor UI (new `components/InteriorEditor.tsx`)

Mounted in `app/page.tsx` alongside `Bookshelf`/`NoteReader`, always-mounted with internal
bus-driven visibility, following the existing overlay convention.

- Local state: `houseId`, `draft: InteriorLayout` (seeded from `getLayout(...) ?? {current
  hash-derived defaults}` when `open-interior-editor` fires), `selectedCell`.
- A CSS-grid representation of the room sized to its actual `w × h` (not a live Phaser view).
  Clicking an empty cell opens a small catalog-item picker filtered to items whose footprint fits
  there without overlapping another placement or blocking the door/shelf-approach tiles — the
  same adjacency rules `pickSpot()` already enforces, reimplemented as a pure function shared by
  both (extract `pickSpot`'s overlap/blocked-tile check into a small helper in `lib/types.ts` or a
  new `lib/interiorLayout.ts` so `InteriorScene`'s defaults and the editor's validation can't
  drift apart).
- Clicking an occupied cell selects that placement, showing a small toolbar: rotate (cycles
  through `CatalogEntry.rotations` only), remove, or swap to a different catalog item of the same
  category.
- A wallpaper strip and a flooring strip above the grid, rendered as CSS `background-position`
  swatches cropped from `interior/walls.png`/`interior/floor.png`, one swatch per allowed
  `WALL_TRIPLES`/`FLOOR_FRAMES` entry (no new tile choices beyond what's already curated there).
- Escape (capture-phase `window` listener, following `NoteReader.tsx`'s convention so it beats
  Phaser's own keyboard listeners) and a backdrop click both cancel without saving. "Save" emits
  `commit-interior-layout` then `close-interior-editor`.
- Text/click controls call `stopPropagation()` on their events, same as `NoteReader`'s inputs, so
  Phaser's WASD/Space movement listeners don't fire underneath the open editor.

## `InteriorScene` integration

On `create()`: read `fingerprint` and `houseId`, call `getLayout(fingerprint, houseId)`.

- If present: use its `floorFrame`/`wallTriple` in place of the current hash-derived lookups, and
  render each `FurniturePlacement` (texture/frame from `CATALOG`, position from `gx`/`gy`,
  `flipX`/`setAngle` from `rotation`) in place of `pickSpot()`'s output. A placement with `noteId`
  set wires the same click/approach → `open-note` behavior existing furniture has today.
- If absent: behavior is unchanged (today's deterministic `pickSpot()`/`FLOOR_FRAMES`/
  `WALL_TRIPLES` placement). The *first* time the editor opens for a house with no saved layout,
  it seeds its draft from that same computed default (via the shared helper from the editor
  section above) so editing starts from what the player already sees, not a blank room — nothing
  is written to storage until the player actually hits Save.
- A "Customize" prompt near the door (reusing the existing floating-`!` indicator/click pattern)
  emits `open-interior-editor`. While the editor is open, a new `editingLayout` boolean gates
  `update()` exactly like the existing `shelfOpen`/`noteOpen` flags.

## Verification

No test suite exists in this repo and project convention is not to add one for this kind of
build. Verify by running the dev server, opening the demo vault, entering a house, customizing
(move/add/remove/rotate furniture, swap wallpaper and flooring), reloading the page, and
confirming the layout persisted. Then open a second, differently-named/shaped vault and confirm
its houses are unaffected by the first vault's saved layouts (fingerprint isolation).
