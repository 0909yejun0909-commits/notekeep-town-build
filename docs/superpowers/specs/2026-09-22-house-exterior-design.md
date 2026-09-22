# Customizable house exterior — design

## Goal

Let a player change which of the 5 Kenmi building sprites represents a house on the overworld
map, chosen by clicking the building. Today `house.variant` (0-4) is fixed forever at
`hash(house.name) % 5` (`lib/vault/parse.ts:289`), baked into the `WorldModel` once at vault
parse time.

## Non-goals

- The interior (room size, furniture, wallpaper, floor, shelf position) is completely unaffected
  by an exterior change — they're separate systems (`InteriorLayout` vs. the house's `variant`)
  and this feature never touches `InteriorLayout`.
- No moving the house to a different spot on the map, and no changing any *other* house's
  position as a side effect (ruled out in brainstorming — Approach B, full region re-layout, was
  explicitly rejected for exactly this reason).
- No new art. All 5 variants (`house-0`..`house-4`) are already loaded by `BootScene.ts`.

## Decisions already made (in brainstorming)

- Trigger: click the house sprite on the overworld (house sprites aren't currently interactive;
  this feature makes them so, the same way furniture is clickable indoors).
- When a candidate variant's footprint wouldn't fit at the house's existing, fixed `gx`/`gy`: the
  change is **blocked with an error**, matching the room-size feature's shrink-blocking. The
  house's position never moves; only its own footprint/sprite changes, or the change is refused.

## A correction made while speccing this out

Approach A was described during brainstorming as blocking on "a neighboring house or the region
edge." Working through the actual mechanics: `regionSize()` (`lib/vault/parse.ts:154`) already
recomputes the region's `cols`/`rows` **fresh on every scene load**, taking
`Math.max(cols, house.gx + w + REGION_MARGIN)` over every house's *current* footprint — so the
region canvas already auto-grows to fit whatever footprint a house currently has, with no fixed
cap. There is no real "region edge" rejection case: growing the region is always safe and already
automatic. The only thing that actually needs validation is **house-to-house overlap** (including
the same `HOUSE_GAP` clearance the original layout used, so roads can still route between
houses). This is a refinement of the *mechanism*, not a scope change — the user-facing behavior
("blocked if it doesn't fit") is unchanged; only the "region edge" half of the earlier phrasing
turns out to be unnecessary given how `regionSize()` already works.

