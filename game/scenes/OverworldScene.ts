import Phaser from 'phaser';
import type { Appearance, House, MaterialId, Region, RoofColor, WallColor, WorldModel } from '@/lib/types';
import { DEFAULT_APPEARANCE } from '@/lib/characterCatalog';
import { regionSize } from '@/lib/vault/parse';
import { buildHouses, buildRoads, type Entry } from '@/game/tilemap';
import { GridMovement, TILE, tileToWorld, worldToTile } from '@/game/gridMovement';
import { dressPlayer } from '@/game/playerSprite';
import { spawnNpcs, type NpcSpawnArea } from '@/game/npc';
import { applyExteriorOverride, getExteriorOverride, saveExteriorOverride } from '@/lib/exteriorStore';
import { bus } from '@/game/bus';
import { attachRemotePlayers } from '@/game/remotePlayers';
import { setSelfPresence } from '@/lib/multiplayer/session';
import { hash } from '@/lib/types';
import { HOUSE_FOOTPRINT } from '@/lib/houseCatalog';
import { key, type WorldGrid } from '@/game/worldGrid';
import { buildGround, GID_WATER } from '@/game/ground';
import { placePonds, renderWater } from '@/game/water';
import { placePlazas, renderPlazas, renderYards } from '@/game/townProps';
import { buildForestBorder, buildGroundCover, buildGroves } from '@/game/nature';
import { attachDaylight } from '@/game/daylight';
import { attachAmbience } from '@/game/ambience';

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

  constructor() {
    super('OverworldScene');
  }

  create() {
    const world = this.game.registry.get('world') as WorldModel | undefined;
    if (!world || world.regions.length === 0) return;

    this.doors = new Map();
    this.lastDoorKey = null;
    this.editingExterior = false;

    this.fingerprint = this.game.registry.get('vaultFingerprint') as string | undefined;
    const isGuest = this.game.registry.get('role') === 'guest';
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
      .tileSprite(0, 0, worldW * TILE, worldH * TILE, 'terrain-grass')
      .setOrigin(0, 0)
      .setDepth(-1000);

    const blocked = new Set<string>();
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
    };

    world.regions.forEach((region, i) => {
      const [w, h] = sizes[i];
      const originGx = BORDER + (i % cols) * cellW + Math.floor(REGION_PAD / 2);
      const originGy = BORDER + Math.floor(i / cols) * cellH + Math.floor(REGION_PAD / 2);
      areas.push({ originGx, originGy, width: w, height: h });
      grid.areas.push({ region, originGx, originGy, width: w, height: h });
      const result = buildHouses(this, region, originGx, originGy);
      result.blocked.forEach((k) => blocked.add(k));
      result.doors.forEach((houseId, key) => this.doors.set(key, houseId));
      entries.push(...result.entries);
      for (const e of result.entries) {
        const house = region.houses.find((hs) => hs.id === e.houseId)!;
        const [hw, hh] = HOUSE_FOOTPRINT[house.variant] ?? HOUSE_FOOTPRINT[0];
        grid.houses.push({ houseId: house.id, gx: originGx + house.gx, gy: originGy + house.gy, w: hw, h: hh, entryGx: e.gx, entryGy: e.gy });
        grid.keepClear.add(key(e.gx, e.gy));
        grid.keepClear.add(key(e.gx, e.gy + 1));
      }

      if (!isGuest) {
        for (const house of region.houses) {
          const img = result.houseImages.get(house.id);
          if (!img) continue;
          img
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => this.openExteriorEditor(house, region));
        }
      }
    });

    // Order matters: each step avoids what the earlier ones claimed. Roads come after the
    // plazas and ponds so they route around them, and everything decorative comes after roads.
    buildForestBorder(this, grid);
    const { plazas, anchors, wells } = placePlazas(grid);
    placePonds(grid);
    grid.road = buildRoads([...entries, ...anchors], blocked, worldW, worldH, grid.plaza);
    const ground = buildGround(this, grid);
    renderWater(this, grid, ground.map, GID_WATER);
    renderPlazas(this, grid, plazas, wells);
    renderYards(this, grid);
    buildGroves(this, grid);
    buildGroundCover(this, grid);

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
    dressPlayer(this, player, appearance);
    this.player = player;

    const isWalkable = (gx: number, gy: number) => {
      if (gx < 0 || gy < 0 || gx >= worldW || gy >= worldH) return false;
      return !blocked.has(`${gx},${gy}`);
    };

    this.movement = new GridMovement(this, player, isWalkable);
    this.movement.onStep = (gx, gy, facing) => setSelfPresence({ scene: 'overworld', gx, gy, facing });
    setSelfPresence({ scene: 'overworld', gx: spawnGx, gy: spawnGy, facing: 'down' });
    attachRemotePlayers(this, 'overworld', player);

    this.game.registry.set('player', player);
    this.game.registry.set('isWalkable', isWalkable);

    // NPCs read isWalkable from the registry, so they spawn only after it is published.
    world.regions.forEach((region, i) => spawnNpcs(this, region, areas[i]));

    attachAmbience(this, grid, attachDaylight(this, grid));

    // Forest-coloured backdrop so any space beyond the world reads as woods, and a
    // world smaller than the view sits centred instead of hugging the top-left.
    const cam = this.cameras.main;
    cam.setBackgroundColor('#27503a');
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

    bus.on('commit-exterior-variant', this.onCommitExterior);
    bus.on('close-exterior-editor', this.onCloseExteriorEditor);
    bus.on('world-updated', this.onWorldUpdated);
    this.events.once('shutdown', () => {
      bus.off('commit-exterior-variant', this.onCommitExterior);
      bus.off('close-exterior-editor', this.onCloseExteriorEditor);
      bus.off('world-updated', this.onWorldUpdated);
    });
  }

  private openExteriorEditor(house: House, region: Region) {
    if (this.editingExterior) return;
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
