import Phaser from 'phaser';
import type { Appearance, House, MaterialId, Region, RoofColor, TownBiome, WallColor, WorldModel } from '@/lib/types';
import { DEFAULT_APPEARANCE } from '@/lib/characterCatalog';
import { regionSize } from '@/lib/vault/parse';
import { buildHouses, buildRoads, type Entry } from '@/game/tilemap';
import { GridMovement, TILE, tileToWorld, worldToTile } from '@/game/gridMovement';
import { dressPlayer } from '@/game/playerSprite';
import { spawnPet } from '@/game/pet';
import { trackMovement } from '@/game/achievementHooks';
import { getEquipped } from '@/lib/achievementStore';
import { spawnNpcs, type NpcSpawnArea } from '@/game/npc';
import { applyExteriorOverride, getExteriorOverride, saveExteriorOverride } from '@/lib/exteriorStore';
import { bus } from '@/game/bus';
import { attachRemotePlayers } from '@/game/remotePlayers';
import { hash } from '@/lib/types';
import {
  DEFAULT_MATERIAL, DEFAULT_WALL_COLOR, HOUSE_FOOTPRINT, ROOF_COLORS, STARTER_HOUSE_VARIANT, houseTextureKey,
} from '@/lib/houseCatalog';
import { houseFits } from '@/game/housePlacement';
import { key, type WorldGrid } from '@/game/worldGrid';
import { buildGround, GID_WATER, retileRoads, type Ground as GroundTiles } from '@/game/ground';
import { placePonds, renderWater } from '@/game/water';
import { placePlazas, renderPlazas, renderYards } from '@/game/townProps';
import { buildForestBorder, buildGroundCover, buildGroves } from '@/game/nature';
import { attachDaylight } from '@/game/daylight';
import { attachAmbience } from '@/game/ambience';
import { DEFAULT_TOWN_BIOME } from '@/lib/biome';
import { BIOME_BACKDROP, skin, skinAnim } from '@/game/biomeArt';
import { ensureWinterTextures } from '@/game/winterArt';
import { ensureDesertTextures } from '@/game/desertArt';
import { setPlace } from '@/game/audio/music';
import { setGround, type Ground } from '@/game/audio/sfx';
import { getLabelSource, setLabelSource, type SceneLabel } from '@/game/sceneLabels';
import { MINIMAP_TILE, getMinimapSource, setMinimapSource, type MinimapSource } from '@/game/minimap';
import { currentPresences, setSelfPresence } from '@/lib/multiplayer/session';
import {
  BRUSH, GROUND_PRICE, PLOT, PLOT_MARGIN, PLOT_PRICE, TOWN_PROP_BY_ID, emptyTownEdits, loadTownEdits, parseTownEdits, saveTownEdits,
  type TownEdits, type TownProp, type TownTool,
} from '@/lib/townEdits';
import {
  buildable, claimProp, cutTrees, drawProp, paintWater, waterable, drawTallGrass, paintable, paintRoads, placeProps, propCells,
  releaseProp, renderTallGrass,
} from '@/game/townEdits';
import { spend, walletNow } from '@/lib/walletStore';
import { cloudArea, drawPlotCloud, openPlot, partClouds, plotAt, plotReachable, plotsAround, type Plot, type PlotCloud } from '@/game/plots';

const REGION_PAD = 8;
// Solid forest around the whole town, so the map ends in trees instead of flat grass.
const BORDER = 7;

export default class OverworldScene extends Phaser.Scene {
  private movement: GridMovement | null = null;
  private player: Phaser.GameObjects.Sprite | null = null;
  private doors = new Map<string, string>();
  private lastDoorKey: string | null = null;
  private fingerprint: string | undefined;
  private editingExterior = false;
  private houseLabels: { id: string; text: string; x: number; y: number; w: number }[] = [];

  // Village building: the town's grid and the player's edits to it, kept live while building.
  private grid: WorldGrid | null = null;
  private town: TownEdits = emptyTownEdits();
  private propObjects = new Map<TownProp, Phaser.GameObjects.GameObject[]>();
  // Ground painted this visit, drawn as plain tiles until the town is rebuilt on Done.
  private paintObjects = new Map<string, Phaser.GameObjects.GameObject[]>();
  private building = false;
  private tool: TownTool | null = null;
  private hover: Phaser.GameObjects.Graphics | null = null;
  // Set when a brush stroke added or took away water: the town is redrawn when it ends.
  private waterChanged = false;
  // Land for sale around the town (game/plots.ts), the shade over each locked one, and the
  // town's size in plots.
  private plots: Plot[] = [];
  private plotClouds = new Map<string, PlotCloud>();
  private plotSize: [number, number] = [0, 0];
  // Every plot not bought is under cloud, and the forest beyond it. The ones touching the town
  // or land already bought can be bought next. Set while a bought plot's clouds part.
  private forSale = new Set<string>();
  private clouded: (x: number, y: number) => boolean = () => false;
  private plotAtTile: (x: number, y: number) => string = () => '';
  private revealing = false;
  private plotHover: Phaser.GameObjects.Graphics | null = null;
  private ground: GroundTiles | null = null;

