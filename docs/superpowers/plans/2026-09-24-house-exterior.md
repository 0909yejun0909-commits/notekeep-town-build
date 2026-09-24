# Customizable House Exterior Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a player click a house on the overworld map and pick which of the 5 Kenmi building
sprites represents it, validated in place against neighboring houses, with the choice persisted
per vault and never touching the house's position or its interior.

**Architecture:** `HOUSE_FOOTPRINT`/`HOUSE_DOOR` currently live duplicated in
`lib/vault/parse.ts` and `game/tilemap.ts` (as `HOUSE_DATA`); both get consolidated into one new
`lib/houseCatalog.ts`, which also gains the overlap validator `canPlaceHouseVariant` the new
feature needs. `game/tilemap.ts`'s `buildHouses()` returns each house's `Phaser.GameObjects.Image`
so `OverworldScene` can wire click handling without `buildHouses()` needing scene-level editor
state. A new `lib/exteriorStore.ts` (mirrors `lib/interiorStore.ts` exactly) persists the chosen
variant per `(vaultFingerprint, houseId)` in `localStorage`. `OverworldScene.create()` applies any
saved override to `house.variant` in place, before `regionSize()`/`buildHouses()` run — both
already read `house.variant` fresh, so roads/blocked-tiles/decoration adapt with no further
change. A new `ExteriorEditor` React component (mounted in `app/page.tsx` like the existing
`InteriorEditor`) shows a 5-thumbnail picker driven by `game/bus.ts` events, validates locally
with `canPlaceHouseVariant`, and on a valid pick emits a commit event that saves to
`localStorage` and restarts `OverworldScene`.

**Tech Stack:** Next.js App Router, TypeScript, Phaser 3.90, React (client component), no new
dependencies.

**Spec:** `docs/superpowers/specs/2026-09-22-house-exterior-design.md`

## Global Constraints

- No new npm dependencies.
- No test suite exists in this repo and none should be added (project convention) —
  verification is `npx tsc --noEmit` / `npm run build` / manual browser checks, not automated
  tests.
- A house's `gx`/`gy` (grid position) never changes. Only its `variant` (and therefore its
  footprint/sprite/door position) changes, or the change is refused.
