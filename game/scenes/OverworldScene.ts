import Phaser from 'phaser';
import type { WorldModel } from '@/lib/types';
import { regionSize } from '@/lib/vault/parse';
import { buildHouses, buildRoads, scatterDecoration, type Entry } from '@/game/tilemap';
import { GridMovement, TILE, tileToWorld, worldToTile } from '@/game/gridMovement';
import { dressPlayer } from '@/game/playerSprite';
import { spawnNpcs } from '@/game/npc';
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
    const origins: [number, number][] = [];

    world.regions.forEach((region, i) => {
      const originGx = (i % cols) * cellW + Math.floor(REGION_PAD / 2);
      const originGy = Math.floor(i / cols) * cellH + Math.floor(REGION_PAD / 2);
      origins.push([originGx, originGy]);
      const result = buildHouses(this, region, originGx, originGy);
      result.blocked.forEach((k) => blocked.add(k));
      result.doors.forEach((houseId, key) => this.doors.set(key, houseId));
      entries.push(...result.entries);
    });

    const road = buildRoads(this, entries, blocked, worldW, worldH);

    world.regions.forEach((region, i) => {
      const [w, h] = sizes[i];
      const [ox, oy] = origins[i];
      scatterDecoration(this, region, ox, oy, w, h, blocked, this.doors, road);
      spawnNpcs(this, region);
    });

    const first = entries[0];
    let spawnGx = first ? first.gx : Math.floor(worldW / 2);
    let spawnGy = first ? first.gy + 2 : Math.floor(worldH / 2);
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

    this.cameras.main.setBounds(0, 0, worldW * TILE, worldH * TILE);
    this.cameras.main.startFollow(player, true);
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
        bus.emit('enter-house', { houseId: this.doors.get(key)! });
      }
    } else if (!this.doors.has(key)) {
      this.lastDoorKey = null;
    }
  }
}
