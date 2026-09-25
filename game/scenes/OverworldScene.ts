import Phaser from 'phaser';
import type { Appearance, House, MaterialId, Region, RoofColor, WallColor, WorldModel } from '@/lib/types';
import { DEFAULT_APPEARANCE } from '@/lib/characterCatalog';
import { regionSize } from '@/lib/vault/parse';
import { buildHouses, buildRoads, scatterDecoration, type Entry } from '@/game/tilemap';
import { GridMovement, TILE, tileToWorld, worldToTile } from '@/game/gridMovement';
import { dressPlayer } from '@/game/playerSprite';
import { spawnNpcs, type NpcSpawnArea } from '@/game/npc';
import { getExteriorOverride, saveExteriorOverride } from '@/lib/exteriorStore';
import { DEFAULT_MATERIAL, DEFAULT_WALL_COLOR, DEFAULT_ROOF_COLOR, availableWallColors } from '@/lib/houseCatalog';
import { bus } from '@/game/bus';

const REGION_PAD = 6;

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
    if (this.fingerprint) {
      for (const region of world.regions) {
        for (const house of region.houses) {
          const saved = getExteriorOverride(this.fingerprint, house.id);
          if (saved !== null) {
            house.variant = saved.variant;
            house.material = saved.material ?? DEFAULT_MATERIAL[saved.variant];
            // A saved wallColor is only structurally valid (one of the 3 known colors), not
            // necessarily available for this material+shape combo — Limestone and Stone's
            // shape 3 only ship a subset. Fall back to 'base', always available everywhere.
            const wallColor = saved.wallColor ?? DEFAULT_WALL_COLOR[saved.variant];
            house.wallColor = availableWallColors(house.material, house.variant).includes(wallColor)
              ? wallColor
              : 'base';
            house.roofColor = saved.roofColor ?? DEFAULT_ROOF_COLOR[saved.variant];
          }
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
    const worldW = cols * cellW;
    const worldH = rows * cellH;

    this.add
      .tileSprite(0, 0, worldW * TILE, worldH * TILE, 'terrain-grass')
      .setOrigin(0, 0)
      .setDepth(-1000);

    const blocked = new Set<string>();
    const entries: Entry[] = [];
    const areas: NpcSpawnArea[] = [];

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

    const road = buildRoads(this, entries, blocked, worldW, worldH);

    world.regions.forEach((region, i) => {
      const a = areas[i];
      scatterDecoration(this, region, a.originGx, a.originGy, a.width, a.height, blocked, this.doors, road);
    });

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

    this.game.registry.set('player', player);
    this.game.registry.set('isWalkable', isWalkable);

    // NPCs read isWalkable from the registry, so they spawn only after it is published.
    world.regions.forEach((region, i) => spawnNpcs(this, region, areas[i]));

    // Grass-coloured backdrop so any space beyond the world reads as meadow, and a
    // world smaller than the view sits centred instead of hugging the top-left.
    const cam = this.cameras.main;
    cam.setBackgroundColor('#3E8948');
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
    this.events.once('shutdown', () => {
      bus.off('commit-exterior-variant', this.onCommitExterior);
      bus.off('close-exterior-editor', this.onCloseExteriorEditor);
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
