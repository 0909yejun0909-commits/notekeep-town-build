# Achievements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Players earn achievements through play; each unlocks a class outfit (knight, wizard, ninja…) or a pet, equippable from the in-game wardrobe.

**Architecture:** A pure, tested state module (`achievementState.ts`) + data registry (`achievements.ts`) feed a small session store (`achievementStore.ts`, modelled on `walletStore.ts`, no React). A React hook, toast and panel sit on top. Game code only calls `track*`; skins plug into `dressPlayer`, pets are a follower sprite spawned by each scene.

**Tech Stack:** Next.js (App Router) + TypeScript, Phaser 3.90 (`phaser@^3.90.0`, never v4), `node:test` via `npm test`.

**Spec:** `docs/superpowers/specs/2026-10-09-achievements-design.md`

## Deviations from the spec (decided while planning, from facts found in the code)

- **Roster trimmed to what achievements grant:** 16 skins + 8 pets, 24 achievements. Adding more later = one catalog line + one registry line. The "Fun" class is dropped for now. Pets are limited to the 8 animals whose `SpriteSheet.png` is a confirmed 32x16 (two 16x16 frames).
- **`furniturePlaced` becomes `roomFurniture`:** the bus only reports one room's layout per commit, so the stat is "most pieces in a single room" (`layout.placements.length`, max), not a lifetime total.
- **"Enter every biome" becomes `biomesTried`:** biome is a town-wide picker (forest/snow/desert), not a place you walk into.
- **Class tabs become a grouped strip:** skins are shown in one wrapping strip ordered by class (class in the tooltip). Not tabs; revisit after seeing it.
- **Rewards UI only in the in-game wardrobe**, not the title screen (no vault is open there, so nothing could be unlocked).
- **No game-input pause while the achievements panel is open** (v1 limitation; the panel has no text inputs).

## Global Constraints

- `phaser@^3.90.0`; `pixelArt: true`, `roundPixels: true`, `antialias: false`, integer zoom 3; tiles 16x16. Never fractional scaling.
- No database, no auth, no backend. All state in `localStorage`.
- All user-facing UI is React overlaid on the canvas; never UI inside Phaser.
- House style: no explanatory comments except where a *why* is non-obvious; no README files.
- `public/assets` is gitignored; reward art is installed by a script, never committed.
- Reward art source: Ninja Adventure Asset Pack, **CC0**. No other downloaded pack is used (see spec "Art and licensing").
- Phaser must only load in the browser (`ssr: false`); lib modules stay free of Phaser/React imports unless named `use*`/components.
- Read `node_modules/next/dist/docs/` before writing any new Next.js route/page code (this plan adds none).
- Work happens in the worktree `~/Projects/notekeep-town-achievements` on branch `achievements`. Do not push; do not touch `main`.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- Corrupt / hand-edited / wrong-shape `localStorage` for achievement state or equipped ids → must fall back to empty/none, never throw (tests in Tasks 2 and 3).
- A huge single jump (`track('coinsEarned', 6000)`) must unlock every crossed threshold at once, each exactly once (Task 2).
- Non-positive, `NaN` or `Infinity` amounts must be ignored (Task 2).
- Equipped skin/pet saved from another vault or via the dev flag must not apply when it isn't unlocked in the current vault (Task 3).
- Reward art not installed (fresh clone, art script not run) → game still boots, no "missing art" banner, skin silently falls back to the layered outfit, pet silently absent (Tasks 4–5).
- Demo town (no persistence) and guest sessions (multiplayer joiners) → achievements must not persist / must not run for guests (Task 3).

---

### Task 1: Reward catalog + art installer

**Files:**
- Create: `lib/rewards.ts`
- Create: `lib/rewards.test.mts`
- Create: `scripts/install-rewards.mts`
- Modify: `package.json` (add `install-rewards` script)
- Modify: `docs/ASSETS.md` (append provenance section)

**Interfaces:**
- Produces (used by all later tasks):
  - `SKIN_CLASSES`, `type SkinClass`, `SKIN_CLASS_LABEL: Record<SkinClass, string>`
  - `SKINS` (readonly tuple of `{ id; folder; cls; name }`), `PETS` (readonly tuple of `{ id; folder; name }`)
  - `type SkinId`, `type PetId`
  - `skinTextureKey(id)`, `skinAssetPath(id)`, `petTextureKey(id)`, `petAssetPath(id)`
  - `rewardName(kind: 'skin' | 'pet', id: string): string`

- [ ] **Step 1: Extract the art once (manual, outside the repo)**

```bash
mkdir -p ~/ninja-adventure && unzip -q "$HOME/Downloads/Ninja Adventure - Asset Pack.zip" -d ~/ninja-adventure
ls ~/ninja-adventure/"Ninja Adventure - Asset Pack"/Actor
```
Expected: `Animal  Boss  Character  CharacterAnimated  Monster`

- [ ] **Step 2: Write the failing test**

`lib/rewards.test.mts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PETS, SKINS, SKIN_CLASSES, petAssetPath, rewardName, skinAssetPath, skinTextureKey } from './rewards.ts';

test('skin and pet ids are unique and kebab-case', () => {
  for (const list of [SKINS, PETS]) {
    const ids = list.map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) assert.match(id, /^[a-z]+(-[a-z0-9]+)*$/);
  }
});

test('every skin belongs to a known class', () => {
  for (const s of SKINS) assert.ok(SKIN_CLASSES.includes(s.cls), s.id);
});

test('asset paths and keys are derived from the id', () => {
  assert.equal(skinAssetPath('knight'), 'assets/skins/knight.png');
  assert.equal(petAssetPath('cat'), 'assets/pets/cat.png');
  assert.equal(skinTextureKey('knight'), 'skin-knight');
});

test('rewardName looks up display names and tolerates unknown ids', () => {
  assert.equal(rewardName('skin', 'knight'), 'Knight');
  assert.equal(rewardName('pet', 'cat'), 'Tabby Cat');
  assert.equal(rewardName('pet', 'nope'), 'nope');
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test -- 2>&1 | tail -20` (or `node --import ./scripts/test-alias.mjs --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test lib/rewards.test.mts`)
Expected: FAIL, cannot find module `./rewards.ts`.

- [ ] **Step 4: Write `lib/rewards.ts`**

```ts
export const SKIN_CLASSES = ['knight', 'wizard', 'ninja', 'samurai', 'royalty', 'spooky'] as const;
export type SkinClass = (typeof SKIN_CLASSES)[number];

export const SKIN_CLASS_LABEL: Record<SkinClass, string> = {
  knight: 'Knights',
  wizard: 'Wizards',
  ninja: 'Ninjas',
  samurai: 'Samurai',
  royalty: 'Royalty',
  spooky: 'Spooky',
};

// Ninja Adventure (CC0) Actor/Character folders. 16x16 frames, 4 columns (down, up, left, right)
// by 7 rows; rows 0-3 are the walk cycle, so frame 0..3 is each direction's idle.
export const SKINS = [
  { id: 'knight', folder: 'Knight', cls: 'knight', name: 'Knight' },
  { id: 'knight-gold', folder: 'KnightGold', cls: 'knight', name: 'Gold Knight' },
  { id: 'gladiator', folder: 'GladiatorBlue', cls: 'knight', name: 'Gladiator' },
  { id: 'sorcerer-black', folder: 'SorcererBlack', cls: 'wizard', name: 'Dark Sorcerer' },
  { id: 'sorcerer-orange', folder: 'SorcererOrange', cls: 'wizard', name: 'Ember Sorcerer' },
  { id: 'ninja-mage-black', folder: 'NinjaMageBlack', cls: 'wizard', name: 'Shadow Mage' },
  { id: 'ninja-blue', folder: 'NinjaBlue', cls: 'ninja', name: 'Blue Ninja' },
  { id: 'ninja-fire', folder: 'NinjaFire', cls: 'ninja', name: 'Fire Ninja' },
  { id: 'ninja-thunder', folder: 'NinjaThunder', cls: 'ninja', name: 'Thunder Ninja' },
  { id: 'samurai', folder: 'Samurai', cls: 'samurai', name: 'Samurai' },
  { id: 'princess', folder: 'Princess', cls: 'royalty', name: 'Princess' },
  { id: 'noble', folder: 'Noble', cls: 'royalty', name: 'Noble' },
  { id: 'vampire', folder: 'Vampire', cls: 'spooky', name: 'Vampire' },
  { id: 'skeleton', folder: 'Skeleton', cls: 'spooky', name: 'Skeleton' },
  { id: 'spirit', folder: 'Spirit', cls: 'spooky', name: 'Spirit' },
  { id: 'gold-statue', folder: 'GoldStatue', cls: 'spooky', name: 'Golden Statue' },
] as const;

// Ninja Adventure Actor/Animal folders whose SpriteSheet.png is 32x16: two 16x16 frames.
export const PETS = [
  { id: 'cat', folder: 'Cat', name: 'Tabby Cat' },
  { id: 'cat-black', folder: 'CatBlack', name: 'Black Cat' },
  { id: 'cat-cyclop', folder: 'CatCyclop', name: 'Cyclops Cat' },
  { id: 'dog', folder: 'Dog', name: 'Dog' },
  { id: 'dog2', folder: 'Dog2', name: 'Pup' },
  { id: 'frog', folder: 'Frog', name: 'Frog' },
  { id: 'lion-cub', folder: 'LionCub', name: 'Lion Cub' },
  { id: 'racoon', folder: 'Racoon', name: 'Racoon' },
] as const;

export type SkinId = (typeof SKINS)[number]['id'];
export type PetId = (typeof PETS)[number]['id'];

export const skinAssetPath = (id: SkinId) => `assets/skins/${id}.png`;
export const skinTextureKey = (id: SkinId) => `skin-${id}`;
export const petAssetPath = (id: PetId) => `assets/pets/${id}.png`;
export const petTextureKey = (id: PetId) => `pet-${id}`;

export function rewardName(kind: 'skin' | 'pet', id: string): string {
  const list: readonly { id: string; name: string }[] = kind === 'skin' ? SKINS : PETS;
  return list.find((e) => e.id === id)?.name ?? id;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: the command from Step 3. Expected: 4 tests PASS.

- [ ] **Step 6: Write the installer `scripts/install-rewards.mts`**

```ts
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { PETS, SKINS } from '../lib/rewards.ts';

