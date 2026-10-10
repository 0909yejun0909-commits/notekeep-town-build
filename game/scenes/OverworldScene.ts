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
import { HOUSE_FOOTPRINT } from '@/lib/houseCatalog';
import { key, type WorldGrid } from '@/game/worldGrid';
import { buildGround, GID_WATER } from '@/game/ground';
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
  BRUSH, GROUND_PRICE, TOWN_PROP_BY_ID, TREE_CUT_PRICE, emptyTownEdits, loadTownEdits, parseTownEdits, saveTownEdits,
  type TownEdits, type TownProp, type TownTool,
} from '@/lib/townEdits';
import {
  buildable, claimProp, cutTree, cutTrees, drawProp, drawTallGrass, paintable, paintRoads, placeProps, propCells,
  releaseProp, renderTallGrass, treeAt,
} from '@/game/townEdits';
import { spend } from '@/lib/walletStore';

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
    const worldW = cols * cellW + BORDER * 2;
    const worldH = rows * cellH + BORDER * 2;

    this.add
      .tileSprite(0, 0, worldW * TILE, worldH * TILE, skin(this, biome, 'terrain-grass'))
      .setOrigin(0, 0)
      .setDepth(-1000);

    const blocked = new Set<string>();
    const houseGaps = new Set<string>();
    const entries: Entry[] = [];
    const areas: NpcSpawnArea[] = [];
    const grid: WorldGrid = {
      w: worldW,
      h: worldH,
      seed: hash(world.name),
      border: BORDER,
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
      const originGx = BORDER + (i % cols) * cellW + Math.floor(REGION_PAD / 2);
      const originGy = BORDER + Math.floor(i / cols) * cellH + Math.floor(REGION_PAD / 2);
      areas.push({ originGx, originGy, width: w, height: h });
      grid.areas.push({ region, originGx, originGy, width: w, height: h });
      const result = buildHouses(this, region, originGx, originGy, biome);
      result.blocked.forEach((k) => blocked.add(k));
      result.open.forEach((k) => houseGaps.add(k));
      result.doors.forEach((houseId, key) => this.doors.set(key, houseId));
      entries.push(...result.entries);
      for (const e of result.entries) {
        const house = region.houses.find((hs) => hs.id === e.houseId)!;
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
    const { plazas, anchors, wells } = placePlazas(grid);
    placePonds(grid);
    grid.road = buildRoads([...entries, ...anchors], blocked, worldW, worldH, grid.plaza);
    // The player's own village edits, each slotted in where it can't move anything else
    // (game/townEdits.ts).
    const cut = new Set(this.town.cut);
    cutTrees(grid, cut, true);
    paintRoads(grid, this.town);
    this.propObjects = placeProps(this, grid, this.town);
    this.paintObjects = renderTallGrass(this, grid, this.town);
    const underfoot: Ground = biome === 'snow' ? 'snow' : biome === 'desert' ? 'sand' : 'grass';
    setGround((gx, gy) => (grid.plaza.has(key(gx, gy)) ? 'stone' : grid.road.has(key(gx, gy)) ? 'road' : underfoot));
    const ground = buildGround(this, grid);
    renderWater(this, grid, ground.map, GID_WATER);
    renderPlazas(this, grid, plazas, wells);
    renderYards(this, grid);
    buildGroves(this, grid);
    buildGroundCover(this, grid);
    cutTrees(grid, cut, false);
    for (const k of houseGaps) if (!grid.used.has(k)) blocked.delete(k);
    this.grid = grid;

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
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onBuildPointer);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onBuildPointer);
    this.events.once('shutdown', () => {
      if (getLabelSource() === this.projectLabels) setLabelSource(null);
      if (getMinimapSource() === minimap) setMinimapSource(null);
      bus.off('commit-exterior-variant', this.onCommitExterior);
      bus.off('close-exterior-editor', this.onCloseExteriorEditor);
      bus.off('world-updated', this.onWorldUpdated);
      bus.off('open-town-editor', this.onOpenTownEditor);
      bus.off('close-town-editor', this.onCloseTownEditor);
      bus.off('town-tool', this.onTownTool);
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

  private minimapSource(world: WorldModel, grid: WorldGrid, player: Phaser.GameObjects.Sprite): MinimapSource {
    const tiles = new Uint8Array(grid.w * grid.h);
    for (let y = 0; y < grid.h; y++) {
      for (let x = 0; x < grid.w; x++) {
        const k = key(x, y);
        tiles[y * grid.w + x] = grid.water.has(k)
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
        w: grid.w,
        h: grid.h,
        biome: grid.biome,
        tiles,
        houses: grid.houses.map((r) => ({
          id: r.houseId,
          name: byId.get(r.houseId)?.name ?? '',
          gx: r.gx,
          gy: r.gy,
          w: r.w,
          h: r.h,
          roof: byId.get(r.houseId)?.roofColor ?? 'red',
        })),
        areas: grid.areas.map((a) => ({ name: a.region.name, gx: a.originGx, gy: a.originGy, w: a.width, h: a.height })),
        townName: world.name,
      },
      frame: () => ({
        player: { x: player.x / TILE, y: player.y / TILE - 0.5 },
        view: { x: cam.worldView.x / TILE, y: cam.worldView.y / TILE, w: cam.worldView.width / TILE, h: cam.worldView.height / TILE },
        peers: currentPresences()
          .filter(([, p]) => p.scene === 'overworld')
          .map(([, p]) => ({ x: p.gx + 0.5, y: p.gy + 0.5 })),
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

  private saveTown() {
    if (this.fingerprint) saveTownEdits(this.fingerprint, this.town);
    bus.emit('town-edited', { bag: this.town.bag });
  }

  private tileAt(p: Phaser.Input.Pointer) {
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
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
    if (tool.kind === 'cut') {
      const tree = treeAt(g, key(gx, gy));
      return { cells: tree ? tree.cells : [key(gx, gy)], ok: !!tree };
    }
    const prop = this.propAt(key(gx, gy));
    return { cells: prop ? propCells(prop) : [key(gx, gy)], ok: !!prop };
  }

  private propAt(k: string): TownProp | null {
    return [...this.propObjects.keys()].find((p) => propCells(p).includes(k)) ?? null;
  }

  private onBuildPointer = (p: Phaser.Input.Pointer) => {
    if (!this.building || !this.tool || !this.grid || !this.hover) return;
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

    if (tool.kind === 'cut') {
      const tree = treeAt(g, k);
      if (!tree) return this.message('Click a tree to cut it down.');
      if (!spend(TREE_CUT_PRICE)) return this.message(`Cutting down a tree costs ${TREE_CUT_PRICE} coins. Write notes to earn more!`);
      cutTree(g, tree);
      this.town.cut.push(tree.id);
      this.saveTown();
      return;
    }

    // Ground: only tiles that would change, and only what's paintable, are paid for.
    const paint = tool.paint;
    const cells: string[] = [];
    for (let dy = 0; dy < BRUSH; dy++) for (let dx = 0; dx < BRUSH; dx++) cells.push(key(gx + dx, gy + dy));
    const current = (c: string) => this.town.ground[c] ?? (g.road.has(c) ? 'path' : 'grass');
    const change = cells.filter((c) => paintable(g, c) && current(c) !== paint);
    if (change.length === 0) return;
    if (!spend(change.length * GROUND_PRICE[paint])) {
      return this.message(`That costs ${change.length * GROUND_PRICE[paint]} coins. Write notes to earn more!`);
    }
    for (const c of change) {
      this.paintObjects.get(c)?.forEach((o) => o.destroy());
      const [x, y] = c.split(',').map(Number);
      const at = [x * TILE + TILE / 2, y * TILE + TILE / 2] as const;
      const objects =
        paint === 'tall' ? drawTallGrass(this, g, c)
        : [this.add.image(...at, g.skin(paint === 'path' ? 'terrain-path' : 'terrain-grass')).setDepth(-940)];
      this.paintObjects.set(c, objects);
      this.town.ground[c] = paint;
    }
    this.saveTown();
  }

  private openExteriorEditor(house: House, region: Region) {
    if (this.editingExterior || this.building) return;
    this.editingExterior = true;
    bus.emit('open-exterior-editor', {
      houseId: house.id,
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
