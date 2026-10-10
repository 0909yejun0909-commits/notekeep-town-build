# Achievements — design

## Goal

Milestones the player earns by playing. Each achievement unlocks a reward: a **class outfit** (knight, wizard, ninja…)
or a **pet**. House styles are out of scope. Rewards appear (locked) in the existing pickers and become selectable once earned.

Triggers: game activity plus a few secret achievements. Vault-growth triggers (writing or editing real notes)
are out of scope.

Everything stays client-side, persisted in `localStorage` per vault — no backend, matching the rest of the app.

## Non-goals (v1)

- Study-desk / quiz-streak achievements — that code lives on the unpushed `furniture-functions` branch. The registry
  is built so these are one entry each once it merges.
- Showing your pet or special outfit to other players. Multiplayer sync is a follow-up; v1 is local only.
- Any new gameplay for pets (no feeding, no stats).

## Art and licensing

Reward art comes from **Ninja Adventure Asset Pack** (Pixel-boy & AAA), released **CC0** — commercial use and
redistribution allowed, no attribution required (credit is polite and goes in `docs/ASSETS.md`).

Packs deliberately **not** used: Modern Interiors Free and Farm RPG Free (non-commercial / unverified), the Stardew
asset rip (copyrighted game art), Super Retro World (no direct redistribution, and bans "IA" projects — the NPC
dialogue route calls Claude), Craftpix Ruined Temple, Ghostpixxells Pixel Food and Tiny RPG Soldier & Orc
(licenses unverified).

Art flows through the existing pipeline: `scripts/install-assets.sh` copies it into `public/assets/` (gitignored).
`docs/ASSETS.md` gets one line per source pack with its license, so provenance is checkable before release.

## Architecture

### `lib/achievements.ts` — registry (pure data, no React/Phaser)

```ts
type Reward =
  | { kind: 'skin'; id: SkinId }
  | { kind: 'pet'; id: PetId };

type Achievement = {
  id: string; name: string; description: string;
  secret: boolean;
  stat: StatKey; target: number;   // unlocks when stats[stat] >= target
  reward: Reward;
};
```

Stats are monotonic counters. One-off secrets use a stat with `target: 1`. Adding an achievement is a single registry
entry plus its art; no other code changes.

Starter set (~15; names/targets tunable):

| Stat | Examples |
|---|---|
| `notesRead` | 1, 10, 50 |
| `housesVisited` (distinct) | 5, every house in a region |
| `coinsEarned` (lifetime) | 100, 500 |
| `furniturePlaced` | 10, 25 |
| `exteriorsChanged` | 3 |
| secrets | enter every biome; stand still 60 s; walk 1,000 tiles |

### `lib/achievementStore.ts` — state

Modelled on `lib/walletStore.ts`: module-level session, `startAchievements(vaultName, persist)` /
`stopAchievements()`, `useSyncExternalStore` hook, localStorage key `achievements:<vault>`, demo town not persisted.

State: `{ stats: Record<StatKey, number>, distinct: Record<string, string[]>, unlocked: Record<id, timestamp>,
equipped: { skin: SkinId | null, pet: PetId | null } }`.

API: `track(stat, amount = 1)` and `trackDistinct(stat, value)` (adds to a set; counter = set size). Each call re-checks
the registry; new unlocks publish a toast and persist. Corrupt/missing storage falls back to empty state, same
validation style as `walletStore.load`.

### Event sources (thin, no logic)

Game code only calls `track*`. Wired at existing seams: `bus` events (`open-note`, `enter-house`, `fast-travel`,
`commit-interior-layout`, `commit-exterior-variant`), wallet earnings in `walletStore.noteSaved`, and a small
per-scene idle/steps accumulator in the overworld update loop for the movement secrets.

### UI (React overlay, as elsewhere in the app)

- `components/AchievementToast.tsx` — banner on unlock, reuses the wallet notice pattern and an audio-engine chime.
- `components/AchievementsPanel.tsx` — opened from a trophy button next to the coin purse: progress bars; secret
  achievements show "???" until unlocked.
- `CharacterCreator.tsx` — new "Special outfit" and "Pet" rows. Locked entries are greyed with
  "Unlock: <achievement name>". "None" always available.
- Equipping goes through the existing `appearance` flow (`appearance-changed` bus event restarts the scene).

### Rewards in the game

- **Special outfit (skin):** when equipped, `dressPlayer` hides the layered outfit and shows a Ninja Adventure
  character sheet instead (same base position/depth sync). Open question below on height.
- **Pet:** `game/pet.ts` — a sprite that trails the player a few tiles behind along the player's recent path, in
  both `OverworldScene` and `InteriorScene`. Ninja animal sheets are 32x16 (two 16x16 frames): a 2-frame walk plus a
  small bob, flip for facing. Never blocks movement or collision.