// Copies the reward sprites out of the Ninja Adventure pack (CC0) into public/assets, which is
// gitignored. Re-run after changing the catalog in lib/rewards.ts.
const source = process.env.NINJA ?? `${homedir()}/ninja-adventure/Ninja Adventure - Asset Pack`;
const dest = new URL('../public/assets', import.meta.url).pathname;

if (!existsSync(`${source}/Actor`)) {
  throw new Error(`Ninja Adventure pack not found at ${source}. Unzip it there or set NINJA=<folder containing Actor/>.`);
}
mkdirSync(`${dest}/skins`, { recursive: true });
mkdirSync(`${dest}/pets`, { recursive: true });

for (const s of SKINS) copyFileSync(`${source}/Actor/Character/${s.folder}/SpriteSheet.png`, `${dest}/skins/${s.id}.png`);
for (const p of PETS) copyFileSync(`${source}/Actor/Animal/${p.folder}/SpriteSheet.png`, `${dest}/pets/${p.id}.png`);
console.log(`Installed ${SKINS.length} skins and ${PETS.length} pets into ${dest}`);
```

In `package.json` `scripts`, add after `fetch-samples`:
```json
"install-rewards": "node --import ./scripts/test-alias.mjs --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/install-rewards.mts"
```

- [ ] **Step 7: Run the installer and verify**

Run: `npm run install-rewards && ls public/assets/skins | wc -l && ls public/assets/pets | wc -l && git status --short`
Expected: `Installed 16 skins and 8 pets…`, `16`, `8`, and `git status` does **not** list `public/assets` (gitignored).

- [ ] **Step 8: Append provenance to `docs/ASSETS.md`**

Append at the end of the file:
```markdown

## Achievement rewards (skins and pets)

Source: **Ninja Adventure Asset Pack** by Pixel-boy & AAA, https://pixel-boy.itch.io/ninja-adventure-asset-pack
License: **CC0 1.0** (commercial use and redistribution allowed; attribution not required, given here anyway).
Installed by `npm run install-rewards` from `Actor/Character/<folder>/SpriteSheet.png` (skins, 64x112, 16x16 frames,
columns = down/up/left/right, rows 0-3 = walk) and `Actor/Animal/<folder>/SpriteSheet.png` (pets, 32x16, two frames).
The id-to-folder mapping lives in `lib/rewards.ts`. No other downloaded pack is used.
```

- [ ] **Step 9: Commit**

```bash
git add lib/rewards.ts lib/rewards.test.mts scripts/install-rewards.mts package.json docs/ASSETS.md
git commit -m "Add reward catalog (16 skins, 8 pets) and CC0 art installer

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Achievement state logic + registry (pure, TDD)

**Files:**
- Create: `lib/achievementState.ts`
- Create: `lib/achievementState.test.mts`
- Create: `lib/achievements.ts`
- Create: `lib/achievements.test.mts`

**Interfaces:**
- Consumes: `SkinId`, `PetId`, `SKINS`, `PETS` from `lib/rewards.ts`.
- Produces:
  - `STAT_KEYS`, `type StatKey`
  - `type Reward = { kind: 'skin'; id: SkinId } | { kind: 'pet'; id: PetId }`
  - `type Achievement = { id: string; name: string; description: string; secret: boolean; stat: StatKey; target: number; reward: Reward }`
  - `type AchievementState = { stats: Partial<Record<StatKey, number>>; seen: Partial<Record<StatKey, string[]>>; unlocked: Record<string, number> }`
  - `type Change = { state: AchievementState; newly: Achievement[] }`
  - `emptyState()`, `parseState(raw: unknown)`, `bump(state, stat, amount, now, list)`, `bumpDistinct(state, stat, value, now, list)`, `bumpMax(state, stat, value, now, list)`, `progress(state, a): number` (0..1), `current(state, a): number`
  - `ACHIEVEMENTS: readonly Achievement[]`, `achievementFor(kind, id): Achievement | undefined`

- [ ] **Step 1: Write the failing state tests**

`lib/achievementState.test.mts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bump, bumpDistinct, bumpMax, current, emptyState, parseState, progress } from './achievementState.ts';

const ach = (over = {}) => ({
  id: 'a', name: 'A', description: 'd', secret: false, stat: 'notesRead', target: 3,
  reward: { kind: 'pet', id: 'cat' }, ...over,
});

test('bump below the target unlocks nothing', () => {
  const r = bump(emptyState(), 'notesRead', 2, 100, [ach()]);
  assert.equal(r.state.stats.notesRead, 2);
  assert.deepEqual(r.newly, []);
});

test('crossing the target unlocks once, stamped with the time, and never again', () => {
  const first = bump(emptyState(), 'notesRead', 3, 111, [ach()]);
  assert.deepEqual(first.newly.map((a) => a.id), ['a']);
  assert.equal(first.state.unlocked.a, 111);
  const again = bump(first.state, 'notesRead', 5, 222, [ach()]);
  assert.deepEqual(again.newly, []);
  assert.equal(again.state.unlocked.a, 111);
});

test('one big jump unlocks every crossed threshold at once', () => {
  const list = [ach({ id: 'a', target: 10 }), ach({ id: 'b', target: 50 }), ach({ id: 'c', target: 5000 })];
  const r = bump(emptyState(), 'notesRead', 60, 1, list);
  assert.deepEqual(r.newly.map((a) => a.id), ['a', 'b']);
});

test('non-positive, NaN and Infinity amounts are ignored', () => {
  const s = emptyState();
  for (const amount of [0, -4, NaN, Infinity]) {
    const r = bump(s, 'notesRead', amount, 1, [ach({ target: 1 })]);
    assert.equal(r.state, s);
    assert.deepEqual(r.newly, []);
  }
});

test('bumpDistinct counts unique values only', () => {
  let s = emptyState();
  s = bumpDistinct(s, 'housesVisited', 'h1', 1, []).state;
  const dup = bumpDistinct(s, 'housesVisited', 'h1', 2, []);
  assert.equal(dup.state, s);
  s = bumpDistinct(s, 'housesVisited', 'h2', 3, []).state;
  assert.equal(s.stats.housesVisited, 2);
  assert.deepEqual(s.seen.housesVisited, ['h1', 'h2']);
});

test('bumpDistinct can unlock', () => {
  const list = [ach({ stat: 'housesVisited', target: 2 })];
  let s = bumpDistinct(emptyState(), 'housesVisited', 'h1', 1, list).state;
  const r = bumpDistinct(s, 'housesVisited', 'h2', 2, list);
  assert.deepEqual(r.newly.map((a) => a.id), ['a']);
});

test('bumpMax keeps the highest value and never lowers it', () => {
  let s = bumpMax(emptyState(), 'roomFurniture', 6, 1, []).state;
  const lower = bumpMax(s, 'roomFurniture', 3, 2, []);
  assert.equal(lower.state, s);
  s = bumpMax(s, 'roomFurniture', 9, 3, []).state;
  assert.equal(s.stats.roomFurniture, 9);
});

test('progress is clamped to 0..1 and current reads the stat', () => {
  const a = ach({ target: 4 });
  const s = bump(emptyState(), 'notesRead', 1, 1, [a]).state;
  assert.equal(progress(s, a), 0.25);
  assert.equal(current(s, a), 1);
  const done = bump(s, 'notesRead', 99, 1, [a]).state;
  assert.equal(progress(done, a), 1);
  assert.equal(progress(emptyState(), a), 0);
});

test('parseState survives garbage and keeps only valid parts', () => {
  for (const raw of [null, undefined, 5, 'x', [], { stats: 'nope' }]) {
    assert.deepEqual(parseState(raw), emptyState());
  }
  const s = parseState({
    stats: { notesRead: 4, bogusKey: 9, coinsEarned: -3, tilesWalked: NaN },
    seen: { housesVisited: ['a', 'b'], notesRead: [1, 2] },
    unlocked: { a: 100, b: 'later' },
  });
  assert.deepEqual(s.stats, { notesRead: 4 });
  assert.deepEqual(s.seen, { housesVisited: ['a', 'b'] });
  assert.deepEqual(s.unlocked, { a: 100 });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --import ./scripts/test-alias.mjs --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test lib/achievementState.test.mts`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Write `lib/achievementState.ts`**

