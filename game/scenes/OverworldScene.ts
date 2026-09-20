import Phaser from 'phaser';
import type { WorldModel } from '@/lib/types';
import { regionSize } from '@/lib/vault/parse';
import { buildTilemap } from '@/game/tilemap';
import { GridMovement } from '@/game/gridMovement';
import { dressPlayer } from '@/game/playerSprite';
import { spawnNpcs } from '@/game/npc';
import { bus } from '@/game/bus';

const TILE = 16;

export default class OverworldScene extends Phaser.Scene {
  private movement: GridMovement | null = null;
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
    const pad = 4;
    const maxW = Math.max(...sizes.map(([w]) => w));
    const maxH = Math.max(...sizes.map(([, h]) => h));
    const cellW = maxW + pad;
    const cellH = maxH + pad;

    const blocked = new Set<string>();

    world.regions.forEach((region, i) => {
      const [w, h] = sizes[i];
      const originGx = (i % cols) * cellW;
      const originGy = Math.floor(i / cols) * cellH;
      const result = buildTilemap(this, region, originGx, originGy, w, h);
      result.blocked.forEach((k) => blocked.add(k));
      result.doors.forEach((houseId, key) => this.doors.set(key, houseId));
      spawnNpcs(this, region);
    });

    const worldWidthPx = cols * cellW * TILE;
    const worldHeightPx = rows * cellH * TILE;

    let spawnGx = Math.floor(cellW / 2);
    let spawnGy = Math.floor(cellH / 2);
    let guard = 0;
    while (blocked.has(`${spawnGx},${spawnGy}`) && guard < cellH) {
      spawnGy += 1;
      guard += 1;
    }

    const player = this.add.sprite(spawnGx * TILE, spawnGy * TILE, 'player');
    player.setOrigin(0.5, 0.64);
    player.setDepth(player.y);
    dressPlayer(this, player);

    const isWalkable = (gx: number, gy: number) => {
      if (gx < 0 || gy < 0 || gx >= cols * cellW || gy >= rows * cellH) return false;
      return !blocked.has(`${gx},${gy}`);
    };

    this.movement = new GridMovement(this, player, isWalkable);

    this.game.registry.set('player', player);
    this.game.registry.set('isWalkable', isWalkable);

    this.cameras.main.setBounds(0, 0, worldWidthPx, worldHeightPx);
    this.cameras.main.startFollow(player, true);
  }

  update() {
    if (!this.movement) return;
    this.movement.update();

    const player = this.game.registry.get('player') as Phaser.GameObjects.Sprite | undefined;
    if (!player) return;
    player.setDepth(player.y);

    const gx = Math.round(player.x / TILE);
    const gy = Math.round(player.y / TILE);
    const key = `${gx},${gy}`;

    if (this.doors.has(key)) {
      if (this.lastDoorKey !== key) {
        this.lastDoorKey = key;
        bus.emit('enter-house', { houseId: this.doors.get(key)! });
      }
    } else {
      this.lastDoorKey = null;
    }
  }
}