- The only validation needed is house-to-house overlap with `HOUSE_GAP` clearance — the region
  canvas itself always auto-grows via `regionSize()`'s existing `Math.max` logic, so there is no
  separate "region edge" rejection case (see the spec's "A correction made while speccing this
  out" section).
- The interior (`InteriorLayout`: room size, furniture, wallpaper, floor, shelf) is a completely
  separate system from a house's `variant` and this feature must not touch it.
- No new art — all 5 variants (`house-0`..`house-4`, `/assets/buildings/house_{n}.png`) are
  already loaded by `BootScene.ts`.
- `HOUSE_FOOTPRINT`/`HOUSE_DOOR` currently exist as two independent copies (`lib/vault/parse.ts`
  and `game/tilemap.ts`'s `HOUSE_DATA`) with identical values — consolidate into one source of
  truth, `lib/houseCatalog.ts`, values unchanged.

## Review Focus

- **Overlapping pick is blocked with the exact error and mutates nothing** — the region, the
  house's own footprint, and the saved store must all be unchanged after a rejected pick.
- **A house's new, larger footprint growing over the player's own current tile** — after the
  `OverworldScene` restart that follows a commit, the existing spawn-search loop (which already
  nudges the spawn point off `blocked`/`doors` tiles) must still land the player on a walkable
  tile, not inside the new building.
- **The editor must reflect an already-applied saved override, not the original parsed variant**
  — `OverworldScene.create()` applies any saved override to `house.variant` before anything else
  runs, so `currentVariant` sent to the editor is always the live value, including on a house
  that already has a saved override from a previous session.
- **One region's footprint growing shifts every region's shared map origin** (the documented,
  pre-existing side effect of `OverworldScene`'s single shared `cellW`/`cellH` across all
  regions) — after a variant change that grows a region, every region must still render without
  overlapping, with correct roads and decoration.
- **Persistence survives a full reload** — closing and reopening the same vault (same
  `vaultFingerprint`) must re-apply the saved variant before `regionSize()`/`buildHouses()` run,
  not after, matching the ordering already required by the correctness of the previous point.

---

### Task 1: `lib/houseCatalog.ts` — consolidate house data, add the overlap validator

**Files:**
- Create: `lib/houseCatalog.ts`
- Modify: `lib/vault/parse.ts:1-18`
- Modify: `game/tilemap.ts:1-58`

**Interfaces:**
- Consumes: `House` (from `lib/types.ts`).
- Produces: `HOUSE_FOOTPRINT: Record<number, [number, number]>`,
  `HOUSE_DOOR: Record<number, [number, number]>`, `HOUSE_VARIANTS: readonly [0,1,2,3,4]`,
  `REGION_MARGIN: number`, `HOUSE_GAP: number`,
  `canPlaceHouseVariant(house: Pick<House,'id'|'gx'|'gy'>, newVariant: number, siblingHouses: Array<Pick<House,'id'|'gx'|'gy'|'variant'>>): boolean`
  — all from `lib/houseCatalog.ts`, used by Task 2 (`game/tilemap.ts`), Task 5
  (`game/scenes/OverworldScene.ts`), and Task 6 (`components/ExteriorEditor.tsx`).

This task is a pure refactor — behavior must be identical before and after (same house sizes,
same door tiles, same region layout math). The overlap validator is new code, but nothing calls
it yet.

- [ ] **Step 1: Create `lib/houseCatalog.ts`**

```ts
import type { House } from './types';

// Building sprite size in tiles per variant, and the lower door tile, from the manifest.
// The single source of truth — lib/vault/parse.ts and game/tilemap.ts both import from here
// instead of keeping their own copies.
export const HOUSE_FOOTPRINT: Record<number, [number, number]> = {
  0: [6, 8], 1: [9, 8], 2: [9, 8], 3: [7, 6], 4: [12, 8],
};
export const HOUSE_DOOR: Record<number, [number, number]> = {
  0: [2, 6], 1: [2, 6], 2: [5, 6], 3: [2, 4], 4: [5, 6],
};
export const HOUSE_VARIANTS = [0, 1, 2, 3, 4] as const;
export const REGION_MARGIN = 2;
export const HOUSE_GAP = 3;

// Would `house` (at its existing, fixed gx/gy) fit as `newVariant` without overlapping any
// other house in the same region, with the same HOUSE_GAP clearance the original layout packer
// used? The region canvas itself always auto-grows to fit (regionSize() takes a fresh max over
// every house's current footprint on every load), so there is no separate "region edge" case to
// check here — only house-to-house overlap.
export function canPlaceHouseVariant(
  house: Pick<House, 'id' | 'gx' | 'gy'>,
  newVariant: number,
  siblingHouses: Array<Pick<House, 'id' | 'gx' | 'gy' | 'variant'>>,
): boolean {
  const [nw, nh] = HOUSE_FOOTPRINT[newVariant];
  for (const other of siblingHouses) {
    if (other.id === house.id) continue;
    const [ow, oh] = HOUSE_FOOTPRINT[other.variant];
    const overlaps =
      house.gx - HOUSE_GAP < other.gx + ow &&
      house.gx + nw + HOUSE_GAP > other.gx &&
      house.gy - HOUSE_GAP < other.gy + oh &&
      house.gy + nh + HOUSE_GAP > other.gy;
    if (overlaps) return false;
  }
  return true;
}
```

- [ ] **Step 2: Point `lib/vault/parse.ts` at the new catalog**

In `lib/vault/parse.ts`, replace lines 1-18 (the imports and the `HOUSE_FOOTPRINT`/`HOUSE_DOOR`/
`REGION_MARGIN`/`HOUSE_GAP` definitions) with:

```ts
import type { House, NoteRef, Region, Room, WorldModel } from '@/lib/types';
import { BIOMES, FOOTPRINT, FURNITURE, hash } from '@/lib/types';
import { HOUSE_FOOTPRINT, HOUSE_DOOR, REGION_MARGIN, HOUSE_GAP } from '@/lib/houseCatalog';

export const MAX_NOTES_PER_ROOM = 30;

const ROOT_ID = '.';
const MAIN = 'Main';
const ROOM_CLEAR_ROWS = 3;
```

Nothing else in `lib/vault/parse.ts` changes — `layoutRegion()` and `regionSize()` already
reference `HOUSE_FOOTPRINT`, `REGION_MARGIN`, and `HOUSE_GAP` by name, and those names now
resolve to the imported values instead of local consts, with identical numbers.

- [ ] **Step 3: Point `game/tilemap.ts` at the new catalog**

In `game/tilemap.ts`, replace lines 1-12 (the imports and the `HOUSE_DATA` constant) with:

```ts
import type { Region } from '@/lib/types';
import { hash } from '@/lib/types';
import { HOUSE_FOOTPRINT, HOUSE_DOOR } from '@/lib/houseCatalog';

const TILE = 16;
```

Then in `buildHouses()`, replace:

```ts
  for (const house of region.houses) {
    const data = HOUSE_DATA[house.variant] ?? HOUSE_DATA[0];
    const gx = originGx + house.gx;
    const gy = originGy + house.gy;

    scene.add
      .image(gx * TILE, gy * TILE, `house-${house.variant}`)
      .setOrigin(0, 0)
      .setDepth((gy + data.h) * TILE);

    for (let y = 0; y < data.h - 1; y++) {
      for (let x = 0; x < data.w; x++) {
        blocked.add(key(gx + x, gy + y));
      }
    }

    const entryX = gx + data.door[0];
    const entryY = gy + data.door[1] + 1;
    blocked.delete(key(entryX, entryY));
    doors.set(key(entryX, entryY), house.id);
    entries.push({ gx: entryX, gy: entryY, houseId: house.id });
  }
```

with:

```ts
  for (const house of region.houses) {
    const [w, h] = HOUSE_FOOTPRINT[house.variant] ?? HOUSE_FOOTPRINT[0];
    const [doorX, doorY] = HOUSE_DOOR[house.variant] ?? HOUSE_DOOR[0];
    const gx = originGx + house.gx;
    const gy = originGy + house.gy;

    scene.add
      .image(gx * TILE, gy * TILE, `house-${house.variant}`)
      .setOrigin(0, 0)
      .setDepth((gy + h) * TILE);

    for (let y = 0; y < h - 1; y++) {
      for (let x = 0; x < w; x++) {
        blocked.add(key(gx + x, gy + y));
      }
    }

    const entryX = gx + doorX;
    const entryY = gy + doorY + 1;
    blocked.delete(key(entryX, entryY));
    doors.set(key(entryX, entryY), house.id);
    entries.push({ gx: entryX, gy: entryY, houseId: house.id });
  }
```

- [ ] **Step 4: Verify**

Run: `cd ~/Projects/notekeep-town-build && npx tsc --noEmit`
Expected: clean, no errors.

Run: `cd ~/Projects/notekeep-town-build && npm run dev`, open the demo town.
Expected: every region/house renders at exactly the same size, position, and sprite as before
this change — this step is a refactor, not a behavior change.

- [ ] **Step 5: Commit**

```bash
git add lib/houseCatalog.ts lib/vault/parse.ts game/tilemap.ts
git commit -m "Consolidate house footprint/door data into lib/houseCatalog.ts"
```

---

### Task 2: `game/tilemap.ts` — interactive house sprites

**Files:**
- Modify: `game/tilemap.ts`

**Interfaces:**
- Consumes: `HOUSE_FOOTPRINT`, `HOUSE_DOOR` (from Task 1).
- Produces: `TilemapResult.houseImages: Map<string, Phaser.GameObjects.Image>` (keyed by
  `house.id`) — consumed by Task 5 (`game/scenes/OverworldScene.ts`), which is the one that
  calls `.setInteractive()`/`.on('pointerdown', ...)` on each image, since only the scene has
  the click-gating state (`editingExterior`) and the sibling-house list the click handler needs.

- [ ] **Step 1: Add `houseImages` to `TilemapResult` and populate it in `buildHouses()`**

In `game/tilemap.ts`, change:

```ts
export type TilemapResult = {
  blocked: Set<string>;
  doors: Map<string, string>;
  entries: Entry[];
};
```

to:

```ts
export type TilemapResult = {
  blocked: Set<string>;
  doors: Map<string, string>;
  entries: Entry[];
  houseImages: Map<string, Phaser.GameObjects.Image>;
};
```

Then in `buildHouses()`, add a `houseImages` map alongside the existing `blocked`/`doors`/
`entries` locals:

```ts
export function buildHouses(
  scene: Phaser.Scene,
  region: Region,
  originGx: number,
  originGy: number,
): TilemapResult {
  const blocked = new Set<string>();
  const doors = new Map<string, string>();
  const entries: Entry[] = [];
  const houseImages = new Map<string, Phaser.GameObjects.Image>();

  for (const house of region.houses) {
    const [w, h] = HOUSE_FOOTPRINT[house.variant] ?? HOUSE_FOOTPRINT[0];
    const [doorX, doorY] = HOUSE_DOOR[house.variant] ?? HOUSE_DOOR[0];
    const gx = originGx + house.gx;
    const gy = originGy + house.gy;

    const img = scene.add
      .image(gx * TILE, gy * TILE, `house-${house.variant}`)
      .setOrigin(0, 0)
      .setDepth((gy + h) * TILE);
    houseImages.set(house.id, img);

    for (let y = 0; y < h - 1; y++) {
      for (let x = 0; x < w; x++) {
        blocked.add(key(gx + x, gy + y));
      }
    }

    const entryX = gx + doorX;
    const entryY = gy + doorY + 1;
    blocked.delete(key(entryX, entryY));
    doors.set(key(entryX, entryY), house.id);
    entries.push({ gx: entryX, gy: entryY, houseId: house.id });
  }

  return { blocked, doors, entries, houseImages };
}
```

- [ ] **Step 2: Verify**

Run: `cd ~/Projects/notekeep-town-build && npx tsc --noEmit`
Expected: clean. (`Phaser.GameObjects.Image` resolves via the same ambient `Phaser` namespace
this file already uses for `Phaser.Scene`, so no new import is needed.)

- [ ] **Step 3: Commit**

```bash
git add game/tilemap.ts
git commit -m "buildHouses: return each house's sprite so the scene can wire clicks"
```

---

### Task 3: `lib/exteriorStore.ts` — persistence

**Files:**
- Create: `lib/exteriorStore.ts`

**Interfaces:**
- Consumes: nothing new (uses `localStorage` directly, same pattern as `lib/interiorStore.ts`).
- Produces: `getExteriorVariant(fingerprint: string, houseId: string): number | null`,
  `saveExteriorVariant(fingerprint: string, houseId: string, variant: number): void` — consumed
  by Task 5 (`game/scenes/OverworldScene.ts`).

- [ ] **Step 1: Create `lib/exteriorStore.ts`**

```ts
function storageKey(fingerprint: string, houseId: string): string {
  return `exterior:${fingerprint}:${houseId}`;
}

export function getExteriorVariant(fingerprint: string, houseId: string): number | null {
  try {
    const raw = localStorage.getItem(storageKey(fingerprint, houseId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || typeof parsed.variant !== 'number') {
      return null;
    }
    return parsed.variant;
  } catch {
    return null;
  }
}

export function saveExteriorVariant(fingerprint: string, houseId: string, variant: number): void {
  try {
    localStorage.setItem(storageKey(fingerprint, houseId), JSON.stringify({ variant }));
  } catch {
    // Storage full or unavailable (private browsing) — the choice just won't persist.
  }
}
```

This mirrors `lib/interiorStore.ts`'s `getLayout`/`saveLayout` exactly, using the same
`vaultFingerprint` (already published to `game.registry.get('vaultFingerprint')` by
`lib/vault/open.ts` for the interior-layout feature) — no changes needed there.

- [ ] **Step 2: Verify**

Run: `cd ~/Projects/notekeep-town-build && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add lib/exteriorStore.ts
git commit -m "Add lib/exteriorStore.ts for per-house exterior variant persistence"
```

---

### Task 4: `game/bus.ts` — new events

**Files:**
- Modify: `game/bus.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: bus events `'open-exterior-editor'`, `'close-exterior-editor'`,
  `'commit-exterior-variant'` — emitted by Task 5 (`open-exterior-editor`) and Task 6
  (`close-exterior-editor`, `commit-exterior-variant`); listened to by Task 6
  (`open-exterior-editor`) and Task 5 (`commit-exterior-variant`, `close-exterior-editor`).

- [ ] **Step 1: Add the three event types to `BusEvents`**

In `game/bus.ts`, change:

```ts
type BusEvents = {
  'enter-house': { houseId: string };
  'exit-house': undefined;
  'open-note': { note: NoteRef };
  'close-note': undefined;
  'open-shelf': { houseId: string };
  'close-shelf': undefined;
  'talk-npc': { npcId: string; line: string };
  'open-interior-editor': { houseId: string; layout: InteriorLayout };
  'close-interior-editor': undefined;
  'commit-interior-layout': { houseId: string; layout: InteriorLayout };
};
```

to:

```ts
type BusEvents = {
  'enter-house': { houseId: string };
  'exit-house': undefined;
  'open-note': { note: NoteRef };
  'close-note': undefined;
  'open-shelf': { houseId: string };
  'close-shelf': undefined;
  'talk-npc': { npcId: string; line: string };
  'open-interior-editor': { houseId: string; layout: InteriorLayout };
  'close-interior-editor': undefined;
  'commit-interior-layout': { houseId: string; layout: InteriorLayout };
  'open-exterior-editor': {
    houseId: string;
    currentVariant: number;
    siblingHouses: Array<{ id: string; gx: number; gy: number; variant: number }>;
    gx: number;
    gy: number;
  };
  'close-exterior-editor': undefined;
  'commit-exterior-variant': { houseId: string; variant: number };
};
```

- [ ] **Step 2: Verify**

Run: `cd ~/Projects/notekeep-town-build && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add game/bus.ts
git commit -m "bus: add open/close-exterior-editor and commit-exterior-variant events"
```

---

### Task 5: `game/scenes/OverworldScene.ts` — apply overrides, wire clicks, handle commits

**Files:**
- Modify: `game/scenes/OverworldScene.ts`

**Interfaces:**
- Consumes: `getExteriorVariant`, `saveExteriorVariant` (Task 3); `buildHouses()`'s
  `TilemapResult.houseImages` (Task 2); bus events `open-exterior-editor`,
  `close-exterior-editor`, `commit-exterior-variant` (Task 4); existing `worldToTile`,
  `tileToWorld` (already imported from `@/game/gridMovement`); `House`, `Region` (from
  `@/lib/types`, not currently imported in this file).
- Produces: nothing new consumed elsewhere — this is the scene wiring itself.

- [ ] **Step 1: Import the new pieces**

At the top of `game/scenes/OverworldScene.ts`, change:

```ts
import Phaser from 'phaser';
import type { WorldModel } from '@/lib/types';
import { regionSize } from '@/lib/vault/parse';
import { buildHouses, buildRoads, scatterDecoration, type Entry } from '@/game/tilemap';
import { GridMovement, TILE, tileToWorld, worldToTile } from '@/game/gridMovement';
import { dressPlayer } from '@/game/playerSprite';
import { spawnNpcs, type NpcSpawnArea } from '@/game/npc';
import { bus } from '@/game/bus';
```

to:

```ts
import Phaser from 'phaser';
import type { House, Region, WorldModel } from '@/lib/types';
import { regionSize } from '@/lib/vault/parse';
import { buildHouses, buildRoads, scatterDecoration, type Entry } from '@/game/tilemap';
import { GridMovement, TILE, tileToWorld, worldToTile } from '@/game/gridMovement';
import { dressPlayer } from '@/game/playerSprite';
import { spawnNpcs, type NpcSpawnArea } from '@/game/npc';
import { getExteriorVariant, saveExteriorVariant } from '@/lib/exteriorStore';
import { bus } from '@/game/bus';
```

- [ ] **Step 2: Add instance fields and the two bus-callback class fields**

Change:

```ts
export default class OverworldScene extends Phaser.Scene {
  private movement: GridMovement | null = null;
  private player: Phaser.GameObjects.Sprite | null = null;
  private doors = new Map<string, string>();
  private lastDoorKey: string | null = null;

  constructor() {
    super('OverworldScene');
  }
```

to:

```ts
export default class OverworldScene extends Phaser.Scene {
  private movement: GridMovement | null = null;
  private player: Phaser.GameObjects.Sprite | null = null;
  private doors = new Map<string, string>();
  private lastDoorKey: string | null = null;
  private fingerprint: string | undefined;
  private editingExterior = false;

  private onCommitExterior = ({ houseId, variant }: { houseId: string; variant: number }) => {
    if (!this.fingerprint) return;
    saveExteriorVariant(this.fingerprint, houseId, variant);
    // Preserve the player's position across the restart, the same way exiting a house does via
    // the registry's one-shot `returnTile` — otherwise the player would visually teleport back
    // to the first house's entry every time they customize a building elsewhere on the map.
    if (this.player) {
      const { gx, gy } = worldToTile(this.player.x, this.player.y);
      this.game.registry.set('returnTile', { gx, gy });
    }
    this.scene.restart();
  };

  private onCloseExteriorEditor = () => {
    this.editingExterior = false;
  };

  constructor() {
    super('OverworldScene');
  }
```

- [ ] **Step 3: Apply saved overrides before region sizes are computed**

In `create()`, change:

```ts
    this.doors = new Map();
    this.lastDoorKey = null;

    const sizes = world.regions.map((r) => regionSize(r));
```

to:

```ts
    this.doors = new Map();
    this.lastDoorKey = null;
    this.editingExterior = false;

    this.fingerprint = this.game.registry.get('vaultFingerprint') as string | undefined;
    if (this.fingerprint) {
      for (const region of world.regions) {
        for (const house of region.houses) {
          const saved = getExteriorVariant(this.fingerprint, house.id);
          if (saved !== null) house.variant = saved;
        }
      }
    }

    const sizes = world.regions.map((r) => regionSize(r));
```

This must run before `regionSize()`/`buildHouses()` so both compute layout from the *live*
variant, not the one baked in at vault-parse time.

- [ ] **Step 4: Wire click handling onto each house sprite**

In `create()`, change:

```ts
    world.regions.forEach((region, i) => {
      const [w, h] = sizes[i];
      const originGx = (i % cols) * cellW + Math.floor(REGION_PAD / 2);
      const originGy = Math.floor(i / cols) * cellH + Math.floor(REGION_PAD / 2);
      areas.push({ originGx, originGy, width: w, height: h });
      const result = buildHouses(this, region, originGx, originGy);
      result.blocked.forEach((k) => blocked.add(k));
      result.doors.forEach((houseId, key) => this.doors.set(key, houseId));
      entries.push(...result.entries);
    });
```

to:

```ts
    world.regions.forEach((region, i) => {
      const [w, h] = sizes[i];
      const originGx = (i % cols) * cellW + Math.floor(REGION_PAD / 2);
      const originGy = Math.floor(i / cols) * cellH + Math.floor(REGION_PAD / 2);
      areas.push({ originGx, originGy, width: w, height: h });
      const result = buildHouses(this, region, originGx, originGy);
      result.blocked.forEach((k) => blocked.add(k));
      result.doors.forEach((houseId, key) => this.doors.set(key, houseId));
      entries.push(...result.entries);

      for (const house of region.houses) {
        const img = result.houseImages.get(house.id);
        if (!img) continue;
        img
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => this.openExteriorEditor(house, region));
      }
    });
```

- [ ] **Step 5: Register/clean up the exterior-editor bus listeners**

In `create()`, immediately after the existing camera/`fit()` block (right before the closing
brace of `create()`), add:

```ts
    bus.on('commit-exterior-variant', this.onCommitExterior);
    bus.on('close-exterior-editor', this.onCloseExteriorEditor);
    this.events.once('shutdown', () => {
      bus.off('commit-exterior-variant', this.onCommitExterior);
      bus.off('close-exterior-editor', this.onCloseExteriorEditor);
    });
```

So the end of `create()` reads:

```ts
    fit();
    this.scale.on(Phaser.Scale.Events.RESIZE, fit);
    this.events.once('shutdown', () => this.scale.off(Phaser.Scale.Events.RESIZE, fit));
    cam.startFollow(player, true);

    bus.on('commit-exterior-variant', this.onCommitExterior);
    bus.on('close-exterior-editor', this.onCloseExteriorEditor);
    this.events.once('shutdown', () => {
      bus.off('commit-exterior-variant', this.onCommitExterior);
      bus.off('close-exterior-editor', this.onCloseExteriorEditor);
    });
  }
```

- [ ] **Step 6: Add the `openExteriorEditor` method**

Add this private method to the class, after `create()` and before `update()`:

```ts
  private openExteriorEditor(house: House, region: Region) {
    if (this.editingExterior) return;
    this.editingExterior = true;
    bus.emit('open-exterior-editor', {
      houseId: house.id,
      currentVariant: house.variant,
      siblingHouses: region.houses.map((h) => ({ id: h.id, gx: h.gx, gy: h.gy, variant: h.variant })),
      gx: house.gx,
      gy: house.gy,
    });
  }
```

- [ ] **Step 7: Gate `update()` while the exterior editor is open**

Change:

```ts
  update() {
    if (!this.movement || !this.player) return;
    this.movement.update();
```

to:

```ts
  update() {
    if (!this.movement || !this.player) return;
    if (this.editingExterior) return;
    this.movement.update();
```

- [ ] **Step 8: Verify**

Run: `cd ~/Projects/notekeep-town-build && npx tsc --noEmit`
Expected: clean.

Run: `cd ~/Projects/notekeep-town-build && npm run dev`, open the demo town, hover a house.
Expected: cursor becomes a hand pointer over the building sprite; clicking it does nothing
visible yet (the editor component doesn't exist until Task 6) but no console errors appear.

- [ ] **Step 9: Commit**

```bash
git add game/scenes/OverworldScene.ts
git commit -m "OverworldScene: apply saved exterior overrides and wire house clicks"
```

---

### Task 6: `components/ExteriorEditor.tsx`

**Files:**
- Create: `components/ExteriorEditor.tsx`

**Interfaces:**
- Consumes: `bus` (`@/game/bus`); `HOUSE_VARIANTS`, `canPlaceHouseVariant` (`@/lib/houseCatalog`,
  Task 1); bus event `open-exterior-editor` (Task 4).
- Produces: emits `close-exterior-editor`, `commit-exterior-variant` (Task 4, consumed by Task 5).
  Mounted in Task 7 (`app/page.tsx`).

- [ ] **Step 1: Create `components/ExteriorEditor.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { bus } from '@/game/bus';
import { HOUSE_VARIANTS, canPlaceHouseVariant } from '@/lib/houseCatalog';

type Session = {
  houseId: string;
  currentVariant: number;
  siblingHouses: Array<{ id: string; gx: number; gy: number; variant: number }>;
  gx: number;
  gy: number;
};

export default function ExteriorEditor() {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onOpen = (payload: Session) => {
      setSession(payload);
      setError(null);
    };
    bus.on('open-exterior-editor', onOpen);
    return () => bus.off('open-exterior-editor', onOpen);
  }, []);

  // Capture phase, following InteriorEditor's convention, so Escape beats Phaser's own listeners.
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
  }, [session]);

  function close() {
    setSession(null);
    bus.emit('close-exterior-editor', undefined);
  }

  function pick(variant: number) {
    if (!session) return;
    if (variant === session.currentVariant) {
      close();
      return;
    }
    const fits = canPlaceHouseVariant(
      { id: session.houseId, gx: session.gx, gy: session.gy },
      variant,
      session.siblingHouses,
    );
    if (!fits) {
      setError("Doesn't fit here — try a smaller building.");
      return;
    }
    bus.emit('commit-exterior-variant', { houseId: session.houseId, variant });
    setSession(null);
    bus.emit('close-exterior-editor', undefined);
  }

  if (!session) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70" onClick={close}>
      <div
        className="flex flex-col gap-3 rounded bg-neutral-900 p-4 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm uppercase tracking-wide text-neutral-300">Customize exterior</span>
          <button className="rounded border border-white px-3 py-1 text-sm" onClick={close}>
            Cancel
          </button>
        </div>

        <div className="flex gap-3">
          {HOUSE_VARIANTS.map((variant) => (
            <button
              key={variant}
              className={`rounded border p-1 ${
                variant === session.currentVariant ? 'border-yellow-400' : 'border-neutral-600'
              }`}
              onClick={() => pick(variant)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/assets/buildings/house_${variant}.png`}
                alt={`Building style ${variant}`}
                style={{ imageRendering: 'pixelated', maxWidth: 96, maxHeight: 96 }}
              />
            </button>
          ))}
        </div>

        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    </div>
  );
}
```

Clicking the currently-selected thumbnail just closes the editor instead of re-validating and
re-committing an unchanged value — avoids a pointless `localStorage` write and scene restart
when nothing actually changed.

- [ ] **Step 2: Verify**

Run: `cd ~/Projects/notekeep-town-build && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/ExteriorEditor.tsx
git commit -m "Add ExteriorEditor: 5-thumbnail house variant picker"
```

---

### Task 7: `app/page.tsx` — mount the editor

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `ExteriorEditor` (Task 6).

- [ ] **Step 1: Import and mount `ExteriorEditor`**

Change:

```tsx
import InteriorEditor from '@/components/InteriorEditor';
```

to:

```tsx
import InteriorEditor from '@/components/InteriorEditor';
import ExteriorEditor from '@/components/ExteriorEditor';
```

And change:

```tsx
      <NoteReader note={openNote} />
      <InteriorEditor />
```

to:

```tsx
      <NoteReader note={openNote} />
      <InteriorEditor />
      <ExteriorEditor />
```

- [ ] **Step 2: Verify**

Run: `cd ~/Projects/notekeep-town-build && npx tsc --noEmit && npm run build`
Expected: both clean.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "Mount ExteriorEditor alongside the other bus-driven overlays"
```

---

### Task 8: End-to-end manual verification

No automated tests exist for this project; this task is the acceptance check from the spec and
this plan's Review Focus section.

- [ ] **Step 1:** `npm run dev`, open the demo town. Confirm the town renders exactly as before
      (no saved overrides exist yet, so every house still shows `hash(house.name) % 5`'s
      variant).
- [ ] **Step 2:** Click a house. Confirm a modal opens showing 5 building thumbnails, with the
      house's current variant's thumbnail highlighted (yellow border).
- [ ] **Step 3:** Pick a different variant that clearly fits (small building, no close
      neighbors). Confirm: the modal closes, the building sprite on the map changes immediately,
      the road reroutes to the new door position, and decoration (trees/flowers) doesn't overlap
      the new footprint.
- [ ] **Step 4:** Pick a deliberately larger variant for a house with a close neighbor, chosen so
      the new footprint would overlap that neighbor within `HOUSE_GAP`. Confirm the error
      `"Doesn't fit here — try a smaller building."` appears inline, the modal stays open, and
      nothing on the map changes.
- [ ] **Step 5:** From that same open modal, pick one that fits despite being larger (enough
      clearance to the neighbor). Confirm it succeeds — sprite changes, road reroutes, no
      overlap.
- [ ] **Step 6:** Stand directly beside a house, then customize it to a variant whose new,
      larger footprint would extend over the tile you were standing on. Confirm you do not end
      up stuck inside a wall — you should land on the nearest walkable tile via the existing
      spawn-search fallback, not visibly teleported to a random part of the map.
- [ ] **Step 7:** Customize a house in a second, different region from the one you're currently
      standing in (skip if the demo vault has only one region), such that its footprint grows.
      Confirm every region still renders without overlapping and all roads/decoration remain
      correct — the shared-`cellW`/`cellH` re-pack side effect documented in the spec.
- [ ] **Step 8:** Reload the page fully, reopen the same vault (or the demo town again). Confirm
      every customized house still shows its saved variant, applied before the town renders (no
      flash of the original variant). Click one of those customized houses again and confirm the
      editor highlights the *saved* variant as current — not the original `hash(house.name) % 5`
      value from before you changed it.
- [ ] **Step 9:** Enter the interior of a house you customized the exterior of. Confirm the room
      size, furniture, wallpaper, floor, and shelf position are completely unchanged from before
      the exterior change.
- [ ] **Step 10:** Click the currently-selected thumbnail in the editor (no-op pick). Confirm
      the modal just closes with no map change and no console error.
- [ ] **Step 11:** `cd ~/Projects/notekeep-town-build && npx tsc --noEmit && npm run build` —
      both must succeed cleanly.