```ts
import type { PetId, SkinId } from './rewards';

export const STAT_KEYS = [
  'notesRead', 'housesVisited', 'coinsEarned', 'roomFurniture',
  'exteriorsChanged', 'biomesTried', 'tilesWalked', 'stillMinute',
] as const;
export type StatKey = (typeof STAT_KEYS)[number];

export type Reward = { kind: 'skin'; id: SkinId } | { kind: 'pet'; id: PetId };

export type Achievement = {
  id: string;
  name: string;
  description: string;
  secret: boolean;
  stat: StatKey;
  target: number;
  reward: Reward;
};

export type AchievementState = {
  stats: Partial<Record<StatKey, number>>;
  seen: Partial<Record<StatKey, string[]>>;
  unlocked: Record<string, number>;
};

export type Change = { state: AchievementState; newly: Achievement[] };

export const emptyState = (): AchievementState => ({ stats: {}, seen: {}, unlocked: {} });

function settle(
  prev: AchievementState,
  stats: AchievementState['stats'],
  seen: AchievementState['seen'],
  now: number,
  list: readonly Achievement[],
): Change {
  const unlocked = { ...prev.unlocked };
  const newly: Achievement[] = [];
  for (const a of list) {
    if (unlocked[a.id] === undefined && (stats[a.stat] ?? 0) >= a.target) {
      unlocked[a.id] = now;
      newly.push(a);
    }
  }
  return { state: { stats, seen, unlocked }, newly };
}

export function bump(
  state: AchievementState, stat: StatKey, amount: number, now: number, list: readonly Achievement[],
): Change {
  if (!Number.isFinite(amount) || amount <= 0) return { state, newly: [] };
  return settle(state, { ...state.stats, [stat]: (state.stats[stat] ?? 0) + amount }, state.seen, now, list);
}

export function bumpDistinct(
  state: AchievementState, stat: StatKey, value: string, now: number, list: readonly Achievement[],
): Change {
  const seen = state.seen[stat] ?? [];
  if (seen.includes(value)) return { state, newly: [] };
  const next = [...seen, value];
  return settle(state, { ...state.stats, [stat]: next.length }, { ...state.seen, [stat]: next }, now, list);
}

export function bumpMax(
  state: AchievementState, stat: StatKey, value: number, now: number, list: readonly Achievement[],
): Change {
  if (!Number.isFinite(value) || value <= (state.stats[stat] ?? 0)) return { state, newly: [] };
  return settle(state, { ...state.stats, [stat]: value }, state.seen, now, list);
}

export const current = (state: AchievementState, a: Achievement): number => state.stats[a.stat] ?? 0;

export const progress = (state: AchievementState, a: Achievement): number =>
  Math.min(1, current(state, a) / a.target);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function parseState(raw: unknown): AchievementState {
  const out = emptyState();
  if (!isRecord(raw)) return out;
  const known = new Set<string>(STAT_KEYS);
  if (isRecord(raw.stats)) {
    for (const [k, v] of Object.entries(raw.stats)) {
      if (known.has(k) && typeof v === 'number' && Number.isFinite(v) && v >= 0) out.stats[k as StatKey] = v;
    }
  }
  if (isRecord(raw.seen)) {
    for (const [k, v] of Object.entries(raw.seen)) {
      if (known.has(k) && Array.isArray(v) && v.every((x) => typeof x === 'string')) out.seen[k as StatKey] = v;
    }
  }
  if (isRecord(raw.unlocked)) {
    for (const [k, v] of Object.entries(raw.unlocked)) {
      if (typeof v === 'number' && Number.isFinite(v)) out.unlocked[k] = v;
    }
  }
  return out;
}
```

- [ ] **Step 4: Run to verify the state tests pass**

Run: the Step 2 command. Expected: 9 tests PASS.

- [ ] **Step 5: Write the failing registry tests**

`lib/achievements.test.mts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACHIEVEMENTS, achievementFor } from './achievements.ts';
import { STAT_KEYS } from './achievementState.ts';
import { PETS, SKINS } from './rewards.ts';

test('achievement ids are unique and targets are positive integers', () => {
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, ACHIEVEMENTS.length);
  for (const a of ACHIEVEMENTS) {
    assert.ok(Number.isInteger(a.target) && a.target > 0, a.id);
    assert.ok(STAT_KEYS.includes(a.stat), a.id);
  }
});

test('every skin and every pet is granted by exactly one achievement', () => {
  for (const [kind, list] of [['skin', SKINS], ['pet', PETS]] as const) {
    for (const e of list) {
      const owners = ACHIEVEMENTS.filter((a) => a.reward.kind === kind && a.reward.id === e.id);
      assert.equal(owners.length, 1, `${kind} ${e.id}`);
    }
  }
  assert.equal(ACHIEVEMENTS.length, SKINS.length + PETS.length);
});

test('achievementFor finds the owner of a reward', () => {
  assert.equal(achievementFor('pet', 'cat')?.id, 'first-page');
  assert.equal(achievementFor('skin', 'does-not-exist'), undefined);
});

test('secret achievements exist and are a minority', () => {
  const secrets = ACHIEVEMENTS.filter((a) => a.secret);
  assert.ok(secrets.length >= 3 && secrets.length < ACHIEVEMENTS.length / 2);
});
```

- [ ] **Step 6: Run to verify failure**, then write `lib/achievements.ts`

```ts
import type { Achievement } from './achievementState';

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'first-page', name: 'First Page', description: 'Read your first note.', secret: false, stat: 'notesRead', target: 1, reward: { kind: 'pet', id: 'cat' } },
  { id: 'bookworm', name: 'Bookworm', description: 'Read 10 different notes.', secret: false, stat: 'notesRead', target: 10, reward: { kind: 'skin', id: 'knight' } },
  { id: 'librarian', name: 'Librarian', description: 'Read 50 different notes.', secret: false, stat: 'notesRead', target: 50, reward: { kind: 'skin', id: 'sorcerer-black' } },
  { id: 'archivist', name: 'Archivist', description: 'Read 150 different notes.', secret: false, stat: 'notesRead', target: 150, reward: { kind: 'skin', id: 'knight-gold' } },
  { id: 'pack-rat', name: 'Pack Rat', description: 'Read 300 different notes.', secret: false, stat: 'notesRead', target: 300, reward: { kind: 'pet', id: 'lion-cub' } },

  { id: 'neighbor', name: 'Good Neighbor', description: 'Visit 3 different houses.', secret: false, stat: 'housesVisited', target: 3, reward: { kind: 'pet', id: 'dog' } },
  { id: 'explorer', name: 'Explorer', description: 'Visit 10 different houses.', secret: false, stat: 'housesVisited', target: 10, reward: { kind: 'skin', id: 'ninja-blue' } },
  { id: 'globetrotter', name: 'Globetrotter', description: 'Visit 30 different houses.', secret: false, stat: 'housesVisited', target: 30, reward: { kind: 'skin', id: 'samurai' } },
  { id: 'census-taker', name: 'Census Taker', description: 'Visit 60 different houses.', secret: false, stat: 'housesVisited', target: 60, reward: { kind: 'skin', id: 'skeleton' } },

  { id: 'pocket-change', name: 'Pocket Change', description: 'Earn 100 coins by writing notes.', secret: false, stat: 'coinsEarned', target: 100, reward: { kind: 'pet', id: 'cat-black' } },
  { id: 'saver', name: 'Saver', description: 'Earn 500 coins by writing notes.', secret: false, stat: 'coinsEarned', target: 500, reward: { kind: 'skin', id: 'sorcerer-orange' } },
  { id: 'tycoon', name: 'Tycoon', description: 'Earn 2000 coins by writing notes.', secret: false, stat: 'coinsEarned', target: 2000, reward: { kind: 'skin', id: 'noble' } },
  { id: 'mogul', name: 'Mogul', description: 'Earn 5000 coins by writing notes.', secret: false, stat: 'coinsEarned', target: 5000, reward: { kind: 'pet', id: 'cat-cyclop' } },

  { id: 'decorator', name: 'Decorator', description: 'Put 4 pieces of furniture in one room.', secret: false, stat: 'roomFurniture', target: 4, reward: { kind: 'pet', id: 'dog2' } },
  { id: 'interior-designer', name: 'Interior Designer', description: 'Put 8 pieces of furniture in one room.', secret: false, stat: 'roomFurniture', target: 8, reward: { kind: 'skin', id: 'gladiator' } },
  { id: 'curator', name: 'Curator', description: 'Put 12 pieces of furniture in one room.', secret: false, stat: 'roomFurniture', target: 12, reward: { kind: 'skin', id: 'princess' } },
  { id: 'hoarder', name: 'Hoarder', description: 'Put 20 pieces of furniture in one room.', secret: false, stat: 'roomFurniture', target: 20, reward: { kind: 'skin', id: 'gold-statue' } },

  { id: 'makeover', name: 'Makeover', description: 'Restyle a house exterior 3 times.', secret: false, stat: 'exteriorsChanged', target: 3, reward: { kind: 'pet', id: 'frog' } },
  { id: 'architect', name: 'Architect', description: 'Restyle a house exterior 10 times.', secret: false, stat: 'exteriorsChanged', target: 10, reward: { kind: 'skin', id: 'ninja-fire' } },

  { id: 'wanderer', name: 'Wanderer', description: 'Walk 500 tiles.', secret: false, stat: 'tilesWalked', target: 500, reward: { kind: 'pet', id: 'racoon' } },
  { id: 'marathon', name: 'Marathon', description: 'Walk 5000 tiles.', secret: false, stat: 'tilesWalked', target: 5000, reward: { kind: 'skin', id: 'ninja-thunder' } },

  { id: 'chameleon', name: 'Chameleon', description: 'Try every town biome.', secret: true, stat: 'biomesTried', target: 3, reward: { kind: 'skin', id: 'vampire' } },
  { id: 'still-life', name: 'Still Life', description: 'Stand perfectly still for a full minute.', secret: true, stat: 'stillMinute', target: 1, reward: { kind: 'skin', id: 'spirit' } },
  { id: 'long-walk', name: 'The Long Walk', description: 'Walk 20000 tiles.', secret: true, stat: 'tilesWalked', target: 20000, reward: { kind: 'skin', id: 'ninja-mage-black' } },
];

export function achievementFor(kind: 'skin' | 'pet', id: string): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.reward.kind === kind && a.reward.id === id);
}
```

