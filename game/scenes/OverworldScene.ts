import Phaser from 'phaser';
import type { WorldModel } from '@/lib/types';
import { regionSize } from '@/lib/vault/parse';
import { buildTilemap } from '@/game/tilemap';
import { GridMovement, tileToWorld } from '@/game/gridMovement';
import { dressPlayer } from '@/game/playerSprite';
import { spawnNpcs, type NpcSpawnArea } from '@/game/npc';
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
    const areas: NpcSpawnArea[] = [];

    world.regions.forEach((region, i) => {
      const [w, h] = sizes[i];
      const originGx = (i % cols) * cellW;
      const originGy = Math.floor(i / cols) * cellH;
      areas.push({ originGx, originGy, width: w, height: h });
      const result = buildTilemap(this, region, originGx, originGy, w, h);
      result.blocked.forEach((k) => blocked.add(k));
      result.doors.forEach((houseId, key) => this.doors.set(key, houseId));
    });

    const worldWidthPx = cols * cellW * TILE;
    const worldHeightPx = rows * cellH * TILE;

    const returnTile = this.game.registry.get('returnTile') as { gx: number; gy: number } | undefined;
    let spawnGx = returnTile ? returnTile.gx : Math.floor(cellW / 2);
    let spawnGy = returnTile ? returnTile.gy : Math.floor(cellH / 2);
    let guard = 0;
    while (blocked.has(`${spawnGx},${spawnGy}`) && guard < cellH) {
      spawnGy += 1;
      guard += 1;
    }

    const spawnPos = tileToWorld(spawnGx, spawnGy);
    const player = this.add.sprite(spawnPos.x, spawnPos.y, 'player');
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
    if (returnTile) this.lastDoorKey = `${spawnGx},${spawnGy}`;

    // NPCs read isWalkable from the registry, so they spawn only after it is published.
    world.regions.forEach((region, i) => spawnNpcs(this, region, areas[i]));

    // Grass-coloured backdrop so gaps between regions and any space beyond the
    // world read as meadow, and a world smaller than the view sits centred.
    const cam = this.cameras.main;
    cam.setBackgroundColor('#3E8948');
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
    if (!this.movement) return;
    this.movement.update();

    const player = this.game.registry.get('player') as Phaser.GameObjects.Sprite | undefined;
    if (!player) return;
    player.setDepth(player.y);

    const { gx, gy } = this.movement.getTile();
    const key = `${gx},${gy}`;

    if (this.doors.has(key)) {
      if (this.lastDoorKey !== key) {
        this.lastDoorKey = key;
        this.game.registry.set('returnTile', { gx, gy });
        bus.emit('enter-house', { houseId: this.doors.get(key)! });
        this.scene.stop();
        return;
      }
    } else {
      this.lastDoorKey = null;
    }
  }
}