  private onCommitExterior = ({
    houseId,
    variant,
    material,
    wallColor,
    roofColor,
  }: {
    houseId: string;
    variant: number;
    material: MaterialId;
    wallColor: WallColor;
    roofColor: RoofColor;
  }) => {
    if (!this.fingerprint) return;
    saveExteriorOverride(this.fingerprint, houseId, variant, material, wallColor, roofColor);
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

  private onWorldUpdated = ({ exteriorChanged }: { exteriorChanged: boolean }) => {
    if (!exteriorChanged || !this.player) return;
    const { gx, gy } = worldToTile(this.player.x, this.player.y);
    this.game.registry.set('returnTile', { gx, gy });
    this.scene.restart();
  };

  // components/BiomePicker.tsx writes the registry; rebuild the town in place around the player.
  private onBiomeChange = () => {
    if (this.player) {
      const { gx, gy } = worldToTile(this.player.x, this.player.y);
      this.game.registry.set('returnTile', { gx, gy });
    }
    this.scene.restart();
  };

  constructor() {
    super('OverworldScene');
  }

  create() {
    // Back to the usual pixel size if a house room asked for a smaller one (game/config.ts).
    if (this.game.registry.get('minView')) this.game.registry.set('minView', null);
    this.game.registry.events.on('changedata-townBiome', this.onBiomeChange);
    this.events.once('shutdown', () => this.game.registry.events.off('changedata-townBiome', this.onBiomeChange));

    const world = this.game.registry.get('world') as WorldModel | undefined;
    if (!world || world.regions.length === 0) return;

    const biome = (this.game.registry.get('townBiome') as TownBiome | undefined) ?? DEFAULT_TOWN_BIOME;
    setPlace(biome);
    if (biome === 'snow') ensureWinterTextures(this);
    if (biome === 'desert') ensureDesertTextures(this);

    this.doors = new Map();
    this.houseLabels = [];
    this.lastDoorKey = null;
    this.editingExterior = false;
    this.building = false;
    this.tool = null;
    this.propObjects = new Map();
    this.paintObjects = new Map();

    this.fingerprint = this.game.registry.get('vaultFingerprint') as string | undefined;
    const isGuest = this.game.registry.get('role') === 'guest';
    this.town = isGuest
      ? parseTownEdits(this.game.registry.get('sessionTown'))
      : this.fingerprint ? loadTownEdits(this.fingerprint) : emptyTownEdits();
    if (this.fingerprint) {
      for (const region of world.regions) {
        for (const house of region.houses) {
          const saved = getExteriorOverride(this.fingerprint, house.id);
          if (saved !== null) applyExteriorOverride(house, saved);
        }
      }
    }

    const sizes = world.regions.map((r) => regionSize(r));
    const cols = Math.max(1, Math.ceil(Math.sqrt(world.regions.length)));
    const rows = Math.max(1, Math.ceil(world.regions.length / cols));
    const maxW = Math.max(...sizes.map(([w]) => w));
    const maxH = Math.max(...sizes.map(([, h]) => h));
    const cellW = maxW + REGION_PAD;
    const cellH = maxH + REGION_PAD;
    // The town, rounded up to whole plots, inside the band of plots for sale, inside the forest.
    const plotCols = Math.ceil((cols * cellW) / PLOT);
    const plotRows = Math.ceil((rows * cellH) / PLOT);
    const inset = BORDER + PLOT_MARGIN;
    const worldW = plotCols * PLOT + inset * 2;
    const worldH = plotRows * PLOT + inset * 2;

    this.add
      .tileSprite(0, 0, worldW * TILE, worldH * TILE, skin(this, biome, 'terrain-grass'))
      .setOrigin(0, 0)
      .setDepth(-1000);

    const blocked = new Set<string>();
    const houseGaps = new Set<string>();
    const houseCells = new Set<string>();
    const entries: Entry[] = [];
    const areas: NpcSpawnArea[] = [];
    const grid: WorldGrid = {
      w: worldW,
      h: worldH,
      seed: hash(world.name),
      border: inset,
      forest: BORDER,
      open: new Set(),
      blocked,
      road: new Set(),
      water: new Set(),
      plaza: new Set(),
      keepClear: new Set(),
      used: new Set(),
      areas: [],
      houses: [],
      lights: [],
      trees: [],
      edgeBushes: new Map(),
      biome,
      skin: (k) => skin(this, biome, k),
      skinAnim: (k) => skinAnim(this, biome, k),
    };

    world.regions.forEach((region, i) => {
      const [w, h] = sizes[i];
      const originGx = inset + (i % cols) * cellW + Math.floor(REGION_PAD / 2);
      const originGy = inset + Math.floor(i / cols) * cellH + Math.floor(REGION_PAD / 2);
      areas.push({ originGx, originGy, width: w, height: h });
      grid.areas.push({ region, originGx, originGy, width: w, height: h });
      // Houses the player placed stand where they put them (a copy: the world's own house
      // positions size the region, so they're left as laid out).
      const pins = this.town.houses;
      const placed: Region = {
        ...region,
        houses: region.houses.map((hs) => (pins[hs.id] ? { ...hs, gx: pins[hs.id][0] - originGx, gy: pins[hs.id][1] - originGy } : hs)),
      };
      const result = buildHouses(this, placed, originGx, originGy, biome);
      result.blocked.forEach((k) => blocked.add(k));
      result.blocked.forEach((k) => houseCells.add(k));
      result.open.forEach((k) => houseGaps.add(k));
      result.doors.forEach((houseId, key) => this.doors.set(key, houseId));
      entries.push(...result.entries);
      for (const e of result.entries) {
        const house = placed.houses.find((hs) => hs.id === e.houseId)!;
        const [hw, hh] = HOUSE_FOOTPRINT[house.variant] ?? HOUSE_FOOTPRINT[0];
        grid.houses.push({ houseId: house.id, gx: originGx + house.gx, gy: originGy + house.gy, w: hw, h: hh, entryGx: e.gx, entryGy: e.gy });
        grid.keepClear.add(key(e.gx, e.gy));
        grid.keepClear.add(key(e.gx, e.gy + 1));
      }

      for (const house of region.houses) {
        const img = result.houseImages.get(house.id);
        if (img) this.houseLabels.push({ id: `house:${house.id}`, text: house.name, x: img.x + img.displayWidth / 2, y: img.y, w: img.displayWidth });
      }

      if (!isGuest) {
        for (const house of region.houses) {
          const img = result.houseImages.get(house.id);
          if (!img) continue;
          img
            .setData('houseId', house.id)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => this.openExteriorEditor(house, region));
        }
      }
    });

    // houseId -> door tile, so fast travel can send the player back out the right door.
    const houseDoors = new Map<string, { gx: number; gy: number }>();
    this.doors.forEach((houseId, key) => {
      const [gx, gy] = key.split(',').map(Number);
      houseDoors.set(houseId, { gx, gy });
    });
    this.game.registry.set('houseDoors', houseDoors);

    // Order matters: each step avoids what the earlier ones claimed. Roads come after the
    // plazas and ponds so they route around them, and everything decorative comes after roads.
    buildForestBorder(this, grid);
    // Land bought is town from here on: roads may run onto it, and edits can go down on it.
    this.plots = plotsAround(inset, inset, plotCols, plotRows);
    this.plotSize = [plotCols, plotRows];
    const owned = new Set(this.town.plots);
    for (const p of this.plots) if (owned.has(p.id)) openPlot(grid, p, houseCells);
    this.forSale = new Set(this.plots.filter((p) => !owned.has(p.id) && plotReachable(p, plotCols, plotRows, owned)).map((p) => p.id));
    this.revealing = false;
    const townRight = inset + plotCols * PLOT;
    const townBottom = inset + plotRows * PLOT;
    // The plot a tile's cloud belongs to: forest goes with the plot it borders.
    this.plotAtTile = (x, y) => {
      if (x >= inset && y >= inset && x < townRight && y < townBottom) return '';
      const cx = Math.min(Math.max(x, BORDER), worldW - BORDER - 1);
      const cy = Math.min(Math.max(y, BORDER), worldH - BORDER - 1);
      return `${Math.floor((cx - inset) / PLOT)},${Math.floor((cy - inset) / PLOT)}`;
    };
    this.clouded = (x, y) => {
      const id = this.plotAtTile(x, y);
      return id !== '' && !owned.has(id);
    };
    const { plazas, anchors, wells } = placePlazas(grid);
    placePonds(grid);
    // The player's own village edits, each slotted in where it can't move anything else
    // (game/townEdits.ts).
    paintWater(grid, this.town);
    grid.road = buildRoads([...entries, ...anchors], blocked, worldW, worldH, grid.plaza);
    const cut = new Set(this.town.cut);
    cutTrees(grid, cut, true);
    paintRoads(grid, this.town);
    this.propObjects = placeProps(this, grid, this.town);
    this.paintObjects = renderTallGrass(this, grid, this.town);
    const underfoot: Ground = biome === 'snow' ? 'snow' : biome === 'desert' ? 'sand' : 'grass';
    setGround((gx, gy) => (grid.plaza.has(key(gx, gy)) ? 'stone' : grid.road.has(key(gx, gy)) ? 'road' : underfoot));
    const ground = buildGround(this, grid);
    this.ground = ground;
    renderWater(this, grid, ground.map, GID_WATER);
    renderPlazas(this, grid, plazas, wells);
    renderYards(this, grid);
    buildGroves(this, grid);
    buildGroundCover(this, grid);
    cutTrees(grid, cut, false);
    for (const k of houseGaps) if (!grid.used.has(k)) blocked.delete(k);
    this.plotClouds = new Map(
      this.plots.filter((p) => !owned.has(p.id)).map((p) => [p.id, drawPlotCloud(this, p, cloudArea(p, plotCols, plotRows, worldW, worldH))]),
    );
    this.plotHover = this.add.graphics().setDepth(1e6 - 1);
    // Rebuilt after buying land while building: carry on building.
    if (this.game.registry.get('resumeBuilding')) this.onOpenTownEditor();
    this.game.registry.remove('resumeBuilding');
    this.grid = grid;
    if (this.placeNewHouses(grid)) return;

    // Coming back out of a house puts the player on the road in front of that door.
    const returnTile = this.game.registry.get('returnTile') as { gx: number; gy: number } | undefined;
    this.game.registry.remove('returnTile');
    const first = entries[0];
    let spawnGx = returnTile ? returnTile.gx : first ? first.gx : Math.floor(worldW / 2);
    let spawnGy = returnTile ? returnTile.gy : first ? first.gy + 2 : Math.floor(worldH / 2);
    // A saved returnTile can be stale after an exterior-variant commit reshapes the world —
    // regionSize() growing or shrinking shifts every region's shared cellW/cellH origin, so a
    // tile that was valid before the restart can now sit outside the new world. Clamp before
    // (and after) the walkable-search loop so a shrink never strands the player off-camera.
    spawnGx = Math.min(Math.max(spawnGx, 0), worldW - 1);
    spawnGy = Math.min(Math.max(spawnGy, 0), worldH - 1);
    let guard = 0;
    while ((blocked.has(`${spawnGx},${spawnGy}`) || this.doors.has(`${spawnGx},${spawnGy}`)) && guard < worldH) {
      spawnGy += 1;
      guard += 1;
    }
    spawnGy = Math.min(spawnGy, worldH - 1);

    const spawn = tileToWorld(spawnGx, spawnGy);
    const player = this.add.sprite(spawn.x, spawn.y, 'player');
    player.setOrigin(0.5, 0.64);
    player.setDepth(player.y);
    const appearance = (this.game.registry.get('appearance') as Appearance | undefined) ?? DEFAULT_APPEARANCE;
    const equipped = getEquipped();
    dressPlayer(this, player, appearance, equipped.skin);
    spawnPet(this, player, equipped.pet, (y) => y);
    this.player = player;

    const isWalkable = (gx: number, gy: number) => {
      if (gx < 0 || gy < 0 || gx >= worldW || gy >= worldH) return false;
      return !blocked.has(`${gx},${gy}`);
    };

    this.movement = new GridMovement(this, player, isWalkable);
    this.movement.onStep = (gx, gy, facing) => setSelfPresence({ scene: 'overworld', gx, gy, facing });
    trackMovement(this, this.movement);
    setSelfPresence({ scene: 'overworld', gx: spawnGx, gy: spawnGy, facing: 'down' });
    attachRemotePlayers(this, 'overworld', player);

    this.game.registry.set('player', player);
    this.game.registry.set('isWalkable', isWalkable);

    // NPCs read isWalkable from the registry, so they spawn only after it is published.
    world.regions.forEach((region, i) => spawnNpcs(this, region, areas[i]));

    attachAmbience(this, grid, attachDaylight(this, grid));

    // Woods-coloured backdrop so any space beyond the world reads as more of the ring, and a
    // world smaller than the view sits centred instead of hugging the top-left.
    const cam = this.cameras.main;
    cam.setBackgroundColor(BIOME_BACKDROP[biome]);
    const worldWidthPx = worldW * TILE;
    const worldHeightPx = worldH * TILE;
    const fit = () => {
      const bx = Math.min(0, Math.floor((worldWidthPx - cam.width) / 2));
      const by = Math.min(0, Math.floor((worldHeightPx - cam.height) / 2));
      cam.setBounds(bx, by, Math.max(worldWidthPx, cam.width), Math.max(worldHeightPx, cam.height));
    };
    fit();
    this.scale.on(Phaser.Scale.Events.RESIZE, fit);
    this.events.once('shutdown', () => this.scale.off(Phaser.Scale.Events.RESIZE, fit));
    cam.startFollow(player, true);

    setLabelSource(this.projectLabels);
    const minimap = this.minimapSource(world, grid, player);
    setMinimapSource(minimap);

    bus.on('commit-exterior-variant', this.onCommitExterior);
    bus.on('close-exterior-editor', this.onCloseExteriorEditor);
    bus.on('world-updated', this.onWorldUpdated);
    bus.on('open-town-editor', this.onOpenTownEditor);
    bus.on('close-town-editor', this.onCloseTownEditor);
    bus.on('town-tool', this.onTownTool);
    bus.on('place-house', this.onPlaceHouse);
    bus.on('cancel-place-house', this.endPlacing);
    bus.on('pin-houses', this.onPinHouses);
    bus.on('house-renamed', this.onHouseRenamed);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPlacePointer);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPlacePointer);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onBuildPointer);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onBuildPointer);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPlotPointer);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onStrokeEnd);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPlotPointer);
    this.input.on(Phaser.Input.Events.GAME_OUT, this.clearPlotHover);
    this.events.once('shutdown', () => {
      this.clearPlotHover();
      if (getLabelSource() === this.projectLabels) setLabelSource(null);
      if (getMinimapSource() === minimap) setMinimapSource(null);
      bus.off('commit-exterior-variant', this.onCommitExterior);
      bus.off('close-exterior-editor', this.onCloseExteriorEditor);
      bus.off('world-updated', this.onWorldUpdated);
      bus.off('open-town-editor', this.onOpenTownEditor);
      bus.off('close-town-editor', this.onCloseTownEditor);
      bus.off('town-tool', this.onTownTool);
      bus.off('place-house', this.onPlaceHouse);
      bus.off('cancel-place-house', this.endPlacing);
      bus.off('pin-houses', this.onPinHouses);
      bus.off('house-renamed', this.onHouseRenamed);
      this.placing = null;
    });
  }

  // House names float over their roofs as page text (see game/sceneLabels.ts), only for the
  // houses in view so a big vault doesn't put hundreds of labels on the page.
  private projectLabels = (): SceneLabel[] => {
    const cam = this.cameras.main;
    const view = cam.worldView;
    const rect = this.game.canvas.getBoundingClientRect();
    const px = rect.width / this.scale.width;
    const k = cam.zoom * px;
    return this.houseLabels
      .filter((l) => l.x + l.w / 2 > view.x && l.x - l.w / 2 < view.right && l.y > view.y && l.y - TILE < view.bottom)
      .map((l) => ({
        id: l.id,
        text: l.text,
        x: rect.left + (l.x - view.x) * k,
        y: rect.top + (l.y - 2 - view.y) * k,
        ox: 0.5,
        oy: 1,
        px,
        maxWidth: (l.w + TILE) * k,
      }));
  };

  // The map shows the town, the land for sale next to it (under its cloud, a lighter white), and
  // one plot's width of the cloud beyond: cropped to that, so it's drawn as large as it can be.
  private minimapSource(world: WorldModel, grid: WorldGrid, player: Phaser.GameObjects.Sprite): MinimapSource {
    let [x0, y0, x1, y1] = [grid.w, grid.h, 0, 0];
    for (let y = 0; y < grid.h; y++) {
      for (let x = 0; x < grid.w; x++) {
        if (this.clouded(x, y) && !this.forSale.has(this.plotAtTile(x, y))) continue;
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x + 1);
        y1 = Math.max(y1, y + 1);
      }
    }
    x0 = Math.max(0, x0 - PLOT);
    y0 = Math.max(0, y0 - PLOT);
    x1 = Math.min(grid.w, x1 + PLOT);
    y1 = Math.min(grid.h, y1 + PLOT);
    const w = Math.max(1, x1 - x0);
    const h = Math.max(1, y1 - y0);
    const tiles = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const gx = x + x0;
        const gy = y + y0;
        const k = key(gx, gy);
        tiles[y * w + x] = this.clouded(gx, gy)
          ? this.forSale.has(this.plotAtTile(gx, gy)) ? MINIMAP_TILE.forSale : MINIMAP_TILE.cloud
          : grid.water.has(k)
            ? MINIMAP_TILE.water
            : grid.road.has(k)
              ? MINIMAP_TILE.road
              : grid.plaza.has(k)
                ? MINIMAP_TILE.plaza
                : grid.blocked.has(k)
                  ? MINIMAP_TILE.blocked
                  : MINIMAP_TILE.grass;
      }
    }
    const byId = new Map(world.regions.flatMap((r) => r.houses.map((h) => [h.id, h] as const)));
    const cam = this.cameras.main;
    return {
      layout: {
        w,
        h,
        biome: grid.biome,
        tiles,
        houses: grid.houses.map((r) => ({
          id: r.houseId,
          name: byId.get(r.houseId)?.name ?? '',
          gx: r.gx - x0,
          gy: r.gy - y0,
          w: r.w,
          h: r.h,
          roof: byId.get(r.houseId)?.roofColor ?? 'red',
        })),
        areas: grid.areas.map((a) => ({ name: a.region.name, gx: a.originGx - x0, gy: a.originGy - y0, w: a.width, h: a.height })),
        townName: world.name,
      },
      frame: () => ({
        player: { x: player.x / TILE - x0, y: player.y / TILE - 0.5 - y0 },
        view: { x: cam.worldView.x / TILE - x0, y: cam.worldView.y / TILE - y0, w: cam.worldView.width / TILE, h: cam.worldView.height / TILE },
        peers: currentPresences()
          .filter(([, p]) => p.scene === 'overworld')
          .map(([, p]) => ({ x: p.gx + 0.5 - x0, y: p.gy + 0.5 - y0 })),
      }),
    };
  }

  // ------------------------------------------------------------ village building

  private onOpenTownEditor = () => {
    this.building = true;
    this.hover ??= this.add.graphics().setDepth(1e6);
    bus.emit('town-edited', { bag: this.town.bag });
  };

  // Everything is saved as it's made; rebuild so painted ground gets proper edges and the
  // new lamps light up at night.
  private onCloseTownEditor = () => {
    if (!this.building) return;
    this.building = false;
    this.tool = null;
    if (this.player) {
      const { gx, gy } = worldToTile(this.player.x, this.player.y);
      this.game.registry.set('returnTile', { gx, gy });
    }
    this.scene.restart();
  };

  private onTownTool = ({ tool }: { tool: TownTool | null }) => {
    this.tool = tool;
    this.hover?.clear();
  };

  private message(text: string) {
    bus.emit('town-message', { text });
  }

  // The end of a brush stroke that changed water: redraw the town so ponds get their shores,
  // and carry on building.
  private onStrokeEnd = () => {
    if (!this.waterChanged) return;
    this.waterChanged = false;
    this.rebuildKeepingBuild();
  };

  private rebuildKeepingBuild() {
    if (this.player) {
      const { gx, gy } = worldToTile(this.player.x, this.player.y);
      this.game.registry.set('returnTile', { gx, gy });
    }
    this.game.registry.set('resumeBuilding', this.building);
    this.scene.restart();
  }

  // ------------------------------------------------------------ placing a new house

  // A see-through copy of the new house follows the pointer, red where it can't go.
  private placing: { ghost: Phaser.GameObjects.Image; outline: Phaser.GameObjects.Graphics; at: { gx: number; gy: number } | null } | null = null;

  private onPlaceHouse = ({ name }: { name: string }) => {
    this.endPlacing();
    const variant = STARTER_HOUSE_VARIANT;
    const roof = ROOF_COLORS[hash(name) % ROOF_COLORS.length];
    const texture = skin(this, this.grid?.biome ?? DEFAULT_TOWN_BIOME, houseTextureKey(variant, DEFAULT_MATERIAL[variant], DEFAULT_WALL_COLOR[variant], roof));
    const ghost = this.add.image(0, 0, texture).setOrigin(0, 0).setAlpha(0.75).setDepth(1e6 - 2).setVisible(false);
    const outline = this.add.graphics().setDepth(1e6 - 1);
    this.hover?.clear();
    this.placing = { ghost, outline, at: null };
  };

  private endPlacing = () => {
    this.placing?.ghost.destroy();
    this.placing?.outline.destroy();
    this.placing = null;
  };

  private onPlacePointer = (p: Phaser.Input.Pointer) => {
    if (!this.placing || !this.grid) return;
    const variant = STARTER_HOUSE_VARIANT;
    const [w, h] = HOUSE_FOOTPRINT[variant];
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    // The pointer holds the house by its middle.
    const gx = Math.round(wp.x / TILE - w / 2);
    const gy = Math.round(wp.y / TILE - h / 2);
    const water = Object.keys(this.town.ground).filter((k) => this.town.ground[k] === 'water');
    const ok = houseFits(this.grid, variant, gx, gy, new Set([...this.town.props.flatMap(propCells), ...water]));
    const { ghost, outline } = this.placing;
    ghost.setPosition(gx * TILE, gy * TILE).setVisible(true).setTint(ok ? 0xffffff : 0xff5a5a);
    outline
      .clear()
      .fillStyle(ok ? 0x63c74d : 0xe43b44, 0.25)
      .fillRect(gx * TILE, gy * TILE, w * TILE, h * TILE)
      .lineStyle(2, ok ? 0xb8f28c : 0xff8a8a, 1)
      .strokeRect(gx * TILE + 1, gy * TILE + 1, w * TILE - 2, h * TILE - 2);
    this.placing.at = ok ? { gx, gy } : null;
    if (!p.isDown || p.event.type === 'pointermove' || p.event.type === 'mousemove') return;
    if (!ok) return this.message("Something's in the way there. Find a spot where the house isn't red.");
    // The region it went in: the one under it, or the nearest.
    const cx = gx + w / 2, cy = gy + h / 2;
    let region = '';
    let best = Infinity;
    for (const a of this.grid.areas) {
      const d = Math.max(a.originGx - cx, 0, cx - (a.originGx + a.width)) + Math.max(a.originGy - cy, 0, cy - (a.originGy + a.height));
      if (d < best) [region, best] = [a.region.id, d];
    }
    bus.emit('house-spot', { gx, gy, regionId: region });
  };

  // The new house goes where it was placed, and every other house stays exactly where it is now.
  private onPinHouses = ({ houseId, gx, gy }: { houseId: string; gx: number; gy: number }) => {
    for (const r of this.grid?.houses ?? []) this.town.houses[r.houseId] ??= [r.gx, r.gy];
    this.town.houses[houseId] = [gx, gy];
    this.endPlacing();
    this.saveTown();
  };

  // Renamed, the house would otherwise be laid out afresh under its new name, and the others
  // with it: every house is pinned where it stands first.
  private onHouseRenamed = ({ from, to }: { from: string; to: string }) => {
    for (const r of this.grid?.houses ?? []) this.town.houses[r.houseId] ??= [r.gx, r.gy];
    const at = this.town.houses[from];
    delete this.town.houses[from];
    if (at) this.town.houses[to] = at;
    this.saveTown();
  };

  // A town's houses stay where they first stood: the layout would otherwise move them as the
  // vault grows. A house that's new since (made in the notebook view, or a folder added on
  // disk) keeps the layout's spot if that's clear of every other house, else takes the open
  // ground nearest the middle of town. True when the town is redrawn with it.
  private placeNewHouses(grid: WorldGrid): boolean {
    if (!this.fingerprint || this.game.registry.get('role') === 'guest') return false;
    const todo = grid.houses.filter((h) => !this.town.houses[h.houseId]);
    if (todo.length === 0) return false;
    if (todo.length === grid.houses.length) {
      for (const r of grid.houses) this.town.houses[r.houseId] = [r.gx, r.gy];
      this.saveTown();
      return false;
    }
    for (const r of grid.houses) if (!todo.includes(r)) this.town.houses[r.houseId] ??= [r.gx, r.gy];
    const water = Object.keys(this.town.ground).filter((k) => this.town.ground[k] === 'water');
    const fixed = new Set([...this.town.props.flatMap(propCells), ...water]);
    const taken = grid.houses.filter((h) => !todo.includes(h)).map((h) => ({ gx: h.gx, gy: h.gy, w: h.w, h: h.h }));
    const clear = (gx: number, gy: number, w: number, h: number) =>
      taken.every((o) => gx + w + 1 <= o.gx || o.gx + o.w + 1 <= gx || gy + h + 1 <= o.gy || o.gy + o.h + 1 <= gy);
    for (const house of todo) {
      let spot: [number, number] | null = clear(house.gx, house.gy, house.w, house.h) ? [house.gx, house.gy] : null;
      const variant = Number(Object.keys(HOUSE_FOOTPRINT).find((v) => HOUSE_FOOTPRINT[+v][0] === house.w && HOUSE_FOOTPRINT[+v][1] === house.h) ?? STARTER_HOUSE_VARIANT);
      const cx = Math.floor(grid.w / 2 - house.w / 2);
      const cy = Math.floor(grid.h / 2 - house.h / 2);
      for (let r = 0; !spot && r < Math.max(grid.w, grid.h); r++) {
        for (let dy = -r; dy <= r && !spot; dy++) {
          for (let dx = -r; dx <= r && !spot; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            const gx = cx + dx;
            const gy = cy + dy;
            if (clear(gx, gy, house.w, house.h) && houseFits(grid, variant, gx, gy, fixed)) spot = [gx, gy];
          }
        }
      }
      spot ??= [house.gx, house.gy];
      this.town.houses[house.houseId] = spot;
      taken.push({ gx: spot[0], gy: spot[1], w: house.w, h: house.h });
    }
    this.saveTown();
    this.scene.restart();
    return true;
  }

  // ------------------------------------------------------------ land for sale

  private hoveredPlot: Plot | null = null;

  private clearPlotHover = () => {
    if (!this.hoveredPlot) return;
    this.hoveredPlot = null;
    this.plotHover?.clear();
    bus.emit('plot-hover', null);
  };

  // Pointing at a locked plot outlines it and shows its price (components/PlotTooltip.tsx);
  // clicking buys it. Not while a build tool is in hand, so a brush stroke never buys land.
  private onPlotPointer = (p: Phaser.Input.Pointer) => {
    const guest = this.game.registry.get('role') === 'guest';
    if (!this.grid || !this.plotHover || guest || !this.fingerprint || (this.building && this.tool) || this.placing) return this.clearPlotHover();
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    const plot = plotAt(this.plots, Math.floor(w.x / TILE), Math.floor(w.y / TILE));
    if (!plot || !this.plotClouds.has(plot.id) || this.revealing) return this.clearPlotHover();
    const owned = new Set(this.town.plots);
    const reachable = plotReachable(plot, ...this.plotSize, owned);
    if (p.isDown && p.event.type !== 'pointermove' && p.event.type !== 'mousemove') {
      if (!reachable) return this.message('Buy the land next to it first.');
      if (!spend(PLOT_PRICE)) return this.message(`This land costs ${PLOT_PRICE} coins. Write notes to earn more!`);
      this.buyPlot(plot);
      return this.clearPlotHover();
    }
    if (this.hoveredPlot === plot) return;
    this.hoveredPlot = plot;
    const color = reachable ? 0xffe066 : 0xb0a090;
    this.plotHover.clear().lineStyle(2, color, 1).strokeRect(plot.x * TILE + 1, plot.y * TILE + 1, PLOT * TILE - 2, PLOT * TILE - 2);
    const cam = this.cameras.main;
    const rect = this.game.canvas.getBoundingClientRect();
    const k = cam.zoom * (rect.width / this.scale.width);
    const mid = (plot.x + PLOT / 2) * TILE;
    bus.emit('plot-hover', {
      x: rect.left + (mid - cam.worldView.x) * k,
      y: rect.top + ((plot.y + PLOT / 2) * TILE - cam.worldView.y) * k,
      price: PLOT_PRICE,
      state: !reachable ? 'far' : walletNow().balance < PLOT_PRICE ? 'poor' : 'buy',
    });
  };

  // Bought land joins the town: rebuilt around the player, it gets the town's grass, tufts and
  // flowers, and the forest floor draws back to the land still for sale. Building carries on.
  private buyPlot(plot: Plot) {
    this.town.plots.push(plot.id);
    this.saveTown();
    const cloud = this.plotClouds.get(plot.id);
    this.plotClouds.delete(plot.id);
    this.revealing = true;
    if (!cloud) return this.rebuildKeepingBuild();
    partClouds(this, cloud, () => this.rebuildKeepingBuild());
  }

  private saveTown() {
    if (this.fingerprint) saveTownEdits(this.fingerprint, this.town);
    bus.emit('town-edited', { bag: this.town.bag });
  }

  // The tile under the pointer; for the ground brush, the brush's top-left tile with the
  // pointer at its middle.
  private tileAt(p: Phaser.Input.Pointer) {
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    if (this.tool?.kind === 'ground') {
      return { gx: Math.round(w.x / TILE - BRUSH / 2), gy: Math.round(w.y / TILE - BRUSH / 2) };
    }
    return { gx: Math.floor(w.x / TILE), gy: Math.floor(w.y / TILE) };
  }

  // The tiles the current tool would touch at (gx, gy), and whether it may.
  private toolCells(gx: number, gy: number): { cells: string[]; ok: boolean } {
    const g = this.grid!;
    const tool = this.tool!;
    if (tool.kind === 'prop') {
      const cells = propCells({ item: tool.item, gx, gy });
      return { cells, ok: cells.every((k) => buildable(g, k)) };
    }
    if (tool.kind === 'ground') {
      const cells: string[] = [];
      for (let dy = 0; dy < BRUSH; dy++) for (let dx = 0; dx < BRUSH; dx++) cells.push(key(gx + dx, gy + dy));
      return { cells, ok: cells.some((k) => paintable(g, k)) };
    }
    const prop = this.propAt(key(gx, gy));
    return { cells: prop ? propCells(prop) : [key(gx, gy)], ok: !!prop };
  }

  private propAt(k: string): TownProp | null {
    return [...this.propObjects.keys()].find((p) => propCells(p).includes(k)) ?? null;
  }

  private onBuildPointer = (p: Phaser.Input.Pointer) => {
    if (!this.building || !this.tool || !this.grid || !this.hover || this.placing) return;
    const { gx, gy } = this.tileAt(p);
    const { cells, ok } = this.toolCells(gx, gy);
    this.hover.clear();
    this.hover.fillStyle(ok ? 0x63c74d : 0xe43b44, 0.35).lineStyle(1, ok ? 0xb8f28c : 0xff8a8a, 1);
    for (const k of cells) {
      const [x, y] = k.split(',').map(Number);
      this.hover.fillRect(x * TILE, y * TILE, TILE, TILE).strokeRect(x * TILE + 0.5, y * TILE + 0.5, TILE - 1, TILE - 1);
    }
    // Ground paints while the button is held; everything else acts once per click.
    const pressed = p.isDown && (p.event.type === 'pointerdown' || p.event.type === 'mousedown' || this.tool.kind === 'ground');
    if (pressed) this.applyTool(gx, gy);
  };

  private applyTool(gx: number, gy: number) {
    const g = this.grid!;
    const tool = this.tool!;
    const k = key(gx, gy);

    if (tool.kind === 'prop') {
      const spec = TOWN_PROP_BY_ID[tool.item];
      const prop: TownProp = { item: tool.item, gx, gy };
      if (!propCells(prop).every((c) => buildable(g, c))) return this.message("Something's in the way there.");
      const fromBag = (this.town.bag[tool.item] ?? 0) > 0;
      if (!fromBag && !spend(spec.price)) return this.message(`A ${spec.name.toLowerCase()} costs ${spec.price} coins. Write notes to earn more!`);
      if (fromBag) {
        const left = this.town.bag[tool.item]! - 1;
        if (left > 0) this.town.bag[tool.item] = left;
        else delete this.town.bag[tool.item];
      }
      this.town.props.push(prop);
      this.propObjects.set(prop, drawProp(this, g, prop));
      claimProp(g, prop);
      this.saveTown();
      return;
    }

    if (tool.kind === 'remove') {
      const prop = this.propAt(k);
      if (!prop) return this.message('Click a decoration you placed to pick it up.');
      this.propObjects.get(prop)?.forEach((o) => o.destroy());
      this.propObjects.delete(prop);
      releaseProp(g, prop);
      this.town.props = this.town.props.filter((p) => p !== prop);
      this.town.bag[prop.item] = (this.town.bag[prop.item] ?? 0) + 1;
      this.saveTown();
      return;
    }


    // Ground: only tiles that would change, and only what's paintable, are paid for.
    const paint = tool.paint;
    const cells: string[] = [];
    for (let dy = 0; dy < BRUSH; dy++) for (let dx = 0; dx < BRUSH; dx++) cells.push(key(gx + dx, gy + dy));
    const current = (c: string) => (g.water.has(c) ? 'water' : this.town.ground[c] ?? (g.road.has(c) ? 'path' : 'grass'));
    // Never water under the player's feet, which would leave them stranded in a pond.
    const here = this.player ? worldToTile(this.player.x, this.player.y) : null;
    const change = cells.filter((c) =>
      current(c) !== paint &&
      (paint === 'water' ? waterable(g, c) && c !== (here && key(here.gx, here.gy)) : paintable(g, c)));
    if (change.length === 0) return;
    if (!spend(change.length * GROUND_PRICE[paint])) {
      return this.message(`That costs ${change.length * GROUND_PRICE[paint]} coins. Write notes to earn more!`);
    }
    for (const c of change) {
      this.paintObjects.get(c)?.forEach((o) => o.destroy());
      this.paintObjects.delete(c);
      if (paint === 'path') g.road.add(c);
      else g.road.delete(c);
      const [x, y] = c.split(',').map(Number);
      // Water's shoreline is drawn with the town: a plain patch shows it until the stroke ends.
      if (paint === 'water' || g.water.has(c)) this.waterChanged = true;
      if (paint === 'water') {
        g.water.add(c);
        g.blocked.add(c);
        this.paintObjects.set(c, [this.add.image(x * TILE, y * TILE, 'terrain-water').setOrigin(0, 0).setDepth(-925)]);
      } else if (g.water.has(c)) {
        g.water.delete(c);
        g.blocked.delete(c);
        this.paintObjects.set(c, [this.add.image(x * TILE, y * TILE, g.skin('terrain-grass')).setOrigin(0, 0).setDepth(-925)]);
      }
      if (paint === 'tall') this.paintObjects.set(c, [...(this.paintObjects.get(c) ?? []), ...drawTallGrass(this, g, c)]);
      this.town.ground[c] = paint;
    }
    if (this.ground) retileRoads(g, this.ground, change);
    this.saveTown();
  }

  private openExteriorEditor(house: House, region: Region) {
    if (this.editingExterior || this.building) return;
    this.editingExterior = true;
    bus.emit('open-exterior-editor', {
      houseId: house.id,
      name: house.name,
      currentVariant: house.variant,
      currentMaterial: house.material,
      currentWallColor: house.wallColor,
      currentRoofColor: house.roofColor,
      siblingHouses: region.houses.map((h) => ({ id: h.id, gx: h.gx, gy: h.gy, variant: h.variant })),
      gx: house.gx,
      gy: house.gy,
    });
  }

  update() {
    if (!this.movement || !this.player) return;
    if (this.editingExterior) return;
    // Talking an NPC through a recap or a quiz (components/NpcDialogue.tsx): the arrow keys are the menu's.
    if (this.game.registry.get('npcConversation')) return;
    this.movement.update();

    const player = this.player;
    player.setDepth(player.y);

    const { gx, gy } = worldToTile(player.x, player.y);
    const key = `${gx},${gy}`;

    // While building you can walk the town, but not through a door.
    if (this.building) return;

    if (this.doors.has(key) && !this.movement.isMoving()) {
      if (this.lastDoorKey !== key) {
        this.lastDoorKey = key;
        this.game.registry.set('returnTile', { gx, gy: gy + 1 });
        bus.emit('enter-house', { houseId: this.doors.get(key)! });
        return;
      }
    } else if (!this.doors.has(key)) {
      this.lastDoorKey = null;
    }
  }
}