### Class roster (all from Ninja Adventure `Actor/Character`, CC0)

Skins are grouped into classes, so the rewards read as a progression rather than a random list. Early achievements
give common skins, hard and secret ones give gold/rare variants.

| Class | Skins (folder names) |
|---|---|
| Knights | `Knight`, `KnightGold`, `FighterRed`, `FighterWhite`, `GladiatorBlue`, `RedGladiator` |
| Wizards | `SorcererBlack`, `SorcererOrange`, `NinjaMageBlack`, `NinjaMageOrange`, `Shaman`, `Master` |
| Ninjas | `NinjaBlue`, `NinjaDark`, `NinjaFire`, `NinjaThunder`, `NinjaWater`, `NinjaLeaf`, … |
| Samurai | `Samurai`, `SamuraiBlue` |
| Royalty | `Princess`, `Noble`, `Sultan`, `Sultan2` |
| Spooky (secrets) | `Vampire`, `Skeleton`, `SkeletonDemon`, `Spirit`, `GoldStatue` |
| Fun | `Monk`, `Hunter`, `Inspector`, `RobotGreen`, `Eskimo`, `Caveman` |

The picker shows one tab per class. The exact skin-to-achievement mapping is a tuning table in the registry.
(Tiny RPG Soldier & Orc also has a soldier and orc, but its license is unverified, so it is not used.)

## Risks and open questions

1. **Skin height.** Ninja characters are 16x16 (one tile, 4 cols x 7 rows); the player is two tiles tall. Integer
   zoom rules out scaling. Plan: a first spike renders one skin in the overworld to judge. Fallbacks, in order:
   (a) accept the shorter skins as "chibi" skins, (b) draw skins as a 16x32 composite with the character on a
   16x16 body-double, (c) drop skins and ship outfit rewards as locked recolors of the existing layers.
2. **Style mismatch.** Ninja Adventure's palette differs from the Kenmi/Stardew look. Judge from a screenshot in
   the spike; pets are the least affected.

## Testing

- Unit tests (`*.test.mts`, like `catalog.test.mts`): registry integrity (unique ids, rewards reference real
  art ids), `track` threshold crossing, distinct-set counting, corrupt-storage fallback, unlock idempotence.
- Manual: unlock via an OPFS test vault, confirm toast, panel, locked/unlocked picker states, pet follows in
  overworld and interiors, reload persists.

## Build order

1. Spike: one skin + one pet rendered in the game (answers risks 1 and 2).
2. Registry + store + tests.
3. Event wiring + toast + panel.
4. Picker locking and class tabs (CharacterCreator).
5. Pet follow, skin rendering.
6. Art install script + `docs/ASSETS.md` provenance.

## Changes made while planning and building

- **Roster trimmed to what achievements grant:** 16 skins and 8 pets, 24 achievements. The "Fun" class is dropped for now; adding more later is one catalog line plus one registry line. Pets are limited to the 8 animals whose `SpriteSheet.png` is a confirmed 32x16 (two 16x16 frames).
- **`furniturePlaced` became `roomFurniture`:** the bus reports one room's layout per commit, so the stat is the most pieces in a single room (`layout.placements.length`, max), not a lifetime total.
- **"Enter every biome" became `biomesTried`:** biome is a town-wide picker (forest/snow/desert), not a place you walk into.
- **Class tabs became a grouped strip:** skins are shown in one wrapping strip ordered by class, with the class in the tooltip.
- **Rewards UI only in the in-game wardrobe**, not the title screen, because no vault is open there to unlock anything.
- **No game-input pause while the achievements panel is open** (v1 limitation).
- **Skin height:** Ninja skins are 16px against the default character's ~26px; accepted as "chibi" skins after a visual check (spec risk 1, fallback a).

## Outfits rebuilt on the Kenmi kit (2026-10-09, after first playtest)

The Ninja Adventure character skins were built, tried in game and rejected: they are 16px chibi sprites and
looked pasted-in next to the Kenmi player and NPCs at every scale (1x too short, 2x a giant, 1.5x a blur of
non-integer pixels). Outfit rewards are now **layer stacks from the Kenmi player kit** (plate armour in several
metals, royal, lumberjack, farmer) plus **generated wizard hats**, so they match the NPCs and need no scaling.
- Roster: 7 knights, 4 wizards, 3 royal, 2 villagers = 16 outfits; the achievements still grant them 1:1.
- Ninjas, samurai and spooky classes are dropped; they would need hand-drawn art.
- An outfit may include the player's own hair (`@hair` layer) and always replaces the picked clothes.
- Sitting and lying poses work for free because they already composite from layers.
- Pets still use Ninja Adventure (CC0); small animals look fine.