One side effect that remains, inherent to the existing layout system and not something this
feature introduces or needs to solve: regions are placed on the world map using a single shared
cell size (`maxW`/`maxH` across *all* regions, `OverworldScene.ts`'s `cellW`/`cellH`). If a
house's new exterior makes its own region need more space than before, every region's origin on
the map can shift slightly (never overlapping — just a uniform re-pack).

## Consolidating duplicated house data

`HOUSE_FOOTPRINT`/`HOUSE_DOOR` (`lib/vault/parse.ts:5-10`) and `HOUSE_DATA`
(`game/tilemap.ts:6-12`) are two independent copies of the same 5 numbers today. The new
validator needs this data too — rather than add a third copy, consolidate into one new file,
`lib/houseCatalog.ts`, and have both existing files import from it.

```ts
// lib/houseCatalog.ts
import type { House } from './types';

export const HOUSE_FOOTPRINT: Record<number, [number, number]> = {
  0: [6, 8], 1: [9, 8], 2: [9, 8], 3: [7, 6], 4: [12, 8],
};
export const HOUSE_DOOR: Record<number, [number, number]> = {
  0: [2, 6], 1: [2, 6], 2: [5, 6], 3: [2, 4], 4: [5, 6],
};
export const HOUSE_VARIANTS = [0, 1, 2, 3, 4] as const;
export const REGION_MARGIN = 2;
export const HOUSE_GAP = 3;

// Would `house` (at its existing, fixed gx/gy) fit as `newVariant` without
// overlapping any other house in the same region (with the same HOUSE_GAP
// clearance the original layout packer used)? The region canvas itself
// always auto-grows to fit (regionSize() takes a fresh max over every
// house's current footprint on every load), so there is no separate
// "region edge" case to check — only house-to-house overlap.
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

`lib/vault/parse.ts` deletes its own `HOUSE_FOOTPRINT`/`HOUSE_DOOR`/`REGION_MARGIN`/`HOUSE_GAP`
and imports all four from `lib/houseCatalog.ts` instead (values unchanged, so `layoutRegion`/
`regionSize`'s behavior is identical). `game/tilemap.ts` deletes `HOUSE_DATA` and imports
`HOUSE_FOOTPRINT`/`HOUSE_DOOR` from `lib/houseCatalog.ts`, combining them where `HOUSE_DATA` used
to be read as one `{w,h,door}` object (a two-line change at each of `HOUSE_DATA`'s two use sites
in `buildHouses()`).

## Persistence (`lib/exteriorStore.ts`)

Mirrors `lib/interiorStore.ts` exactly:

```ts
import { hash } from './types';

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
    // Storage full or unavailable — the choice just won't persist.
  }
}
```

Same fingerprint (`game.registry.get('vaultFingerprint')`) already published by
`lib/vault/open.ts` for the interior-layout feature — no changes needed there.

## `game/scenes/OverworldScene.ts`

New instance field, alongside `doors`/`lastDoorKey`:
```ts
private fingerprint: string | undefined;
```

At the top of `create()`, right after reading `world` from the registry and before computing
region sizes: set `this.fingerprint`, then for every house in every region, look up a saved
override and apply it in place (`house.variant = override`) before `regionSize()`/`buildHouses()`
run — both already read `house.variant` fresh, so roads/blocked-tiles/decoration all adapt with
no other change needed. `this.fingerprint` (not a local) is what `onCommitExterior` — a separate
class-field arrow function, same pattern `InteriorScene.ts` already uses for its own
`onCommitLayout` — reads later, since a local `const` inside `create()` wouldn't be reachable
from a sibling class field.

```ts
this.fingerprint = this.game.registry.get('vaultFingerprint') as string | undefined;
if (this.fingerprint) {
  for (const region of world.regions) {
    for (const house of region.houses) {
      const saved = getExteriorVariant(this.fingerprint, house.id);
      if (saved !== null) house.variant = saved;
    }
  }
}
```

House sprites become interactive. In `buildHouses()` (`game/tilemap.ts`), the
`scene.add.image(...)` call for each house gains `.setInteractive({ useHandCursor: true })` and a
`pointerdown` handler — but `buildHouses()` doesn't have access to the *scene's* click-gating
state or the sibling-house list it needs for the bus payload, so the click handler is wired in
`OverworldScene.create()` instead: `buildHouses()` returns the created `Phaser.GameObjects.Image`
per house (a small return-shape addition) and `OverworldScene` attaches
`img.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.openExteriorEditor(house, region))`.

New instance state on `OverworldScene`, mirroring `InteriorScene`'s `editingLayout` gate:
```ts
private editingExterior = false;
```
gates `update()`'s movement the same way `InteriorScene` gates its own.

`openExteriorEditor(house, region)` emits:
```ts
bus.emit('open-exterior-editor', {
  houseId: house.id,
  currentVariant: house.variant,
  siblingHouses: region.houses.map((h) => ({ id: h.id, gx: h.gx, gy: h.gy, variant: h.variant })),
  gx: house.gx,
  gy: house.gy,
});
```
(`siblingHouses` includes the house itself — `canPlaceHouseVariant` already skips `other.id ===
house.id`.)

A `commit-exterior-variant` listener saves the choice and restarts the scene (identical shape to
`InteriorScene`'s `onCommitLayout`):
```ts
private onCommitExterior = ({ houseId, variant }: { houseId: string; variant: number }) => {
  if (!this.fingerprint) return;
  saveExteriorVariant(this.fingerprint, houseId, variant);
  this.scene.restart();
};
```
A `close-exterior-editor` listener sets `editingExterior = false`, registered/cleaned-up the same
way `InteriorScene` does for its own editor events.

## `game/bus.ts`

```ts
'open-exterior-editor': {
  houseId: string;
  currentVariant: number;
  siblingHouses: Array<{ id: string; gx: number; gy: number; variant: number }>;
  gx: number;
  gy: number;
};
'close-exterior-editor': undefined;
'commit-exterior-variant': { houseId: string; variant: number };
```

## `components/ExteriorEditor.tsx`

New component, mounted in `app/page.tsx` alongside the other bus-driven overlays. Same shape as
`InteriorEditor.tsx`'s open/close/commit lifecycle, much simpler content: a modal listing all 5
variants as clickable thumbnails (`<img src="/assets/buildings/house_{n}.png">` — these are whole
images already, no cropping needed, unlike furniture sprites), highlighting `currentVariant`.
Clicking a thumbnail runs `canPlaceHouseVariant({ id: houseId, gx, gy }, variant, siblingHouses)`
locally; on success it stages the pick (no separate "Save" step needed — the picker is simple
enough that clicking a valid thumbnail immediately emits `commit-exterior-variant` then
`close-exterior-editor`, rather than staging a draft like the interior editor does). On failure it
shows `"Doesn't fit here — try a smaller building."` inline and leaves the current variant
selected.

## Verification

No automated test suite exists in this project (project convention). Verify by: clicking a house
and confirming the picker shows 5 thumbnails with the current one highlighted; picking a
same-or-smaller variant that clearly fits and confirming the building sprite changes on the map,
roads reroute to the new door position, and decoration doesn't overlap the new footprint;
deliberately picking a larger variant that would overlap a close neighbor and confirming it's
blocked with the exact error and nothing changes; picking one that fits despite being larger
(with enough clearance) and confirming it succeeds; reloading the page and confirming the choice
persists; confirming the interior (room size/furniture/wallpaper) of the customized house is
completely unaffected; confirming `npx tsc --noEmit` and `npm run build` are clean.