- [ ] **Step 7: Run all lib tests**

Run: `npm test 2>&1 | tail -25`
Expected: all pass, including the 4 new registry tests and the existing suites.

- [ ] **Step 8: Commit**

```bash
git add lib/achievementState.ts lib/achievementState.test.mts lib/achievements.ts lib/achievements.test.mts
git commit -m "Add achievement state logic and 24-entry registry with tests

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Session store, hook, vault wiring, wallet hook

**Files:**
- Create: `lib/achievementStore.ts`
- Create: `lib/achievementStore.test.mts`
- Create: `lib/useAchievements.ts`
- Modify: `lib/vault/open.ts` (start/stop calls)
- Modify: `lib/walletStore.ts` (track coins)

**Interfaces:**
- Consumes: Task 1 and Task 2 exports.
- Produces (`lib/achievementStore.ts`):
  - `type Equipped = { skin: SkinId | null; pet: PetId | null }`
  - `type Toast = { id: number; achievement: Achievement }`
  - `type AchievementView = { active: boolean; state: AchievementState; toasts: Toast[] }`
  - `INACTIVE_VIEW`, `getView(): AchievementView`, `subscribe(cb): () => void`
  - `startAchievements(vaultName: string, persist: boolean)`, `stopAchievements()`
  - `track(stat: StatKey, amount?: number)`, `trackDistinct(stat: StatKey, value: string)`, `trackMax(stat: StatKey, value: number)`
  - `dismissToast(id: number)`, `refreshAchievements()`
  - `isUnlocked(kind: 'skin' | 'pet', id: string): boolean` (true for everything when `localStorage['notekeep-town:unlock-all'] === '1'`)
  - `getEquipped(): Equipped` (only unlocked ids), `equip(next: Partial<Equipped>)`
- Produces (`lib/useAchievements.ts`): `useAchievements(): AchievementView`

- [ ] **Step 1: Write the failing store tests**

`lib/achievementStore.test.mts`:
```ts
import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dismissToast, equip, getEquipped, getView, isUnlocked, startAchievements, stopAchievements,
  track, trackDistinct, trackMax,
} from './achievementStore.ts';

const mem = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
};

beforeEach(() => {
  stopAchievements();
  mem.clear();
});

test('inactive until started, and track is a no-op', () => {
  track('notesRead');
  assert.equal(getView().active, false);
});

test('unlocking queues a toast and makes the reward available', () => {
  startAchievements('v', true);
  assert.equal(isUnlocked('pet', 'cat'), false);
  trackDistinct('notesRead', 'a.md');
  assert.equal(isUnlocked('pet', 'cat'), true);
  assert.deepEqual(getView().toasts.map((t) => t.achievement.id), ['first-page']);
  dismissToast(getView().toasts[0].id);
  assert.equal(getView().toasts.length, 0);
});

test('progress persists per vault and reloads', () => {
  startAchievements('v', true);
  trackDistinct('notesRead', 'a.md');
  stopAchievements();
  startAchievements('v', true);
  assert.equal(isUnlocked('pet', 'cat'), true);
  stopAchievements();
  startAchievements('other', true);
  assert.equal(isUnlocked('pet', 'cat'), false);
});

test('the demo town (persist=false) writes nothing', () => {
  startAchievements('demo', false);
  trackDistinct('notesRead', 'a.md');
  stopAchievements();
  assert.equal(mem.size, 0);
});

test('corrupt saved state falls back to empty', () => {
  mem.set('achievements:v', '{not json');
  startAchievements('v', true);
  assert.equal(getView().active, true);
  assert.equal(isUnlocked('pet', 'cat'), false);
  mem.set('achievements:w', JSON.stringify({ stats: 7, unlocked: ['x'] }));
  startAchievements('w', true);
  assert.equal(isUnlocked('pet', 'cat'), false);
});

test('a huge jump unlocks every crossed reward', () => {
  startAchievements('v', true);
  track('coinsEarned', 6000);
  for (const id of ['cat-black', 'cat-cyclop']) assert.equal(isUnlocked('pet', id), true, id);
  assert.equal(isUnlocked('skin', 'noble'), true);
});

test('trackMax unlocks on the best single room', () => {
  startAchievements('v', true);
  trackMax('roomFurniture', 4);
  assert.equal(isUnlocked('pet', 'dog2'), true);
  assert.equal(isUnlocked('skin', 'gladiator'), false);
});

test('equipped only returns unlocked, known ids', () => {
  startAchievements('v', true);
  equip({ skin: 'knight', pet: 'cat' });
  assert.deepEqual(getEquipped(), { skin: null, pet: null });
  trackDistinct('notesRead', 'a.md');
  assert.deepEqual(getEquipped(), { skin: null, pet: 'cat' });
  mem.set('notekeep-town:equipped', JSON.stringify({ skin: 'not-a-skin', pet: 'cat' }));
  assert.deepEqual(getEquipped(), { skin: null, pet: 'cat' });
  mem.set('notekeep-town:equipped', 'garbage');
  assert.deepEqual(getEquipped(), { skin: null, pet: null });
});

