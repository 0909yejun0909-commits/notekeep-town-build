# Stardew-style overworld scenery — design

**Status:** built on branch `town-visuals` (off `multiplayer`), 2026-09-25.

## Why

The overworld was one flat grass colour with evenly spread single flowers and lone trees.
It had no water, no edges, no motion and no lighting, and every region looked the same.
Half the "wild" flowers also sat in pots: `Flowers.png` columns 5–9 are the potted
versions, and the old scatter picked from all 100 frames. The goal is a lived-in Stardew
town built from the Kenmi art we already license. The layout must stay deterministic,
because study-session guests rebuild the host's town locally.

## What's in the town

- **Ground.** Tone patches from Grass_Tiles_2/3/4 are autotiled over the base meadow and
  chosen by region biome. Grass tufts, pebbles on the paths, and a cobbled square are
  drawn into Phaser tilemap layers, which cull off-screen tiles.
- **Forest ring.** A solid border of overlapping big and medium trees (`BORDER = 7`
  tiles) surrounds the town. Its darker floor frays into the meadow, and groves thicken
  near it.
- **Groves.** Low-frequency noise places the trees, with the species mix set by biome.
  Only trunks block, so you walk under canopies. Bushes, rocks, stumps, logs and
  mushrooms gather at grove edges.
- **Flowers and grass.** Flower beds of animated, un-potted flowers use one colour per
  bed. Swaying grass tufts are scattered across the open meadow.
- **Ponds.** Up to four ponds, each dug into the roomiest open site furthest from the
  other ponds. The water is animated, with lily pads, cattails and water rocks. Water is
  blocked, so roads route around it.
- **Town square.** The region with the most houses gets a fountain on cobble with
  benches, bunting and lamps, joined into the road network. Every other region gets a
  well.
- **Yards.** Potted flowers flank each door. A lamp post and a flower barrel stand
  beside each house, and more lamps line the roads.
- **Ambience.** Butterflies by day and fireflies by night; cloud shadows, falling
  leaves and wind swirls.
- **Lighting.** Driven by the local clock. A MULTIPLY tint moves through dawn pink, day,
  golden hour, dusk violet and night blue. Stepped ADD glows at lamps and doors fade in
  towards night. The camera gets a light saturation boost and a vignette. For demos,
  `?time=dawn|day|golden|dusk|night` pins a phase, and the **N** key cycles through the
  phases and back to the clock.

## How it's built

`OverworldScene.create()` lays out regions as before (now with `REGION_PAD = 8` and every
origin offset by `BORDER`), then runs the generators in order. Each generator reads and
marks the shared `WorldGrid` (`game/worldGrid.ts`): `blocked`, `road`, `water`, `plaza`,
`keepClear` (door entries and the tile below them) and `used`.

1. `buildForestBorder` (`game/nature.ts`)
2. `placePlazas` (`game/townProps.ts`)
3. `placePonds` (`game/water.ts`)
4. `buildRoads` (`game/tilemap.ts`, now also given the plaza cells, and no longer drawing)
5. `buildGround` (`game/ground.ts`)
6. `renderWater`, `renderPlazas`, `renderYards`
7. `buildGroves`, `buildGroundCover` (`game/nature.ts`)
8. After the player and NPCs: `attachDaylight` (`game/daylight.ts`) and `attachAmbience`
   (`game/ambience.ts`)

Everything that affects walkability comes from `game/noise.ts`, seeded by the world name,
so hosts and guests generate identical towns. Only the ambient layer uses `Math.random`.

The art is copied into `public/assets/scenery/` by `scripts/install-assets.sh` (still
gitignored). `game/sceneryAssets.ts` loads it and records the frame layouts.

Untouched: house interiors, `lib/types.ts` and the vault parser.

## Verified

- Demo town: all doors are reachable from spawn. Entering and exiting a house works, and
  you come back out in front of the door.
- A scene restart (the exterior-editor path) regenerates identical scenery and keeps the
  player's tile.
- A synthetic 12-region town (158×110 tiles, about 3,000 objects) generates in about
  0.2 s, runs at 57–59 fps in headless Chrome, and every one of its 30 doors is reachable.
- `npm test` (42 pass), `npx tsc --noEmit` and `npm run build` are all clean.
