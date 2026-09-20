import Phaser from 'phaser';
import type { WorldModel } from '@/lib/types';
import { regionSize } from '@/lib/vault/parse';
import { buildHouses, buildRoads, scatterDecoration, type Entry } from '@/game/tilemap';
import { GridMovement, TILE, tileToWorld, worldToTile } from '@/game/gridMovement';
import { dressPlayer } from '@/game/playerSprite';
import { spawnNpcs, type NpcSpawnArea } from '@/game/npc';
import { bus } from '@/game/bus';

const REGION_PAD = 6;

export default class OverworldScene extends Phaser.Scene {
  private movement: GridMovement | null = null;
  private player: Phaser.GameObjects.Sprite | null = null;
  private doors = new Map<string, string>();
  private lastDoorKey: string | null = null;

  constructor() {
    super('OverworldScene');
  }

  create() {
    const world = this.game.registry.get('world') as WorldModel | undefined;
    if (!world || world.regions.length === 0) return;

    this.doors = new Map();
    this.lastDoorKey = null;

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
    let guard = 0;
    while ((blocked.has(`${spawnGx},${spawnGy}`) || this.doors.has(`${spawnGx},${spawnGy}`)) && guard < worldH) {
      spawnGy += 1;
      guard += 1;
    }

    const spawn = tileToWorld(spawnGx, spawnGy);
    const player = this.add.sprite(spawn.x, spawn.y, 'player');
    player.setOrigin(0.5, 0.64);
    player.setDepth(player.y);
    dressPlayer(this, player);
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
  }

  update() {
    if (!this.movement || !this.player) return;
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