test('the dev unlock-all flag unlocks everything', () => {
  mem.set('notekeep-town:unlock-all', '1');
  assert.equal(isUnlocked('skin', 'gold-statue'), true);
  equip({ skin: 'gold-statue' });
  assert.equal(getEquipped().skin, 'gold-statue');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --import ./scripts/test-alias.mjs --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test lib/achievementStore.test.mts`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Write `lib/achievementStore.ts`**

```ts
import { ACHIEVEMENTS } from './achievements';
import {
  bump, bumpDistinct, bumpMax, emptyState, parseState,
  type Achievement, type AchievementState, type Change, type StatKey,
} from './achievementState';
import { PETS, SKINS, type PetId, type SkinId } from './rewards';

export type Equipped = { skin: SkinId | null; pet: PetId | null };
export type Toast = { id: number; achievement: Achievement };
export type AchievementView = { active: boolean; state: AchievementState; toasts: Toast[] };

const EQUIPPED_KEY = 'notekeep-town:equipped';
const UNLOCK_ALL_KEY = 'notekeep-town:unlock-all';
const SAVE_DELAY_MS = 1000;

type Session = { key: string | null; state: AchievementState };

export const INACTIVE_VIEW: AchievementView = { active: false, state: emptyState(), toasts: [] };

let session: Session | null = null;
let view: AchievementView = INACTIVE_VIEW;
let nextToastId = 1;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

export function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getView(): AchievementView {
  return view;
}

function publish(toasts: Toast[]) {
  view = session ? { active: true, state: session.state, toasts } : INACTIVE_VIEW;
  listeners.forEach((l) => l());
}

function load(key: string): AchievementState {
  try {
    const raw = localStorage.getItem(key);
    return raw ? parseState(JSON.parse(raw)) : emptyState();
  } catch {
    return emptyState();
  }
}

function flush() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (!session?.key) return;
  try {
    localStorage.setItem(session.key, JSON.stringify(session.state));
  } catch {
    // Storage full or unavailable (private browsing) — progress just won't persist.
  }
}

function saveSoon() {
  if (saveTimer || !session?.key) return;
  saveTimer = setTimeout(flush, SAVE_DELAY_MS);
}

export function startAchievements(vaultName: string, persist: boolean) {
  flush();
  const key = persist ? `achievements:${vaultName}` : null;
  session = { key, state: key ? load(key) : emptyState() };
  publish([]);
}

export function stopAchievements() {
  flush();
  session = null;
  publish([]);
}

function apply({ state, newly }: Change) {
  if (!session || state === session.state) return;
  session.state = state;
  saveSoon();
  if (newly.length === 0) return;
  flush();
  publish([...view.toasts, ...newly.map((achievement) => ({ id: nextToastId++, achievement }))]);
}

export function track(stat: StatKey, amount = 1) {
  if (session) apply(bump(session.state, stat, amount, Date.now(), ACHIEVEMENTS));
}

export function trackDistinct(stat: StatKey, value: string) {
  if (session) apply(bumpDistinct(session.state, stat, value, Date.now(), ACHIEVEMENTS));
}

export function trackMax(stat: StatKey, value: number) {
  if (session) apply(bumpMax(session.state, stat, value, Date.now(), ACHIEVEMENTS));
}

export function dismissToast(id: number) {
  if (view.toasts.some((t) => t.id === id)) publish(view.toasts.filter((t) => t.id !== id));
}

// Counting doesn't republish (it would re-render every subscriber on every step); the panel
// calls this when it opens so its progress bars are current.
export function refreshAchievements() {
  publish(view.toasts);
}

function unlockAll(): boolean {
  try {
    return localStorage.getItem(UNLOCK_ALL_KEY) === '1';
  } catch {
    return false;
  }
}

export function isUnlocked(kind: 'skin' | 'pet', id: string): boolean {
  if (unlockAll()) return true;
  if (!session) return false;
  return ACHIEVEMENTS.some(
    (a) => a.reward.kind === kind && a.reward.id === id && session!.state.unlocked[a.id] !== undefined,
  );
}

function loadEquipped(): Equipped {
  try {
    const raw = JSON.parse(localStorage.getItem(EQUIPPED_KEY) ?? 'null');
    return {
      skin: SKINS.find((s) => s.id === raw?.skin)?.id ?? null,
      pet: PETS.find((p) => p.id === raw?.pet)?.id ?? null,
    };
  } catch {
    return { skin: null, pet: null };
  }
}

export function getEquipped(): Equipped {
  const saved = loadEquipped();
  return {
    skin: saved.skin && isUnlocked('skin', saved.skin) ? saved.skin : null,
    pet: saved.pet && isUnlocked('pet', saved.pet) ? saved.pet : null,
  };
}

export function equip(next: Partial<Equipped>) {
  try {
    localStorage.setItem(EQUIPPED_KEY, JSON.stringify({ ...loadEquipped(), ...next }));
  } catch {
    // Storage unavailable — the choice just won't persist across reloads.
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: the Step 2 command. Expected: 9 tests PASS (process exits; no dangling timer because every test path that saves calls `stopAchievements`/flush, and `beforeEach` stops the session).

- [ ] **Step 5: Write `lib/useAchievements.ts`**

```ts
import { useSyncExternalStore } from 'react';
import { INACTIVE_VIEW, getView, subscribe, type AchievementView } from './achievementStore';

export function useAchievements(): AchievementView {
  return useSyncExternalStore(subscribe, getView, () => INACTIVE_VIEW);
}
```

- [ ] **Step 6: Wire start/stop into `lib/vault/open.ts`**

Add the import next to the existing wallet import (line 10):
```ts
import { startAchievements, stopAchievements } from '@/lib/achievementStore';
```
Edits (each `old_string` is unique in the file):
- `startWallet(dir.name, true, heads);` → `startAchievements(dir.name, true);\n  startWallet(dir.name, true, heads);` (achievements start first so coins earned since the last visit are counted).
- `startWallet(DEMO_VAULT_NAME, false, new Map(paths.filter(isNotePath).map((p) => [p, files[p]])));` → prefix with `startAchievements(DEMO_VAULT_NAME, false);\n  `.
- In the guest branch, `stopWallet();` → `stopWallet();\n      stopAchievements();` (guests don't earn; the host's town isn't theirs).

- [ ] **Step 7: Count coins in `lib/walletStore.ts`**

Add import: `import { track } from './achievementStore';`
In `startWallet`, after `const n = earned / NOTE_REWARD;` add `if (earned > 0) track('coinsEarned', earned);`
In `noteSaved`, after `session.data = data;` add `if (earned > 0) track('coinsEarned', earned);`

- [ ] **Step 8: Typecheck and run all tests**

Run: `npm run dev` once in another terminal (generates `.next/types`), stop it, then `npx tsc --noEmit 2>&1 | tail -20 && npm test 2>&1 | tail -15`
Expected: no TS errors from the new files; all tests pass.

- [ ] **Step 9: Commit**

```bash
git add lib/achievementStore.ts lib/achievementStore.test.mts lib/useAchievements.ts lib/vault/open.ts lib/walletStore.ts
git commit -m "Add achievement session store with persistence, equip, and vault/wallet wiring

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Skins in the game (and the first visual checkpoint)

**Files:**
- Modify: `game/scenes/BootScene.ts` (load skins/pets, ignore their load errors in the banner)
- Modify: `game/playerSprite.ts` (skin mode in `dressPlayer`)
- Modify: `game/furniturePoses.ts` (`lie` with a skin)
- Modify: `game/scenes/OverworldScene.ts`, `game/scenes/InteriorScene.ts` (pass the equipped skin)

**Interfaces:**
- Consumes: `getEquipped`, `skinTextureKey`, `skinAssetPath`, `SKINS`, `PETS`, `petTextureKey`, `petAssetPath`.
- Produces: `dressPlayer(scene, sprite, appearance?, skin?: SkinId | null): () => void` (existing callers unchanged); `lie(scene, player, entry, placement, appearance, skin?: SkinId | null)`.

- [ ] **Step 1: Preload skin and pet sheets in `BootScene.ts`**

Add imports near the other `@/lib` imports:
```ts
import { PETS, SKINS, petAssetPath, petTextureKey, skinAssetPath, skinTextureKey } from '@/lib/rewards';
```
Replace the load-error handler line
`this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => missing.push(file.url as string));`
with
```ts
    // Reward art is optional (installed by `npm run install-rewards`); its absence just means no rewards show.
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      const url = file.url as string;
      if (!/assets\/(skins|pets)\//.test(url)) missing.push(url);
    });
```
And after the shoes/pants loop (just before `preloadScenery(this);`) add:
```ts
    for (const s of SKINS) this.load.spritesheet(skinTextureKey(s.id), skinAssetPath(s.id), { frameWidth: 16, frameHeight: 16 });
    for (const p of PETS) this.load.spritesheet(petTextureKey(p.id), petAssetPath(p.id), { frameWidth: 16, frameHeight: 16 });
```

- [ ] **Step 2: Skin mode in `game/playerSprite.ts`**

Add to imports: `import { skinTextureKey, type SkinId } from '@/lib/rewards';`

Change the signature and add an early branch. The current head is
```ts
export function dressPlayer(
  scene: Phaser.Scene,
  sprite: Phaser.GameObjects.Sprite,
  appearance: Appearance = DEFAULT_APPEARANCE,
): () => void {
  const layers = outfitTextureKeys(appearance).map((key) => {
```
Replace with
```ts
export function dressPlayer(
  scene: Phaser.Scene,
  sprite: Phaser.GameObjects.Sprite,
  appearance: Appearance = DEFAULT_APPEARANCE,
  skin: SkinId | null = null,
): () => void {
  if (skin && scene.textures.exists(skinTextureKey(skin))) return wearSkin(scene, sprite, skin);
  const layers = outfitTextureKeys(appearance).map((key) => {
```
And add above `dressPlayer` (after `outfitTextureKeys`):
```ts
// A skin is a whole 16x16 character sheet that replaces the base + layers. Columns are the
// facings (down, up, left, right) and rows 0-3 the walk cycle, so the base sprite's animation
// state maps straight onto a skin frame: base walk frames (6) onto 4 rows.
const BASE_WALK_FRAMES = 6;
const SKIN_WALK_ROWS = 4;
// The base sprite's origin sits a little above its feet; skins are drawn feet-aligned to it.
const SKIN_FEET_OFFSET = 2;

function skinFrame(sprite: Phaser.GameObjects.Sprite): number {
  const [mode, dir] = (sprite.anims.currentAnim?.key ?? 'idle-down').split('-');
  const col = dir === 'right' ? (sprite.flipX ? 2 : 3) : dir === 'up' ? 1 : 0;
  if (mode !== 'walk') return col;
  const index = sprite.anims.currentFrame?.index ?? 1;
  const row = Math.min(SKIN_WALK_ROWS - 1, Math.floor(((index - 1) / BASE_WALK_FRAMES) * SKIN_WALK_ROWS));
  return row * 4 + col;
}

function wearSkin(scene: Phaser.Scene, sprite: Phaser.GameObjects.Sprite, skin: SkinId): () => void {
  const view = scene.add.sprite(sprite.x, sprite.y, skinTextureKey(skin), 0).setOrigin(0.5, 15 / 16);
  sprite.setAlpha(0);
  const tick = () => {
    view.x = sprite.x;
    view.y = sprite.y + SKIN_FEET_OFFSET;
    view.visible = sprite.visible;
    view.setFrame(skinFrame(sprite));
    view.setDepth(sprite.depth + 0.01);
  };
  tick();
  scene.events.on(Phaser.Scenes.Events.POST_UPDATE, tick);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.POST_UPDATE, tick));
  return () => {
    scene.events.off(Phaser.Scenes.Events.POST_UPDATE, tick);
    view.destroy();
    sprite.setAlpha(1);
  };
}
```

- [ ] **Step 3: Lying down in a skin (`game/furniturePoses.ts`)**

Add to imports: `import { skinTextureKey, type SkinId } from '@/lib/rewards';`
Change `lie`'s signature to end with `appearance: Appearance,\n  skin: SkinId | null = null,` and replace the `const head = [...]` expression:
```ts
  const skinKey = skin ? skinTextureKey(skin) : null;
  const head =
    skinKey && scene.textures.exists(skinKey)
      ? [scene.add.image(headX + cw / 2, headY + ch / 2, skinKey, 0).setAngle(90).setDepth(OVER_PLAYER)]
      : ['player', ...outfitTextureKeys(appearance)].map((key, i) =>
          scene.add
            .image(headX - cx, headY - cy, key, SLEEP_FRAME)
            .setOrigin(0, 0)
            .setCrop(cx, cy, cw, ch)
            .setDepth(OVER_PLAYER + i * 0.01),
        );
```
(The existing `head.forEach((part) => part.destroy())` in the undo function keeps working.)

- [ ] **Step 4: Overworld uses the equipped skin**

In `OverworldScene.ts` add `import { getEquipped } from '@/lib/achievementStore';` and replace
`dressPlayer(this, player, appearance);` with
```ts
    const equipped = getEquipped();
    dressPlayer(this, player, appearance, equipped.skin);
```

- [ ] **Step 5: Interior uses the equipped skin**

In `InteriorScene.ts` add `import { getEquipped } from '@/lib/achievementStore';` and `import type { SkinId } from '@/lib/rewards';`.
- Add a field next to `private appearance!: Appearance;`: `private skin: SkinId | null = null;`
- In `create`, replace
  ```ts
      this.appearance = (this.game.registry.get('appearance') as Appearance | undefined) ?? DEFAULT_APPEARANCE;
      this.undress = dressPlayer(this, this.player, this.appearance);
  ```
  with
  ```ts
      this.appearance = (this.game.registry.get('appearance') as Appearance | undefined) ?? DEFAULT_APPEARANCE;
      this.skin = getEquipped().skin;
      this.undress = dressPlayer(this, this.player, this.appearance, this.skin);
  ```
- In `onCloseWardrobe`, replace
  ```ts
      this.undress?.();
      this.undress = dressPlayer(this, this.player, this.appearance);
  ```
  with
  ```ts
      this.undress?.();
      this.skin = getEquipped().skin;
      this.undress = dressPlayer(this, this.player, this.appearance, this.skin);
  ```
- In the action dispatch, change `: lie(this, this.player, piece.entry, piece.placement, this.appearance);` to `: lie(this, this.player, piece.entry, piece.placement, this.appearance, this.skin);`

- [ ] **Step 6: Visual checkpoint (the spec's spike — answers its risks 1 and 2)**

```bash
npm run install-rewards
npm run dev
```
In the browser console on the game page: `localStorage.setItem('notekeep-town:unlock-all','1'); localStorage.setItem('notekeep-town:equipped', JSON.stringify({skin:'knight', pet:null}))`, reload, open the demo town, walk around.
Check and record in the commit message / report:
1. Does the knight face the right way when walking up/down/left/right (column order down, up, left, right)? If left/right or up/down are swapped, fix the column mapping in `skinFrame`.
2. Do the feet line up with the tile (not floating / sunk)? Tune `SKIN_FEET_OFFSET` and the 15/16 origin.
3. Walk animation smooth (4 rows)? Idle correct?
4. Height/style: a 16px skin next to 2-tile buildings and the 26px default character. **Stop and ask the user if it looks bad** (fallbacks in the spec's Risks: accept as chibi / 16x32 composite / recolor-only).
5. Enter a house, sit on a chair and lie in a bed in the skin: sensible?
6. Delete `public/assets/skins` and reload: game boots, no "missing art" banner, layered outfit shown.
Use `scripts/cdp-shot.mjs` or the Claude-in-Chrome tools for screenshots; PNG evidence beats memory.

- [ ] **Step 7: Commit**

```bash
git add game lib
git commit -m "Render equipped class skins in place of the layered outfit

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Pets

**Files:**
- Create: `game/pet.ts`
- Modify: `game/scenes/OverworldScene.ts`, `game/scenes/InteriorScene.ts`

**Interfaces:**
- Consumes: `petTextureKey`, `PetId`, `getEquipped`.
- Produces: `spawnPet(scene, player, pet: PetId | null, depthOf: (y: number) => number): () => void` — returns a cleanup that destroys the pet.

- [ ] **Step 1: Write `game/pet.ts`**

```ts
import Phaser from 'phaser';
import { TILE } from '@/game/gridMovement';
import { petTextureKey, type PetId } from '@/lib/rewards';

const FOLLOW_DISTANCE = 20;
const TELEPORT_DISTANCE = 6 * TILE;
const SPEED = 70;
const STEP_MS = 160;

// A pet just chases its owner at a fixed gap; it ignores collision on purpose (it never blocks
// the player and a 16px animal clipping a corner for a frame is not worth pathfinding). Sheets are
// two 16x16 frames: a walk step is alternating them with a small bob.
export function spawnPet(
  scene: Phaser.Scene,
  player: Phaser.GameObjects.Sprite,
  pet: PetId | null,
  depthOf: (y: number) => number,
): () => void {
  if (!pet || !scene.textures.exists(petTextureKey(pet))) return () => {};

  const sprite = scene.add.sprite(player.x - FOLLOW_DISTANCE, player.y, petTextureKey(pet), 0).setOrigin(0.5, 1);
  let clock = 0;

  const tick = (_time: number, delta: number) => {
    const dx = player.x - sprite.x;
    const dy = player.y - sprite.y;
    const dist = Math.hypot(dx, dy);
    let walking = false;
    if (dist > TELEPORT_DISTANCE) {
      sprite.setPosition(player.x - FOLLOW_DISTANCE, player.y);
    } else if (dist > FOLLOW_DISTANCE) {
      const step = Math.min((SPEED * delta) / 1000, dist - FOLLOW_DISTANCE);
      sprite.x += (dx / dist) * step;
      sprite.y += (dy / dist) * step;
      walking = true;
      if (Math.abs(dx) > 1) sprite.setFlipX(dx < 0);
    }
    clock = walking ? clock + delta : 0;
    const frame = walking ? Math.floor(clock / STEP_MS) % 2 : 0;
    sprite.setFrame(frame);
    sprite.setDepth(depthOf(sprite.y));
    sprite.setVisible(player.visible);
  };

  scene.events.on(Phaser.Scenes.Events.UPDATE, tick);
  const off = () => scene.events.off(Phaser.Scenes.Events.UPDATE, tick);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
  return () => {
    off();
    sprite.destroy();
  };
}
```

- [ ] **Step 2: Overworld spawns the equipped pet**

In `OverworldScene.ts`, import `import { spawnPet } from '@/game/pet';` and after the `dressPlayer(this, player, appearance, equipped.skin);` line from Task 4 add:
```ts
    spawnPet(this, player, equipped.pet, (y) => y);
```

- [ ] **Step 3: Interior spawns and respawns the pet**

In `InteriorScene.ts`, import `spawnPet`. Add a field `private stopPet: (() => void) | null = null;`.
- In `create`, after `this.undress = dressPlayer(this, this.player, this.appearance, this.skin);` add:
  ```ts
      this.stopPet = spawnPet(this, this.player, getEquipped().pet, () => 9.9);
  ```
- In `onCloseWardrobe`, after the `this.undress = dressPlayer(...)` line add:
  ```ts
      this.stopPet?.();
      this.stopPet = spawnPet(this, this.player, getEquipped().pet, () => 9.9);
  ```

- [ ] **Step 4: Visual checkpoint**

With the dev flag from Task 4 (`unlock-all`), set `localStorage['notekeep-town:equipped'] = {"skin":null,"pet":"cat"}` (also try `frog` and `lion-cub`), reload.
Check: (1) the pet trails ~1 tile behind and stops when you stop; (2) it faces the direction it moves — if every pet faces left when moving right, invert `setFlipX(dx < 0)` to `dx > 0`; (3) it draws behind the player when above and in front when below in the overworld; (4) in a house it stays under furniture-depth sanity (not drawn over tables); (5) sitting/lying: pet waits beside; (6) entering/leaving a house: pet reappears next to you, not stranded; (7) with `public/assets/pets` removed, no pet and no errors.

- [ ] **Step 5: Commit**

```bash
git add game
git commit -m "Add follower pets in the overworld and interiors

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Event tracking

**Files:**
- Create: `components/AchievementTracker.tsx`
- Create: `game/achievementHooks.ts`
- Modify: `app/page.tsx` (mount tracker)
- Modify: `components/BiomePicker.tsx` (biomes tried)
- Modify: `game/scenes/OverworldScene.ts`, `game/scenes/InteriorScene.ts` (movement tracking)

**Interfaces:**
- Consumes: `trackDistinct`, `trackMax`, `track` from `lib/achievementStore.ts`; `bus` events `'open-note' { note }`, `'enter-house' { houseId }`, `'fast-travel' { houseId }`, `'commit-interior-layout' { roomId, layout }`, `'commit-exterior-variant'`; `GridMovement.onStep`.
- Produces: `trackMovement(scene: Phaser.Scene, movement: GridMovement): void`.

- [ ] **Step 1: Write `components/AchievementTracker.tsx`**

```tsx
'use client';

import { useEffect } from 'react';
import { bus } from '@/game/bus';
import { track, trackDistinct, trackMax } from '@/lib/achievementStore';
import type { InteriorLayout, NoteRef } from '@/lib/types';

// Translates game events into achievement stats; renders nothing.
export default function AchievementTracker() {
  useEffect(() => {
    const onNote = ({ note }: { note: NoteRef }) => trackDistinct('notesRead', note.id);
    const onHouse = ({ houseId }: { houseId: string }) => trackDistinct('housesVisited', houseId);
    const onLayout = ({ layout }: { roomId: string; layout: InteriorLayout }) =>
      trackMax('roomFurniture', layout.placements.length);
    const onExterior = () => track('exteriorsChanged');

    bus.on('open-note', onNote);
    bus.on('enter-house', onHouse);
    bus.on('fast-travel', onHouse);
    bus.on('commit-interior-layout', onLayout);
    bus.on('commit-exterior-variant', onExterior);
    return () => {
      bus.off('open-note', onNote);
      bus.off('enter-house', onHouse);
      bus.off('fast-travel', onHouse);
      bus.off('commit-interior-layout', onLayout);
      bus.off('commit-exterior-variant', onExterior);
    };
  }, []);

  return null;
}
```

- [ ] **Step 2: Mount it in `app/page.tsx`**

Add `import AchievementTracker from '@/components/AchievementTracker';` and render `<AchievementTracker />` just before `<CoinPurse />`.

- [ ] **Step 3: Biomes tried in `components/BiomePicker.tsx`**

Add `import { trackDistinct } from '@/lib/achievementStore';` and, in `pick`, after `if (next === biome) return;` add:
```ts
    if (biome) trackDistinct('biomesTried', biome);
    trackDistinct('biomesTried', next);
```
(The previous biome counts too, so forest → snow → desert is three.)

- [ ] **Step 4: Write `game/achievementHooks.ts`**

```ts
import Phaser from 'phaser';
import type { GridMovement } from '@/game/gridMovement';
import { track } from '@/lib/achievementStore';

const STILL_MS = 60_000;

// Wraps the movement's existing onStep, so call it AFTER the scene assigns its own. onStep also
// fires for a turn on the same tile, so only a changed tile counts as a step walked.
export function trackMovement(scene: Phaser.Scene, movement: GridMovement) {
  const inner = movement.onStep;
  let lastMoved = scene.time.now;
  let lastTile = '';
  movement.onStep = (gx, gy, facing) => {
    inner?.(gx, gy, facing);
    const tile = `${gx},${gy}`;
    if (tile === lastTile) return;
    lastTile = tile;
    lastMoved = scene.time.now;
    track('tilesWalked');
  };
  const timer = scene.time.addEvent({
    delay: 1000,
    loop: true,
    callback: () => {
      if (scene.time.now - lastMoved < STILL_MS) return;
      lastMoved = scene.time.now;
      track('stillMinute');
    },
  });
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => timer.remove());
}
```

- [ ] **Step 5: Call it from both scenes**

`OverworldScene.ts`: `import { trackMovement } from '@/game/achievementHooks';` and, right after the line `this.movement.onStep = (gx, gy, facing) => setSelfPresence({ scene: 'overworld', gx, gy, facing });` add `trackMovement(this, this.movement);`.
`InteriorScene.ts`: same import and, right after `this.movement.onStep = (gx, gy, facing) => setSelfPresence({ scene: sceneId, gx, gy, facing });` add `trackMovement(this, this.movement);`.

- [ ] **Step 6: Verify in the browser**

`npm run dev`, open the demo town, open the browser console and run `localStorage.removeItem('notekeep-town:unlock-all')`, reload. Open a note → `first-page` should unlock (verify through Task 7's toast, or temporarily `console.log(getView().state)` — the store is a module, so use the panel in Task 7 instead if this is awkward). Walk ~10 steps, switch biomes, edit an interior, restyle an exterior. Also confirm: standing idle for 60 s fires `stillMinute` exactly once per minute, and the pet/skin features from Tasks 4–5 still work.
(If you prefer an automated check here, extend `AchievementTracker` with nothing — the store logic is already unit-tested; this step is wiring only.)

- [ ] **Step 7: Commit**

```bash
git add components/AchievementTracker.tsx game/achievementHooks.ts app/page.tsx components/BiomePicker.tsx game/scenes
git commit -m "Track notes, houses, furniture, exteriors, biomes, steps and stillness

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Unlock toast and achievements panel

**Files:**
- Create: `components/AchievementUi.module.css`
- Create: `components/AchievementToast.tsx`
- Create: `components/AchievementsPanel.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `useAchievements`, `dismissToast`, `refreshAchievements`, `ACHIEVEMENTS`, `progress`, `current`, `rewardName`, `sfx('buy')`.
- Produces: default-export components `AchievementToast`, `AchievementsPanel` (no props).

- [ ] **Step 1: Write the styles `components/AchievementUi.module.css`**

```css
.toast {
  position: absolute;
  left: 50%;
  top: 16px;
  transform: translateX(-50%);
  z-index: 60;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 18px;
  background: #3f2832;
  border: 3px solid #1f1418;
  box-shadow: inset 0 3px 0 #6d483b, 0 4px 0 rgba(24, 20, 37, 0.45);
  color: #f7c948;
  font-family: 'ArcadeClassic', 'CuteFantasy', monospace;
  word-spacing: 0.4em;
  image-rendering: pixelated;
  cursor: pointer;
  animation: drop 0.4s steps(5);
}
.toastTitle { font-size: 22px; line-height: 28px; }
.toastBody { font-size: 16px; line-height: 20px; color: #f7e8c8; }
@keyframes drop { from { transform: translate(-50%, -80px); } to { transform: translate(-50%, 0); } }

.trophy {
  position: absolute;
  left: 16px;
  bottom: 16px;
  z-index: 55;
  padding: 6px;
  background: #3f2832;
  border: 3px solid #1f1418;
  box-shadow: inset 0 3px 0 #6d483b, 0 4px 0 rgba(24, 20, 37, 0.45);
  cursor: pointer;
  line-height: 0;
}

.screen {
  position: absolute;
  inset: 0;
  z-index: 70;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(24, 20, 37, 0.6);
  font-family: 'ArcadeClassic', 'CuteFantasy', monospace;
  word-spacing: 0.4em;
}
.panel { width: min(720px, 92vw); max-height: 86vh; display: flex; flex-direction: column; padding: 14px 18px; }
.heading { margin: 0 0 4px; font-size: 28px; line-height: 36px; text-align: center; }
.count { margin: 0 0 10px; text-align: center; font-size: 18px; }
.list { overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding-right: 6px; }
.item { display: grid; grid-template-columns: 1fr auto; gap: 2px 12px; padding: 8px 10px; background: #e69c69; box-shadow: inset 0 0 0 3px #bf6f4a; }
.item.done { background: #f2c98a; }
.name { font-size: 20px; line-height: 26px; }
.desc { grid-column: 1; font-size: 15px; line-height: 19px; }
.reward { grid-row: 1 / span 2; grid-column: 2; align-self: center; font-size: 15px; text-align: right; }
.bar { grid-column: 1 / span 2; height: 8px; background: #bf6f4a; }
.fill { height: 100%; background: #3f2832; }
.close { align-self: center; margin-top: 10px; font: inherit; font-size: 24px; background: none; border: 0; color: inherit; cursor: pointer; }
```

- [ ] **Step 2: Write `components/AchievementToast.tsx`**

```tsx
'use client';

import { useEffect } from 'react';
import { sfx } from '@/game/audio/sfx';
import { dismissToast } from '@/lib/achievementStore';
import { rewardName } from '@/lib/rewards';
import { useAchievements } from '@/lib/useAchievements';
import styles from './AchievementUi.module.css';

export default function AchievementToast() {
  const { toasts } = useAchievements();
  const head = toasts[0] ?? null;
  const id = head?.id;

  useEffect(() => {
    if (id === undefined) return;
    sfx('buy');
    const t = setTimeout(() => dismissToast(id), 5000);
    return () => clearTimeout(t);
  }, [id]);

  if (!head) return null;
  const { achievement: a } = head;
  return (
    <div key={head.id} className={styles.toast} onClick={() => dismissToast(head.id)}>
      <span className={styles.toastTitle}>{a.name}</span>
      <span className={styles.toastBody}>
        Unlocked {a.reward.kind === 'skin' ? 'outfit' : 'pet'}: {rewardName(a.reward.kind, a.reward.id)}
      </span>
    </div>
  );
}
```

- [ ] **Step 3: Write `components/AchievementsPanel.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import pixel from './pixelUi.module.css';
import styles from './AchievementUi.module.css';
import { ACHIEVEMENTS } from '@/lib/achievements';
import { current, progress } from '@/lib/achievementState';
import { refreshAchievements } from '@/lib/achievementStore';
import { rewardName } from '@/lib/rewards';
import { useAchievements } from '@/lib/useAchievements';

function Trophy() {
  return (
    <svg width="24" height="24" viewBox="0 0 12 12" shapeRendering="crispEdges" aria-hidden>
      <path fill="#f7c948" d="M3 1h6v1h2v3H9v1H8v2H7v1h2v2H3v-2h2V8H4V6H3V5H1V2h2z" />
      <path fill="#a4402a" d="M5 2h2v3H5z" />
    </svg>
  );
}

export default function AchievementsPanel() {
  const { active, state } = useAchievements();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    refreshAchievements();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!active) return null;
  const done = ACHIEVEMENTS.filter((a) => state.unlocked[a.id] !== undefined).length;

  return (
    <>
      <button
        className={styles.trophy}
        title="Achievements"
        aria-label="Achievements"
        onClick={(e) => {
          e.currentTarget.blur();
          setOpen(true);
        }}
      >
        <Trophy />
      </button>
      {open && (
        <div className={styles.screen} onClick={() => setOpen(false)}>
          <div className={`${pixel.parchment} ${styles.panel}`} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.heading}>Achievements</h2>
            <p className={styles.count}>{done} / {ACHIEVEMENTS.length}</p>
            <div className={styles.list}>
              {ACHIEVEMENTS.map((a) => {
                const got = state.unlocked[a.id] !== undefined;
                const hidden = a.secret && !got;
                return (
                  <div key={a.id} className={`${styles.item} ${got ? styles.done : ''}`}>
                    <span className={styles.name}>{hidden ? '???' : a.name}</span>
                    <span className={styles.desc}>
                      {hidden ? 'A secret. Keep playing to find it.' : a.description}
                      {!got && !hidden && ` (${Math.min(current(state, a), a.target)} / ${a.target})`}
                    </span>
                    {!hidden && (
                      <span className={styles.reward}>
                        {a.reward.kind === 'skin' ? 'Outfit' : 'Pet'}: {rewardName(a.reward.kind, a.reward.id)}
                      </span>
                    )}
                    {!hidden && (
                      <div className={styles.bar}><div className={styles.fill} style={{ width: `${progress(state, a) * 100}%` }} /></div>
                    )}
                  </div>
                );
              })}
            </div>
            <button className={styles.close} onClick={() => setOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Mount both in `app/page.tsx`**

Add the two imports and render `<AchievementToast />` and `<AchievementsPanel />` after `<CoinPurse />`.

- [ ] **Step 5: Verify in the browser**

`npm run dev` → demo town (clear `notekeep-town:unlock-all`). Expect: trophy button bottom-left (check it doesn't collide with the chat/room panels; move if it does); opening a note shows the "First Page — Unlocked pet: Tabby Cat" toast with a sound, auto-dismissing at 5 s and on click; panel lists all 24, secrets as `???`, progress bar and `(n / target)` text update when reopened; Escape and backdrop click close it. Take a screenshot of the toast and the panel.

- [ ] **Step 6: Commit**

```bash
git add components/AchievementUi.module.css components/AchievementToast.tsx components/AchievementsPanel.tsx app/page.tsx
git commit -m "Add achievement unlock toast and progress panel

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Equip rewards in the wardrobe

**Files:**
- Modify: `components/Wardrobe.tsx`
- Modify: `components/CharacterCreator.tsx`
- Modify: `components/CharacterCreator.module.css`

**Interfaces:**
- Consumes: `SKINS`, `PETS`, `SKIN_CLASS_LABEL`, `rewardName`, `achievementFor`, `isUnlocked`, `getEquipped`, `equip`, `useAchievements`.
- Produces: `CharacterCreator` accepts `rewards?: boolean` (default `false`; the title screen stays unchanged).

- [ ] **Step 1: Enable rewards only in the in-game wardrobe**

In `components/Wardrobe.tsx` change `<CharacterCreator onDone={close} />` to `<CharacterCreator onDone={close} rewards />`.

- [ ] **Step 2: Imports and props in `CharacterCreator.tsx`**

Add after the existing imports:
```tsx
import { SKINS, PETS, SKIN_CLASS_LABEL } from '@/lib/rewards';
import { achievementFor } from '@/lib/achievements';
import { equip, getEquipped, isUnlocked, type Equipped } from '@/lib/achievementStore';
import { useAchievements } from '@/lib/useAchievements';
```
Replace `const DONE_ROW = ROWS.length;` with:
```tsx
type RewardKind = 'skin' | 'pet';
const REWARD_ROWS: { kind: RewardKind; label: string }[] = [
  { kind: 'skin', label: 'Outfit' },
  { kind: 'pet', label: 'Pet' },
];

function Portrait({ src, scale }: { src: string; scale: number }) {
  return (
    <div style={{ width: 16 * scale, height: 16 * scale }}>
      <div className={styles.portrait} style={{ backgroundImage: `url('${src}')`, transform: `scale(${scale})` }} />
    </div>
  );
}
```
Change the component head and add state (the first two lines of the component body keep their meaning):
```tsx
export default function CharacterCreator({ onDone, rewards = false }: { onDone: () => void; rewards?: boolean }) {
  const [appearance, setAppearance] = useState<Appearance | null>(null);
  const [row, setRow] = useState(0);
  const [equipped, setEquipped] = useState<Equipped>({ skin: null, pet: null });
  const [lockHint, setLockHint] = useState<string | null>(null);
  useAchievements();
  const rewardRows = rewards ? REWARD_ROWS : [];
  const doneRow = ROWS.length + rewardRows.length;

  useEffect(() => {
    setEquipped(getEquipped());
  }, []);

  function choose(kind: RewardKind, id: string | null) {
    if (id !== null && !isUnlocked(kind, id)) {
      const a = achievementFor(kind, id);
      setLockHint(a ? (a.secret ? 'Unlocked by a secret achievement.' : `Locked. ${a.name}: ${a.description}`) : 'Locked.');
      return;
    }
    setLockHint(null);
    equip({ [kind]: id } as Partial<Equipped>);
    setEquipped(getEquipped());
  }

  function cycle(kind: RewardKind, dir: 1 | -1) {
    const ids = [null, ...(kind === 'skin' ? SKINS : PETS).map((e) => e.id).filter((id) => isUnlocked(kind, id))];
    const i = ids.indexOf(equipped[kind] as never);
    choose(kind, ids[(i + dir + ids.length) % ids.length] as string | null);
  }
```
(Remove the old `const [appearance…]` and `const [row…]` lines so they aren't duplicated.)

- [ ] **Step 3: Keyboard handling**

In the `onKey` handler replace the block
```tsx
      if (k === 'ArrowUp' || k === 'w' || k === 'W') setRow((r) => (r + DONE_ROW) % (DONE_ROW + 1));
      else if (k === 'ArrowDown' || k === 's' || k === 'S') setRow((r) => (r + 1) % (DONE_ROW + 1));
      else if ((left || right) && row < DONE_ROW) {
        const { key, options } = ROWS[row];
        const i = options.indexOf(appearance[key]);
        update({ [key]: options[(i + (left ? -1 : 1) + options.length) % options.length] } as Partial<Appearance>);
      } else if (k === 'Enter' || k === ' ' || k === 'Escape') {
```
with
```tsx
      if (k === 'ArrowUp' || k === 'w' || k === 'W') setRow((r) => (r + doneRow) % (doneRow + 1));
      else if (k === 'ArrowDown' || k === 's' || k === 'S') setRow((r) => (r + 1) % (doneRow + 1));
      else if ((left || right) && row < ROWS.length) {
        const { key, options } = ROWS[row];
        const i = options.indexOf(appearance[key]);
        update({ [key]: options[(i + (left ? -1 : 1) + options.length) % options.length] } as Partial<Appearance>);
      } else if ((left || right) && row < doneRow) {
        cycle(rewardRows[row - ROWS.length].kind, left ? -1 : 1);
      } else if (k === 'Enter' || k === ' ' || k === 'Escape') {
```

- [ ] **Step 4: Stage figure, reward rows, hint**

Replace `<Figure layers={layers} crop={BODY} scale={5} idle />` with
```tsx
          {equipped.skin ? (
            <Portrait src={`/assets/skins/${equipped.skin}.png`} scale={5} />
          ) : (
            <Figure layers={layers} crop={BODY} scale={5} idle />
          )}
```
Insert between the `{ROWS.map(...)}` block and the Done row:
```tsx
          {rewardRows.map(({ kind, label }, i) => {
            const index = ROWS.length + i;
            const entries = kind === 'skin' ? SKINS : PETS;
            return (
              <div key={kind} className={styles.row} onMouseEnter={() => setRow(index)}>
                <span className={cursor(index)} />
                <span className={styles.label}>{label}</span>
                <div className={`${styles.options} ${styles.rewardOptions}`}>
                  <button
                    className={`${styles.slot} ${styles.none} ${equipped[kind] === null ? styles.selected : ''}`}
                    aria-label={`No ${label.toLowerCase()}`}
                    title="None"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(kind, null)}
                  >
                    -
                  </button>
                  {entries.map((e) => {
                    const open = isUnlocked(kind, e.id);
                    const title = 'cls' in e ? `${SKIN_CLASS_LABEL[e.cls]}: ${e.name}` : e.name;
                    return (
                      <button
                        key={e.id}
                        className={`${styles.slot} ${equipped[kind] === e.id ? styles.selected : ''} ${open ? '' : styles.locked}`}
                        aria-label={open ? title : `${title} (locked)`}
                        title={open ? title : `${title} (locked)`}
                        onMouseDown={(ev) => ev.preventDefault()}
                        onClick={() => choose(kind, e.id)}
                      >
                        <Portrait src={`/assets/${kind === 'skin' ? 'skins' : 'pets'}/${e.id}.png`} scale={2} />
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {lockHint && <p className={styles.lockHint}>{lockHint}</p>}
```
And update the Done row to use `doneRow`: `onMouseEnter={() => setRow(doneRow)}` and `cursor(doneRow)`.

- [ ] **Step 5: CSS (append to `CharacterCreator.module.css`)**

```css
.rewardOptions { flex-wrap: wrap; max-width: 360px; }
.portrait {
  width: 16px;
  height: 16px;
  background-repeat: no-repeat;
  background-position: 0 0;
  transform-origin: 0 0;
  image-rendering: pixelated;
}
.none { width: 38px; height: 38px; font: inherit; font-size: 21px; color: inherit; }
.locked { filter: brightness(0) opacity(0.35); }
.lockHint { margin: 4px 0 0; max-width: 420px; font-size: 16px; line-height: 20px; }
```

- [ ] **Step 6: Verify end to end (the real flow, no dev flag)**

Clear `notekeep-town:unlock-all` and `notekeep-town:equipped`. In the demo town: the wardrobe in a house shows Outfit and Pet rows with everything locked; clicking a locked slot shows "Locked. <name>: <description>"; secret ones say "secret". Read a note → unlock Tabby Cat → toast → wardrobe → the cat slot is now selectable via click and Left/Right → close the wardrobe → the cat follows you immediately inside the house, and also after you walk out to the overworld. Unlock a skin (use the console: `localStorage.setItem('notekeep-town:unlock-all','1')`, reload, then remove the flag) and equip it; confirm the stage preview and the in-game sprite change. Confirm the title-screen hero picker has no reward rows. Check keyboard: Up/Down reaches Outfit, Pet, Done; Left/Right skips locked entries.

- [ ] **Step 7: Commit**

```bash
git add components
git commit -m "Equip unlocked outfits and pets from the wardrobe

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Final verification and docs

**Files:**
- Modify: `docs/superpowers/specs/2026-10-09-achievements-design.md` (record the deviations)

- [ ] **Step 1: Full test + typecheck + build**

Run: `npm test 2>&1 | tail -20 && npx tsc --noEmit 2>&1 | tail -20 && npm run build 2>&1 | tail -25`
Expected: tests pass; no TS errors; build succeeds. If `tsc` reports `LayoutProps`, run `npm run dev` once first (CLAUDE.md: not a bug, do not edit `app/layout.tsx`).

- [ ] **Step 2: Fresh-clone check for missing reward art**

`mv public/assets/skins /tmp/skins.bak && mv public/assets/pets /tmp/pets.bak`, `npm run dev`, load the demo town: no console errors beyond the 404s, **no** "missing art" banner, character renders in the layered outfit, wardrobe rows show empty/locked slots without crashing. Then restore the folders.

- [ ] **Step 3: Update the spec with the deviations**

Add a "Changes made while planning" section to the spec listing the six deviations at the top of this plan, so the spec stays the source of truth. Commit:

```bash
git add docs/superpowers/specs/2026-10-09-achievements-design.md
git commit -m "Record planning-time deviations in the achievements spec

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Report**

Summarise to the user: what shipped, the screenshots from Tasks 4, 5, 7 and 8, the outcome of the skin-height visual check, and the known v1 limits (no input pause while the panel is open; local-only pets/skins; study/quiz achievements pending the `furniture-functions` merge). Do not push; ask whether to merge/push (fetch first — other sessions push to `main` concurrently).
