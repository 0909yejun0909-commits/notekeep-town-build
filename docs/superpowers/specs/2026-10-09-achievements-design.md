# Achievements — design

## Goal

Milestones the player earns by playing. Each achievement unlocks a reward: a **special outfit**, a **pet**, or a
**house style**. Rewards appear (locked) in the existing pickers and become selectable once earned.

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
  | { kind: 'pet'; id: PetId }
  | { kind: 'houseStyle'; material?: MaterialId; wallColor?: WallColor; roofColor?: RoofColor; shape?: number };

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

### UI (React overlay, per house style)

- `components/AchievementToast.tsx` — banner on unlock, reuses the wallet notice pattern and an audio-engine chime.
- `components/AchievementsPanel.tsx` — opened from a trophy button next to the coin purse: progress bars; secret
  achievements show "???" until unlocked.
- `CharacterCreator.tsx` — new "Special outfit" and "Pet" rows. Locked entries are greyed with
  "Unlock: <achievement name>". "None" always available.
- `ExteriorEditor.tsx` — locked materials/colors/shapes greyed the same way.
- Equipping goes through the existing `appearance` flow (`appearance-changed` bus event restarts the scene).

### Rewards in the game

- **Special outfit (skin):** when equipped, `dressPlayer` hides the layered outfit and shows a Ninja Adventure
  character sheet instead (same base position/depth sync). Open question below on height.
- **Pet:** `game/pet.ts` — a sprite that trails the player a few tiles behind along the player's recent path, in
  both `OverworldScene` and `InteriorScene`. Ninja animal sheets are 32x16 (two 16x16 frames): a 2-frame walk plus a
  small bob, flip for facing. Never blocks movement or collision.
- **House styles:** v1 locks *existing* materials (stone, limestone), wall/roof colors and shapes — no new art
  needed. If the Ninja house tilesets prove usable as building sprites they can be added later as extra shapes.
  Locking is enforced in `ExteriorEditor` and `canUse` helpers in `lib/houseCatalog.ts`; houses already saved
  with a now-locked option keep it (no retroactive stripping).

## Risks and open questions

1. **Skin height.** Ninja characters are 16x16 (one tile, 4 cols x 7 rows); the player is two tiles tall. Integer
   zoom rules out scaling. Plan: a first spike renders one skin in the overworld to judge. Fallbacks, in order:
   (a) accept the shorter skins as "chibi" skins, (b) draw skins as a 16x32 composite with the character on a
   16x16 body-double, (c) drop skins and ship outfit rewards as locked recolors of the existing layers.
2. **Style mismatch.** Ninja Adventure's palette differs from the Kenmi/Stardew look. Judge from a screenshot in
   the spike; pets are the least affected.
3. **Gating vs. fun.** Locking existing house options changes what's free today. Existing saves are
   grandfathered, but new players lose immediate access to stone/limestone/colors until earned.

## Testing

- Unit tests (`*.test.mts`, like `catalog.test.mts`): registry integrity (unique ids, rewards reference real
  art ids), `track` threshold crossing, distinct-set counting, corrupt-storage fallback, unlock idempotence.
- Manual: unlock via an OPFS test vault, confirm toast, panel, locked/unlocked picker states, pet follows in
  overworld and interiors, reload persists.

## Build order

1. Spike: one skin + one pet rendered in the game (answers risks 1 and 2).
2. Registry + store + tests.
3. Event wiring + toast + panel.
4. Picker locking (CharacterCreator, ExteriorEditor).
5. Pet follow, skin rendering.
6. Art install script + `docs/ASSETS.md` provenance.
