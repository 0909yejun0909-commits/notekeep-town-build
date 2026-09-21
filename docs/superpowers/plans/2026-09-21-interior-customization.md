# Interior Customization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a player move/add/remove/rotate furniture and swap wallpaper/flooring inside a
house, with the layout persisting across reloads.

**Architecture:** Furniture placement, currently hash-derived and recomputed from scratch every
`InteriorScene.create()`, is extracted into a pure `InteriorLayout` value. A new
`lib/interiorStore.ts` persists that value to `localStorage`, keyed by a fingerprint of the vault
(name + full file list, since the File System Access API never exposes a real path) plus the
house id. A React modal (`InteriorEditor.tsx`), following the existing `NoteReader.tsx`/
`Bookshelf.tsx` bus-driven-overlay pattern, edits a draft `InteriorLayout` and commits it back
through `game/bus.ts`. `InteriorScene` renders whichever layout is current (saved, or today's
computed default) and reacts to a commit by saving and restarting itself — the same
`scene.restart()` mechanism it already uses on window resize.

**Tech Stack:** Next.js App Router, TypeScript, Phaser 3.90 (no new dependency — no drag library
is needed; the editor is a plain React grid, not a live Phaser drag surface), Tailwind + inline
styles (matching the codebase's existing mixed styling convention).

**Spec:** `docs/superpowers/specs/2026-09-21-interior-customization-design.md`

## Global Constraints

- Phaser stays pinned `^3.90.0` — never upgrade to v4.
- No new npm dependencies (no drag-and-drop library; Phaser's native input/`localStorage` cover
  everything needed).
- No test suite exists in this repo and none is added here (project convention). Every task's
  "Verify" step is `npx tsc --noEmit` plus a manual dev-server check, not an automated test.
- No new art generation. Catalog expansion only wires up color/species variants that are
  documented in `docs/ASSETS.md` and already present in the installed sheets under
  `public/assets/furniture/`.
- **Scope refinement found during planning, not in the original spec:** `decor.png`'s other five
  slots (visually inspected — they're distinct props: candles, urns, a mirror, benches, not color
  variants of the one wired painting) have no documented pixel rects anywhere, and the project's
  own rule in `ASSETS.md` is "never let Fable guess a frame index." Task 3 therefore does **not**
  expand `painting` — only `bed`, `rug`, `lamp`, `plant` gain variants, all from rects
  `ASSETS.md` already states explicitly.
- **Scope refinement:** `shelf` is excluded from the placeable catalog. It's already excluded
  from `DECOR_TYPES` in the current code (`game/scenes/InteriorScene.ts:25`) because it's a fixed
  structural element — the only way to browse *every* note in a house, not a decorative piece —
  and stays that way; nothing about it becomes movable/removable.
- Removing a placement that held a note never orphans that note: the bookshelf (`Bookshelf.tsx`)
  already lists every note in the house regardless of decor placement, so a note is always
  reachable even if the furniture piece that originally launched it directly is deleted.
- New placements added from the catalog (as opposed to the initial computed-default seed) never
  get a `noteId` — only the original auto-assigned pieces keep their note link when the layout is
  first seeded.

---

### Task 1: Data model

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/catalog.ts`

**Interfaces:**
- Produces: `CatalogItemId` (string), `CatalogEntry` type, `FurniturePlacement` type,
  `InteriorLayout` type (all from `lib/types.ts`); `CATALOG: CatalogEntry[]` and
  `CATALOG_BY_ID: Record<CatalogItemId, CatalogEntry>` (from `lib/catalog.ts`).

- [ ] **Step 1: Add the new types to `lib/types.ts`**

Add after the existing `FOOTPRINT`/`BIOMES`/`FURNITURE` block (after line 49):

```ts
// A catalog item is a specific placeable variant (e.g. 'bed_blue'); `category` says
// which of the 8 FurnitureId kinds it's a variant of, for footprint/interchange rules.
export type CatalogItemId = string;

export type CatalogEntry = {
  id: CatalogItemId;
  category: FurnitureId;
  textureKey: string;
  frameKey: string;
  footprint: [number, number];
  rotations: Array<0 | 90 | 180 | 270>;
};

export type FurniturePlacement = {
  item: CatalogItemId;
  gx: number;
  gy: number;
  rotation: 0 | 90 | 180 | 270;
  // Set only when this placement was one of the house's original auto-assigned
  // note-holders. Never set on a placement added later from the catalog.
  noteId?: string;
};

export type InteriorLayout = {
  floorFrame: number;
  wallTriple: number;
  placements: FurniturePlacement[];
};
```

- [ ] **Step 2: Create `lib/catalog.ts`**

```ts
import type { CatalogEntry, CatalogItemId } from './types';

// Base 8 categories, one catalog entry each (single-variant categories, or the
// "default" variant of a category that also has colour/species variants below).
// rotations: symmetric sprites (rug, painting) allow a full quarter-turn; every
// other category only supports a left/right mirror, since no rotated art exists.
export const CATALOG: CatalogEntry[] = [
  { id: 'desk', category: 'desk', textureKey: 'furn_desk', frameKey: 'desk', footprint: [2, 3], rotations: [0, 180] },
  { id: 'chest', category: 'chest', textureKey: 'furn_chest', frameKey: 'chest', footprint: [1, 1], rotations: [0, 180] },
  { id: 'painting', category: 'painting', textureKey: 'furn_painting', frameKey: 'painting', footprint: [1, 1], rotations: [0, 90, 180, 270] },
  { id: 'bed', category: 'bed', textureKey: 'furn_bed', frameKey: 'bed', footprint: [2, 2], rotations: [0, 180] },
  { id: 'bed_blue', category: 'bed', textureKey: 'furn_bed', frameKey: 'bed_blue', footprint: [2, 2], rotations: [0, 180] },
  { id: 'bed_green', category: 'bed', textureKey: 'furn_bed', frameKey: 'bed_green', footprint: [2, 2], rotations: [0, 180] },
  { id: 'bed_pink', category: 'bed', textureKey: 'furn_bed', frameKey: 'bed_pink', footprint: [2, 2], rotations: [0, 180] },
  { id: 'bed_yellow', category: 'bed', textureKey: 'furn_bed', frameKey: 'bed_yellow', footprint: [2, 2], rotations: [0, 180] },
  { id: 'bed_red', category: 'bed', textureKey: 'furn_bed', frameKey: 'bed_red', footprint: [2, 2], rotations: [0, 180] },
  { id: 'rug', category: 'rug', textureKey: 'furn_rug', frameKey: 'rug', footprint: [3, 3], rotations: [0, 90, 180, 270] },
  { id: 'rug_cyan', category: 'rug', textureKey: 'furn_rug', frameKey: 'rug_cyan', footprint: [3, 3], rotations: [0, 90, 180, 270] },
  { id: 'lamp', category: 'lamp', textureKey: 'furn_lamp', frameKey: 'lamp', footprint: [1, 2], rotations: [0, 180] },
  { id: 'lamp_blue', category: 'lamp', textureKey: 'furn_lamp', frameKey: 'lamp_blue', footprint: [1, 2], rotations: [0, 180] },
  { id: 'lamp_green', category: 'lamp', textureKey: 'furn_lamp', frameKey: 'lamp_green', footprint: [1, 2], rotations: [0, 180] },
  { id: 'lamp_pink', category: 'lamp', textureKey: 'furn_lamp', frameKey: 'lamp_pink', footprint: [1, 2], rotations: [0, 180] },
  { id: 'lamp_yellow', category: 'lamp', textureKey: 'furn_lamp', frameKey: 'lamp_yellow', footprint: [1, 2], rotations: [0, 180] },
  { id: 'plant', category: 'plant', textureKey: 'furn_plant', frameKey: 'plant', footprint: [1, 2], rotations: [0, 180] },
  { id: 'plant_a', category: 'plant', textureKey: 'furn_plant', frameKey: 'plant_a', footprint: [1, 2], rotations: [0, 180] },
  { id: 'plant_b', category: 'plant', textureKey: 'furn_plant', frameKey: 'plant_b', footprint: [1, 2], rotations: [0, 180] },
  { id: 'plant_c', category: 'plant', textureKey: 'furn_plant', frameKey: 'plant_c', footprint: [1, 2], rotations: [0, 180] },
  { id: 'plant_d', category: 'plant', textureKey: 'furn_plant', frameKey: 'plant_d', footprint: [1, 2], rotations: [0, 180] },
  { id: 'plant_e', category: 'plant', textureKey: 'furn_plant', frameKey: 'plant_e', footprint: [1, 2], rotations: [0, 180] },
  { id: 'plant_f', category: 'plant', textureKey: 'furn_plant', frameKey: 'plant_f', footprint: [1, 2], rotations: [0, 180] },
];

export const CATALOG_BY_ID: Record<CatalogItemId, CatalogEntry> = Object.fromEntries(
  CATALOG.map((e) => [e.id, e]),
);
```

- [ ] **Step 3: Verify**

Run: `cd ~/Projects/notekeep-town-build && npx tsc --noEmit`
Expected: no new errors (this step only adds unused-but-exported types/values, nothing consumes
them yet).

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts lib/catalog.ts
git commit -m "Add interior customization data model and furniture catalog"
```

---

### Task 2: Extract shared interior-layout logic

**Files:**
- Create: `lib/interiorLayout.ts`
- Test manually against: `game/scenes/InteriorScene.ts` (not modified yet — Task 6 switches it
  over to import from here)

**Interfaces:**
- Consumes: `FOOTPRINT`, `hash`, `FurnitureId`, `House`, `FurniturePlacement`, `InteriorLayout`
  from `lib/types.ts`; `CatalogEntry`, `CATALOG_BY_ID` from `lib/catalog.ts`.
- Produces: `FLOOR_FRAMES: number[]`, `WALL_TRIPLES: [number,number,number][]`,
  `SHELF_GY: number`, `SHELF_W: number`, `DECOR_TYPES: FurnitureId[]`,
  `structuralOccupied(w: number, h: number, doorGx: number, shelfGx: number): Set<string>`,
  `footprintCells(gx: number, gy: number, fw: number, fh: number): string[]`,
  `canPlace(layout: InteriorLayout, structural: Set<string>, w: number, h: number, item: CatalogItemId, gx: number, gy: number, skipIndex?: number): boolean`,
  `computeDefaultLayout(house: House, w: number, h: number, doorGx: number, doorGy: number): InteriorLayout`.

This moves the constants and placement logic that currently live inline in
`InteriorScene.ts:9-62` and `InteriorScene.ts:117-224` into a pure, scene-independent module, so
both the scene (rendering) and the new editor (validating edits) use one source of truth instead
of two implementations that can drift apart.

- [ ] **Step 1: Create `lib/interiorLayout.ts`**

```ts
import { FOOTPRINT, hash } from './types';
import type { CatalogItemId, FurnitureId, FurniturePlacement, House, InteriorLayout } from './types';

export const SHELF_SEGMENTS = 3;
export const SHELF_W = SHELF_SEGMENTS * 2;
export const SHELF_GY = 1;

export const FLOOR_FRAMES = [0, 2, 4, 6, 16, 32, 34, 48, 50, 52, 54];
export const WALL_TRIPLES: [number, number, number][] = [
  [42, 56, 70],
  [45, 59, 73],
  [46, 60, 74],
  [47, 61, 75],
];

export const DECOR_TYPES: FurnitureId[] = ['rug', 'desk', 'bed', 'plant', 'lamp', 'chest', 'painting'];

export function footprintCells(gx: number, gy: number, fw: number, fh: number): string[] {
  const cells: string[] = [];
  for (let i = 0; i < fw; i++) {
    for (let j = 0; j < fh; j++) cells.push(`${gx + i},${gy + j}`);
  }
  return cells;
}

// Tiles no placement may ever occupy: perimeter walls, the back wall behind the
// shelf, the fixed 3-segment shelf itself, its approach row, and the clear lane
// from the door up to the shelf. Shared by the default-layout generator and the
// editor's placement validation so they can never disagree about what's free.
export function structuralOccupied(w: number, h: number, doorGx: number, shelfGx: number): Set<string> {
  const occupied = new Set<string>();
  for (let x = 0; x < w; x++) {
    occupied.add(`${x},0`);
    occupied.add(`${x},${SHELF_GY}`);
    occupied.add(`${x},${h - 1}`);
  }
  for (let y = 0; y < h; y++) {
    occupied.add(`0,${y}`);
    occupied.add(`${w - 1},${y}`);
  }
  for (let s = 0; s < SHELF_SEGMENTS; s++) {
    const gx = shelfGx + s * 2;
    for (let dx = 0; dx < 2; dx++) {
      for (let dy = 0; dy < 2; dy++) occupied.add(`${gx + dx},${SHELF_GY + dy}`);
    }
  }
  for (let x = shelfGx; x < shelfGx + SHELF_W; x++) occupied.add(`${x},${SHELF_GY + 2}`);
  for (let y = SHELF_GY + 2; y < h; y++) {
    occupied.add(`${doorGx},${y}`);
    occupied.add(`${doorGx - 1},${y}`);
    occupied.add(`${doorGx + 1},${y}`);
  }
  return occupied;
}

function pickSpot(
  roomW: number,
  fw: number,
  fh: number,
  occupied: Set<string>,
  seed: number,
  minY: number,
  maxY: number,
): [number, number] | null {
  const positions: [number, number][] = [];
  for (let y = minY; y <= maxY - fh; y++) {
    for (let x = 1; x <= roomW - 1 - fw; x++) positions.push([x, y]);
  }
  if (positions.length === 0) return null;
  const start = seed % positions.length;
  for (let i = 0; i < positions.length; i++) {
    const [x, y] = positions[(start + i) % positions.length];
    let free = true;
    for (let dx = 0; dx < fw && free; dx++) {
      for (let dy = 0; dy < fh && free; dy++) {
        if (occupied.has(`${x + dx},${y + dy}`)) free = false;
      }
    }
    if (free) return [x, y];
  }
  return null;
}

export function shelfGxFor(w: number): number {
  return Math.floor((w - SHELF_W) / 2);
}

// Today's deterministic hash-derived layout — used both as the fallback when no
// saved layout exists, and to seed the editor's first draft for an untouched house.
export function computeDefaultLayout(house: House, w: number, h: number, doorGx: number, doorGy: number): InteriorLayout {
  const shelfGx = shelfGxFor(w);
  // Both stored as indices into FLOOR_FRAMES/WALL_TRIPLES, not raw sheet frame
  // numbers — the editor UI picks a swatch by index, and InteriorScene looks the
  // actual frame number up from the same index, so both sides must agree on that.
  const floorFrame = hash(house.id) % FLOOR_FRAMES.length;
  const wallTriple = hash(house.name) % WALL_TRIPLES.length;

  const occupied = structuralOccupied(w, h, doorGx, shelfGx);
  const pending = house.rooms.flatMap((r) => r.notes);
  const placements: FurniturePlacement[] = [];

  for (const type of DECOR_TYPES) {
    const [fw, fh] = FOOTPRINT[type];
    const seed = hash(`${house.id}:${type}`);
    const spot = pickSpot(w, fw, fh, occupied, seed, SHELF_GY + 2, h - 3);
    if (!spot) continue;
    const [dx, dy] = spot;
    const note = type === 'rug' ? undefined : pending.shift();
    for (const cell of footprintCells(dx, dy, fw, fh)) occupied.add(cell);
    placements.push({ item: type, gx: dx, gy: dy, rotation: 0, noteId: note?.id });
  }

  return { floorFrame, wallTriple, placements };
}

// Can `item` be placed at (gx, gy) in `layout`, given the room's structural tiles?
// `skipIndex` excludes one existing placement from the overlap check (moving it).
export function canPlace(
  layout: InteriorLayout,
  catalogById: Record<CatalogItemId, { footprint: [number, number] }>,
  structural: Set<string>,
  w: number,
  h: number,
  item: CatalogItemId,
  gx: number,
  gy: number,
  skipIndex?: number,
): boolean {
  const entry = catalogById[item];
  if (!entry) return false;
  const [fw, fh] = entry.footprint;
  if (gx < 1 || gy < 1 || gx + fw > w - 1 || gy + fh > h - 1) return false;
  const cells = footprintCells(gx, gy, fw, fh);
  if (cells.some((c) => structural.has(c))) return false;
  for (let i = 0; i < layout.placements.length; i++) {
    if (i === skipIndex) continue;
    const p = layout.placements[i];
    const pe = catalogById[p.item];
    if (!pe) continue;
    const pCells = footprintCells(p.gx, p.gy, pe.footprint[0], pe.footprint[1]);
    if (cells.some((c) => pCells.includes(c))) return false;
  }
  return true;
}
```

- [ ] **Step 2: Verify**

Run: `cd ~/Projects/notekeep-town-build && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add lib/interiorLayout.ts
git commit -m "Extract interior layout/placement logic into a shared, pure module"
```

---

### Task 3: Catalog art — wire up unused colour/species frames

**Files:**
- Modify: `game/scenes/BootScene.ts`

**Interfaces:**
- Consumes: `CATALOG` from `lib/catalog.ts`.
- Produces: every `CatalogEntry.frameKey` exists as a named frame on its `textureKey` texture
  after `BootScene.create()` runs (same mechanism the existing single-frame furniture already
  uses, extended to variants).

Rects below are copied verbatim from `docs/ASSETS.md`'s documented colour/species deltas
(`beds.png`: +2 rows per colour; `carpets.png`: cyan at `0,80,48,48`; `lamps.png`: shades across
the row; `plants.png`: other species across the row) — nothing here is guessed.

- [ ] **Step 1: Replace the `FURNITURE_RECT` frame-carving loop in `BootScene.create()`**

In `game/scenes/BootScene.ts`, replace the import and the `create()` frame-carving loop
(lines 2, 6-15, 65-68):

```ts
import Phaser from 'phaser';
import type { FurnitureId } from '@/lib/types';
import { CATALOG } from '@/lib/catalog';

// Pixel rects from the asset manifest, added as a frame named by FurnitureId:
//   this.add.image(px, py, 'furn_bed', 'bed')
const FURNITURE_RECT: Record<FurnitureId, [number, number, number, number]> = {
  desk: [72, 8, 32, 48],
  shelf: [16, 0, 32, 32],
  bed: [0, 0, 32, 32],
  chest: [0, 0, 16, 16],
  plant: [32, 0, 16, 32],
  painting: [48, 32, 16, 16],
  lamp: [0, 0, 16, 32],
  rug: [0, 0, 48, 48],
};

// Colour/species variants beyond the base 8 FurnitureId frames above — rects come
// straight from docs/ASSETS.md's documented deltas, never guessed.
const VARIANT_RECT: Record<string, [number, number, number, number]> = {
  bed_blue: [0, 32, 32, 32],
  bed_green: [0, 64, 32, 32],
  bed_pink: [0, 96, 32, 32],
  bed_yellow: [0, 128, 32, 32],
  bed_red: [0, 160, 32, 32],
  rug_cyan: [0, 80, 48, 48],
  lamp_blue: [32, 0, 16, 32],
  lamp_green: [64, 0, 16, 32],
  lamp_pink: [96, 0, 16, 32],
  lamp_yellow: [128, 0, 16, 32],
  plant_a: [0, 0, 16, 32],
  plant_b: [16, 0, 16, 32],
  plant_c: [48, 0, 16, 32],
  plant_d: [64, 0, 16, 32],
  plant_e: [80, 0, 16, 32],
  plant_f: [96, 0, 16, 32],
};
```

Then in `create()`, replace the existing loop:

```ts
  create() {
    for (const [id, [x, y, w, h]] of Object.entries(FURNITURE_RECT)) {
      const key = `furn_${id}`;
      if (this.textures.exists(key)) this.textures.get(key).add(id, 0, x, y, w, h);
    }
    for (const entry of CATALOG) {
      if (entry.frameKey in FURNITURE_RECT) continue; // already carved above
      const rect = VARIANT_RECT[entry.frameKey];
      if (!rect) continue;
      const [x, y, w, h] = rect;
      if (this.textures.exists(entry.textureKey)) {
        this.textures.get(entry.textureKey).add(entry.frameKey, 0, x, y, w, h);
      }
    }
    // ...rest of create() (animation setup, this.scene.start('TitleScene')) unchanged
```

- [ ] **Step 2: Verify**

Run: `cd ~/Projects/notekeep-town-build && npx tsc --noEmit`
Expected: no new errors.

Run the dev server (`npm run dev`), open the demo town, enter any house, and in the browser
console run:

```js
Object.keys(window.__game.textures.get('furn_bed').frames)
```

Expected: includes `bed`, `bed_blue`, `bed_green`, `bed_pink`, `bed_yellow`, `bed_red` (plus
Phaser's own `__BASE`/`__MISSING`). Repeat for `furn_rug` (expect `rug`, `rug_cyan`), `furn_lamp`
(expect `lamp`, `lamp_blue`, `lamp_green`, `lamp_pink`, `lamp_yellow`), `furn_plant` (expect
`plant`, `plant_a`..`plant_f`).

- [ ] **Step 3: Commit**

```bash
git add game/scenes/BootScene.ts
git commit -m "Wire up unused bed/rug/lamp/plant colour and species variants"
```

---

### Task 4: Persistence layer

**Files:**
- Create: `lib/interiorStore.ts`

**Interfaces:**
- Consumes: `hash` from `lib/types.ts`, `InteriorLayout` from `lib/types.ts`.
- Produces: `vaultFingerprint(vaultName: string, paths: string[]): string`,
  `getLayout(fingerprint: string, houseId: string): InteriorLayout | null`,
  `saveLayout(fingerprint: string, houseId: string, layout: InteriorLayout): void`.

- [ ] **Step 1: Create `lib/interiorStore.ts`**

```ts
import { hash } from './types';
import type { InteriorLayout } from './types';

function storageKey(fingerprint: string, houseId: string): string {
  return `interior:${fingerprint}:${houseId}`;
}

// The File System Access API never exposes a real filesystem path, so a vault's
// identity is approximated by its display name plus its full file listing — two
// different vaults would need an identical name AND an identical set of files to
// collide, which in practice doesn't happen.
export function vaultFingerprint(vaultName: string, paths: string[]): string {
  const sorted = [...paths].sort();
  return String(hash(`${vaultName}\n${sorted.join('\n')}`));
}

export function getLayout(fingerprint: string, houseId: string): InteriorLayout | null {
  try {
    const raw = localStorage.getItem(storageKey(fingerprint, houseId));
    if (!raw) return null;
    return JSON.parse(raw) as InteriorLayout;
  } catch {
    return null;
  }
}

export function saveLayout(fingerprint: string, houseId: string, layout: InteriorLayout): void {
  try {
    localStorage.setItem(storageKey(fingerprint, houseId), JSON.stringify(layout));
  } catch {
    // Storage full or unavailable (private browsing) — the layout just won't persist.
  }
}
```

- [ ] **Step 2: Verify**

Run: `cd ~/Projects/notekeep-town-build && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add lib/interiorStore.ts
git commit -m "Add localStorage persistence for interior layouts"
```

---

### Task 5: Publish the vault fingerprint

**Files:**
- Modify: `lib/vault/open.ts`

**Interfaces:**
- Consumes: `vaultFingerprint` from `lib/interiorStore.ts`.
- Produces: `game.registry.get('vaultFingerprint')` is set to a string immediately after
  `game.registry.get('world')` is set, in both `openVault()` and `openDemoVault()`.

- [ ] **Step 1: Compute and publish the fingerprint in `openVault()`**

In `lib/vault/open.ts`, add the import:

```ts
import { vaultFingerprint } from '@/lib/interiorStore';
```

Change `publishWorld` (lines 10-19) to also publish the fingerprint:

```ts
function publishWorld(world: WorldModel, fingerprint: string) {
  const attempt = () => {
    const game = (window as any).__game;
    if (!game?.registry) return false;
    game.registry.set('world', world);
    game.registry.set('vaultFingerprint', fingerprint);
    return true;
  };
  if (attempt()) return;
  const timer = setInterval(() => { if (attempt()) clearInterval(timer); }, 100);
}
```

In `openVault()` (around line 74-77), compute the fingerprint from the already-built `paths` and
pass it through:

```ts
  const world = await parseVault(dir.name, paths, async (p) =>
    (await getFile(p)).slice(0, HEAD_BYTES).text(),
  );
  publishWorld(world, vaultFingerprint(dir.name, paths));
```

- [ ] **Step 2: Do the same in `openDemoVault()`**

Around line 111-112:

```ts
  const world = await parseVault(DEMO_VAULT_NAME, paths, async (p) => getText(p).slice(0, HEAD_BYTES));
  publishWorld(world, vaultFingerprint(DEMO_VAULT_NAME, paths));
```

- [ ] **Step 3: Verify**

Run: `cd ~/Projects/notekeep-town-build && npx tsc --noEmit`
Expected: no new errors.

Run the dev server, open the demo town, and in the browser console run
`window.__game.registry.get('vaultFingerprint')`. Expected: a numeric string, not `undefined`.

- [ ] **Step 4: Commit**

```bash
git add lib/vault/open.ts
git commit -m "Publish a vault fingerprint for interior-layout persistence"
```

---

### Task 6: Bus events

**Files:**
- Modify: `game/bus.ts`

**Interfaces:**
- Consumes: `InteriorLayout` from `lib/types.ts`.
- Produces: `bus.on('open-interior-editor', ...)`, `bus.on('close-interior-editor', ...)`,
  `bus.on('commit-interior-layout', ...)` all valid, typed calls.

- [ ] **Step 1: Add the three events to `BusEvents`**

```ts
import type { InteriorLayout, NoteRef } from '@/lib/types';

type BusEvents = {
  'enter-house': { houseId: string };
  'exit-house': undefined;
  'open-note': { note: NoteRef };
  'close-note': undefined;
  'open-shelf': { houseId: string };
  'close-shelf': undefined;
  'talk-npc': { npcId: string; line: string };
  'open-interior-editor': { houseId: string; w: number; h: number; doorGx: number; doorGy: number; layout: InteriorLayout };
  'close-interior-editor': undefined;
  'commit-interior-layout': { houseId: string; layout: InteriorLayout };
};
```

(Everything below this type — `Callback`, `listeners`, `on`/`off`/`emit`, `export const bus`
— is generic over `BusEvents` already and needs no change.)

- [ ] **Step 2: Verify**

Run: `cd ~/Projects/notekeep-town-build && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add game/bus.ts
git commit -m "Add interior-editor bus events"
```

---

### Task 7: `InteriorScene` — render persisted layouts, add the Customize prompt

**Files:**
- Modify: `game/scenes/InteriorScene.ts`

**Interfaces:**
- Consumes: `computeDefaultLayout`, `structuralOccupied`, `shelfGxFor`, `SHELF_GY`, `SHELF_W`,
  `SHELF_SEGMENTS`, `FLOOR_FRAMES`, `WALL_TRIPLES` from `lib/interiorLayout.ts`; `getLayout`,
  `saveLayout` from `lib/interiorStore.ts`; `CATALOG_BY_ID` from `lib/catalog.ts`;
  `InteriorLayout`, `FurniturePlacement` from `lib/types.ts`.
- Produces: no change to this scene's external behavior when no saved layout exists; when one
  does, floor/walls/furniture render from it instead of the hash-derived defaults.

- [ ] **Step 1: Replace the local constants and imports at the top of the file**

Replace lines 1-25 of `game/scenes/InteriorScene.ts`:

```ts
import Phaser from 'phaser';
import { bus } from '@/game/bus';
import { GridMovement, TILE, tileToWorld, worldToTile, type Walkable } from '@/game/gridMovement';
import { dressPlayer } from '@/game/playerSprite';
import type { House, NoteRef, WorldModel, InteriorLayout, FurniturePlacement } from '@/lib/types';
import {
  SHELF_SEGMENTS,
  SHELF_GY,
  SHELF_W,
  FLOOR_FRAMES,
  WALL_TRIPLES,
  shelfGxFor,
  computeDefaultLayout,
} from '@/lib/interiorLayout';
import { getLayout, saveLayout } from '@/lib/interiorStore';
import { CATALOG_BY_ID } from '@/lib/catalog';

// The room is the whole viewport, whatever size the window is (never smaller than this).
const MIN_ROOM_W = 20;
const MIN_ROOM_H = 15;

function findHouse(world: WorldModel | undefined, houseId: string): House | undefined {
  if (!world) return undefined;
  for (const region of world.regions) {
    const house = region.houses.find((h) => h.id === houseId);
    if (house) return house;
  }
  return undefined;
}
```

This removes the now-duplicated `pickSpot`/`DECOR_TYPES`/`SHELF_*`/`FLOOR_FRAMES`/`WALL_TRIPLES`
definitions (they now live in `lib/interiorLayout.ts`, imported instead) and the `FOOTPRINT`
import (no longer used directly — `CATALOG_BY_ID` carries footprints now).

- [ ] **Step 2: Add editor state to the class**

In the class body, alongside the existing `shelfOpen`/`noteOpen`/`exiting` fields (around line
80-84), add:

```ts
  private editingLayout = false;
  private fingerprint: string | undefined;
  private layout!: InteriorLayout;

  private onCloseEditor = () => {
    this.editingLayout = false;
  };

  private onCommitLayout = ({ houseId, layout }: { houseId: string; layout: InteriorLayout }) => {
    if (houseId !== this.houseId || !this.fingerprint) return;
    saveLayout(this.fingerprint, houseId, layout);
    this.scene.restart({ houseId: this.houseId });
  };
```

In `init()` (line 98-106), reset it alongside the other flags:

```ts
  init(data: { houseId: string }) {
    this.houseId = data.houseId;
    this.shelfOpen = false;
    this.noteOpen = false;
    this.exiting = false;
    this.editingLayout = false;
    this.blocked = new Set();
    this.shelfApproach = new Set();
    this.approach = new Map();
  }
```

- [ ] **Step 3: Compute the effective layout in `create()`, replace the floor/wall/decor loops**

Replace lines 117-224 of the original `create()` (room sizing through the decor-placement loop)
with:

```ts
    const w = Math.max(MIN_ROOM_W, Math.ceil(this.scale.width / TILE));
    const h = Math.max(MIN_ROOM_H, Math.ceil(this.scale.height / TILE));
    this.doorGx = Math.floor(w / 2);
    this.doorGy = h - 1;
    this.shelfGx = shelfGxFor(w);

    this.fingerprint = this.game.registry.get('vaultFingerprint') as string | undefined;
    const saved = this.fingerprint ? getLayout(this.fingerprint, this.houseId) : null;
    this.layout = saved ?? computeDefaultLayout(house, w, h, this.doorGx, this.doorGy);

    const noteCount = house.rooms.reduce((n, r) => n + r.notes.length, 0);
    // this.layout.floorFrame/wallTriple are indices into FLOOR_FRAMES/WALL_TRIPLES
    // (see lib/interiorLayout.ts's computeDefaultLayout) — look up the real frame
    // number/triple here, never store the raw frame number in the layout itself.
    const floorFrame = FLOOR_FRAMES[this.layout.floorFrame] ?? FLOOR_FRAMES[0];
    const [wallTop, wallMid, wallBase] = WALL_TRIPLES[this.layout.wallTriple] ?? WALL_TRIPLES[0];

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        this.add.image(x * TILE, y * TILE, 'interior-floor', floorFrame).setOrigin(0, 0).setDepth(0);

        const isExitDoor = x === this.doorGx && y === this.doorGy;
        const isPerimeter = x === 0 || y === 0 || x === w - 1 || y === h - 1;
        if (!isPerimeter || isExitDoor) continue;

        let frame = wallMid;
        if (y === 0) frame = wallTop;
        else if (y === h - 1) frame = wallBase;
        this.add.image(x * TILE, y * TILE, 'interior-walls', frame).setOrigin(0, 0).setDepth(1);
      }
    }

    // Back wall gets a second row so the shelf has something to lean on.
    for (let x = 1; x < w - 1; x++) {
      this.add.image(x * TILE, SHELF_GY * TILE, 'interior-walls', wallBase).setOrigin(0, 0).setDepth(1);
      this.blocked.add(`${x},${SHELF_GY}`);
    }

    // Bookshelf: three verified 32x32 shelf frames side by side, rows SHELF_GY..SHELF_GY+1.
    for (let s = 0; s < SHELF_SEGMENTS; s++) {
      const gx = this.shelfGx + s * 2;
      const img = this.add
        .image(gx * TILE, SHELF_GY * TILE, 'furn_shelf', 'shelf')
        .setOrigin(0, 0)
        .setDepth(5)
        .setInteractive({ useHandCursor: true });
      img.on('pointerdown', () => this.openShelf());
      for (let dx = 0; dx < 2; dx++) {
        for (let dy = 0; dy < 2; dy++) this.blocked.add(`${gx + dx},${SHELF_GY + dy}`);
      }
    }
    for (let x = this.shelfGx; x < this.shelfGx + SHELF_W; x++) {
      this.shelfApproach.add(`${x},${SHELF_GY + 2}`);
    }

    this.add
      .text((this.shelfGx + SHELF_W / 2) * TILE, 3, `${house.name} · ${noteCount}`, {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#ffffff',
        backgroundColor: '#000000',
      })
      .setOrigin(0.5, 0)
      .setDepth(6);

    this.add
      .text((this.shelfGx + SHELF_W / 2) * TILE, 13, 'CUSTOMIZE', {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#ffe066',
        backgroundColor: '#000000',
      })
      .setOrigin(0.5, 0)
      .setDepth(6)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.openEditor());

    const allNotes = house.rooms.flatMap((r) => r.notes);
    for (const placement of this.layout.placements) {
      this.renderPlacement(placement, allNotes);
    }
```

- [ ] **Step 4: Add the `renderPlacement` method**

Add as a new private method on the class (near `openNote`/`openShelf`):

```ts
  private renderPlacement(placement: FurniturePlacement, allNotes: NoteRef[]) {
    const entry = CATALOG_BY_ID[placement.item];
    if (!entry) return;
    const [fw, fh] = entry.footprint;
    const { gx, gy, rotation } = placement;
    const isRug = entry.category === 'rug';

    const img = this.add
      .image(gx * TILE, gy * TILE, entry.textureKey, entry.frameKey)
      .setOrigin(0, 0)
      .setDepth(isRug ? 2 : 5);

    if (entry.rotations.length > 2) img.setAngle(rotation);
    else if (rotation === 180) img.setFlipX(true);

    for (let i = 0; i < fw; i++) {
      for (let j = 0; j < fh; j++) {
        const key = `${gx + i},${gy + j}`;
        if (!isRug) this.blocked.add(key);
      }
    }

    const note = placement.noteId ? allNotes.find((n) => n.id === placement.noteId) : undefined;
    if (note) {
      img.setInteractive({ useHandCursor: true });
      img.on('pointerdown', () => this.openNote(note));
      const apKey = `${gx + Math.floor(fw / 2)},${gy + fh}`;
      this.approach.set(apKey, note);
    }
  }
```

- [ ] **Step 5: Add `openEditor()` and wire the new bus listeners**

Add the method near `openShelf()`:

```ts
  private openEditor() {
    if (this.shelfOpen || this.noteOpen || this.exiting || this.editingLayout) return;
    this.editingLayout = true;
    bus.emit('open-interior-editor', {
      houseId: this.houseId,
      w: Math.max(MIN_ROOM_W, Math.ceil(this.scale.width / TILE)),
      h: Math.max(MIN_ROOM_H, Math.ceil(this.scale.height / TILE)),
      doorGx: this.doorGx,
      doorGy: this.doorGy,
      layout: this.layout,
    });
  }
```

In `create()`, extend the existing `bus.on`/`bus.off` block (original lines 268-273):

```ts
    bus.on('close-shelf', this.onCloseShelf);
    bus.on('close-note', this.onCloseNote);
    bus.on('close-interior-editor', this.onCloseEditor);
    bus.on('commit-interior-layout', this.onCommitLayout);
    this.events.once('shutdown', () => {
      bus.off('close-shelf', this.onCloseShelf);
      bus.off('close-note', this.onCloseNote);
      bus.off('close-interior-editor', this.onCloseEditor);
      bus.off('commit-interior-layout', this.onCommitLayout);
    });
```

- [ ] **Step 6: Gate `update()` on `editingLayout`**

In `update()` (original line 290), change:

```ts
    if (this.shelfOpen || this.noteOpen || this.exiting) return;
```

to:

```ts
    if (this.shelfOpen || this.noteOpen || this.exiting || this.editingLayout) return;
```

- [ ] **Step 7: Verify**

Run: `cd ~/Projects/notekeep-town-build && npx tsc --noEmit`
Expected: no new errors.

Run the dev server, open the demo town, enter a house. Expected: renders identically to before
this task (no saved layout exists yet, so `computeDefaultLayout` reproduces the old hash-derived
result) and a "CUSTOMIZE" label appears near the shelf (clicking it does nothing yet — the
editor component doesn't exist until Task 8 — but it shouldn't throw).

- [ ] **Step 8: Commit**

```bash
git add game/scenes/InteriorScene.ts
git commit -m "InteriorScene: render persisted layouts, add Customize prompt"
```

---

### Task 8: `InteriorEditor` React overlay

**Files:**
- Create: `components/InteriorEditor.tsx`

**Interfaces:**
- Consumes: `bus` from `game/bus.ts`; `CATALOG`, `CATALOG_BY_ID` from `lib/catalog.ts`;
  `canPlace`, `structuralOccupied`, `shelfGxFor` from `lib/interiorLayout.ts`; `InteriorLayout`,
  `FurniturePlacement`, `CatalogItemId` from `lib/types.ts`.
- Produces: a mounted `<InteriorEditor />` that listens for `open-interior-editor` and renders a
  modal; emits `commit-interior-layout` and `close-interior-editor`.

- [ ] **Step 1: Create the component**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { bus } from '@/game/bus';
import { CATALOG, CATALOG_BY_ID } from '@/lib/catalog';
import { canPlace, structuralOccupied, shelfGxFor, FLOOR_FRAMES, WALL_TRIPLES } from '@/lib/interiorLayout';
import type { CatalogItemId, FurniturePlacement, InteriorLayout } from '@/lib/types';

type Session = { houseId: string; w: number; h: number; doorGx: number; doorGy: number };

export default function InteriorEditor() {
  const [session, setSession] = useState<Session | null>(null);
  const [draft, setDraft] = useState<InteriorLayout | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [picking, setPicking] = useState<{ gx: number; gy: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<Session | null>(null);

  useEffect(() => {
    const onOpen = (payload: Session & { layout: InteriorLayout }) => {
      const { layout, ...s } = payload;
      sessionRef.current = s;
      setSession(s);
      setDraft(layout);
      setSelected(null);
      setPicking(null);
      setError(null);
    };
    bus.on('open-interior-editor', onOpen);
    return () => bus.off('open-interior-editor', onOpen);
  }, []);

  // Capture phase, following NoteReader's convention, so Escape beats Phaser's own listeners.
  useEffect(() => {
    if (!session) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  function close() {
    setSession(null);
    setDraft(null);
    bus.emit('close-interior-editor', undefined);
  }

  function save() {
    if (!session || !draft) return;
    bus.emit('commit-interior-layout', { houseId: session.houseId, layout: draft });
    setSession(null);
    setDraft(null);
    bus.emit('close-interior-editor', undefined);
  }

  if (!session || !draft) return null;

  const { w, h, doorGx } = session;
  const shelfGx = shelfGxFor(w);
  const structural = structuralOccupied(w, h, doorGx, shelfGx);

  function cellPlacementIndex(gx: number, gy: number): number | null {
    for (let i = 0; i < draft.placements.length; i++) {
      const p = draft.placements[i];
      const entry = CATALOG_BY_ID[p.item];
      if (!entry) continue;
      const [fw, fh] = entry.footprint;
      if (gx >= p.gx && gx < p.gx + fw && gy >= p.gy && gy < p.gy + fh) return i;
    }
    return null;
  }

  function onCellClick(gx: number, gy: number) {
    setError(null);
    if (structural.has(`${gx},${gy}`)) return;
    const idx = cellPlacementIndex(gx, gy);
    if (idx !== null) {
      setSelected(idx);
      setPicking(null);
    } else {
      setSelected(null);
      setPicking({ gx, gy });
    }
  }

  function placeItem(item: CatalogItemId) {
    if (!picking || !draft) return;
    if (!canPlace(draft, CATALOG_BY_ID, structural, w, h, item, picking.gx, picking.gy)) {
      setError("Doesn't fit there.");
      return;
    }
    const placement: FurniturePlacement = { item, gx: picking.gx, gy: picking.gy, rotation: 0 };
    setDraft({ ...draft, placements: [...draft.placements, placement] });
    setPicking(null);
  }

  function removeSelected() {
    if (selected === null || !draft) return;
    setDraft({ ...draft, placements: draft.placements.filter((_, i) => i !== selected) });
    setSelected(null);
  }

  function rotateSelected() {
    if (selected === null || !draft) return;
    const p = draft.placements[selected];
    const entry = CATALOG_BY_ID[p.item];
    if (!entry) return;
    const options = entry.rotations;
    const next = options[(options.indexOf(p.rotation) + 1) % options.length];
    const placements = draft.placements.slice();
    placements[selected] = { ...p, rotation: next };
    setDraft({ ...draft, placements });
  }

  function swapSelected(item: CatalogItemId) {
    if (selected === null || !draft) return;
    const placements = draft.placements.slice();
    placements[selected] = { ...placements[selected], item, rotation: 0 };
    setDraft({ ...draft, placements });
  }

  const selectedPlacement = selected !== null ? draft.placements[selected] : null;
  const selectedCategory = selectedPlacement ? CATALOG_BY_ID[selectedPlacement.item]?.category : null;

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={close}
    >
      <div
        className="flex max-h-[90vh] flex-col gap-3 rounded bg-neutral-900 p-4 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm uppercase tracking-wide text-neutral-300">Customize interior</span>
          <div className="flex gap-2">
            <button className="rounded border border-white px-3 py-1 text-sm" onClick={close}>
              Cancel
            </button>
            <button className="rounded bg-white px-3 py-1 text-sm text-black" onClick={save}>
              Save
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <span className="text-xs uppercase text-neutral-400">Floor</span>
          {FLOOR_FRAMES.map((frame, i) => (
            <button
              key={frame}
              className={`h-6 w-6 border ${draft.floorFrame === i ? 'border-yellow-400' : 'border-neutral-600'}`}
              style={{
                // floor.png is 128x128, 8 cols x 8 rows of 16px tiles (docs/ASSETS.md).
                backgroundImage: "url('/assets/interior/floor.png')",
                backgroundPosition: `${-(frame % 8) * 16}px ${-Math.floor(frame / 8) * 16}px`,
                imageRendering: 'pixelated',
              }}
              onClick={() => setDraft({ ...draft, floorFrame: i })}
            />
          ))}
        </div>
        <div className="flex gap-2">
          <span className="text-xs uppercase text-neutral-400">Wallpaper</span>
          {WALL_TRIPLES.map((triple, i) => (
            <button
              key={i}
              className={`h-6 w-6 border ${draft.wallTriple === i ? 'border-yellow-400' : 'border-neutral-600'}`}
              style={{
                // walls.png is 224x96, 14 cols x 6 rows of 16px tiles (docs/ASSETS.md).
                backgroundImage: "url('/assets/interior/walls.png')",
                backgroundPosition: `${-(triple[1] % 14) * 16}px ${-Math.floor(triple[1] / 14) * 16}px`,
                imageRendering: 'pixelated',
              }}
              onClick={() => setDraft({ ...draft, wallTriple: i })}
            />
          ))}
        </div>

        <div
          className="relative grid border border-neutral-700"
          style={{ gridTemplateColumns: `repeat(${w}, 14px)`, gridTemplateRows: `repeat(${h}, 14px)` }}
        >
          {Array.from({ length: h }).map((_, gy) =>
            Array.from({ length: w }).map((_, gx) => {
              const idx = cellPlacementIndex(gx, gy);
              const isStructural = structural.has(`${gx},${gy}`);
              const isDoor = gx === doorGx && gy === session.doorGy;
              return (
                <button
                  key={`${gx},${gy}`}
                  className="border border-neutral-800 text-[8px]"
                  style={{
                    background: isDoor ? '#8a5a2a' : isStructural ? '#333' : idx !== null ? '#5a7a5a' : '#1a1a1a',
                    cursor: isStructural ? 'default' : 'pointer',
                  }}
                  disabled={isStructural}
                  onClick={() => onCellClick(gx, gy)}
                  title={idx !== null ? draft.placements[idx].item : ''}
                />
              );
            }),
          )}
        </div>

        {error && <span className="text-xs text-red-400">{error}</span>}

        {picking && (
          <div className="flex flex-wrap gap-2">
            <span className="text-xs uppercase text-neutral-400">Place:</span>
            {CATALOG.map((entry) => (
              <button
                key={entry.id}
                className="rounded border border-neutral-600 px-2 py-1 text-xs"
                onClick={() => placeItem(entry.id)}
              >
                {entry.id}
              </button>
            ))}
          </div>
        )}

        {selectedPlacement && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase text-neutral-400">Selected: {selectedPlacement.item}</span>
            <button className="rounded border border-neutral-600 px-2 py-1 text-xs" onClick={rotateSelected}>
              Rotate
            </button>
            <button className="rounded border border-neutral-600 px-2 py-1 text-xs" onClick={removeSelected}>
              Remove
            </button>
            {CATALOG.filter((e) => e.category === selectedCategory && e.id !== selectedPlacement.item).map((e) => (
              <button
                key={e.id}
                className="rounded border border-neutral-600 px-2 py-1 text-xs"
                onClick={() => swapSelected(e.id)}
              >
                {e.id}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `cd ~/Projects/notekeep-town-build && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/InteriorEditor.tsx
git commit -m "Add the interior customization editor overlay"
```

---

### Task 9: Mount the editor

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: default export from `components/InteriorEditor.tsx`.

- [ ] **Step 1: Import and mount it alongside the other overlays**

In `app/page.tsx`, add the import near the other component imports (line 6-8):

```ts
import InteriorEditor from '@/components/InteriorEditor';
```

Add it to the JSX near `<Bookshelf />`/`<NoteReader ... />` (line 56-58):

```tsx
      <CharacterCreator visible={!vault} />
      <Bookshelf />
      <NoteReader note={openNote} />
      <InteriorEditor />
```

- [ ] **Step 2: Verify**

Run: `cd ~/Projects/notekeep-town-build && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "Mount the interior editor overlay"
```

---

### Task 10: End-to-end manual verification

No automated tests exist for this project; this task is the acceptance check from the spec.

- [ ] **Step 1:** `npm run dev`, open the demo town, enter a house, click "CUSTOMIZE".
- [ ] **Step 2:** Place a new item from the catalog into an empty cell; confirm it's rejected
      with the inline error when you try to place something where it doesn't fit (e.g. onto an
      already-occupied cell or over the shelf/door).
- [ ] **Step 3:** Select an existing placement, rotate it, remove it, and swap it for a same-category
      variant (e.g. `bed` → `bed_blue`).
- [ ] **Step 4:** Change the wallpaper and flooring swatches, then Save. Confirm the room
      re-renders with the new floor/wall/furniture immediately (scene restart).
- [ ] **Step 5:** Reload the page, reopen the demo town, re-enter the same house. Confirm the
      customized layout is still there (persistence survived a reload).
- [ ] **Step 6:** Open a second vault (a different local folder, or the demo vault again after
      picking a different named folder) and enter one of its houses. Confirm it shows its own
      default layout, unaffected by the first vault's saved layout (fingerprint isolation).
- [ ] **Step 7:** Confirm a note that was originally attached to a piece of decor is still
      reachable via the bookshelf after removing that piece of decor in the editor.
- [ ] **Step 8:** `cd ~/Projects/notekeep-town-build && npx tsc --noEmit && npm run build` — both
      must succeed cleanly.
