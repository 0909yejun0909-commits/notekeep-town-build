import Phaser from 'phaser';
import { bus } from '@/game/bus';
import { GridMovement, tileToWorld, type Walkable } from '@/game/gridMovement';
import { dressPlayer } from '@/game/playerSprite';
import { roomSize } from '@/lib/vault/parse';
import { FOOTPRINT, hash } from '@/lib/types';
import type { House, Room, WorldModel, NoteRef, FurnitureId } from '@/lib/types';

const TILE = 16;

const FLOOR_FRAMES = [0, 2, 4, 6, 16, 32, 34, 48, 50, 52, 54];
const WALL_TRIPLES = [
  [42, 56, 70],
  [45, 59, 73],
  [46, 60, 74],
  [47, 61, 75],
];

const FURNITURE_RECTS: Record<FurnitureId, [number, number, number, number]> = {
  desk: [72, 8, 32, 48],
  shelf: [16, 0, 32, 32],
  bed: [0, 0, 32, 32],
  chest: [0, 0, 16, 16],
  plant: [32, 0, 16, 32],
  painting: [48, 32, 16, 16],
  lamp: [0, 0, 16, 32],
  rug: [0, 0, 48, 48],
};

const DECOR_TYPES: FurnitureId[] = ['rug', 'shelf', 'bed', 'lamp', 'painting'];

type RoomDoor = { gx: number; gy: number; roomIndex: number; name: string };

function findHouse(world: WorldModel | undefined, houseId: string): House | undefined {
  if (!world) return undefined;
  for (const region of world.regions) {
    const house = region.houses.find((h) => h.id === houseId);
    if (house) return house;
  }
  return undefined;
}

function pickSpot(
  w: number,
  h: number,
  fw: number,
  fh: number,
  occupied: Set<string>,
  seed: number
): [number, number] | null {
  const positions: [number, number][] = [];
  for (let y = 1; y <= h - 1 - fh; y++) {
    for (let x = 1; x <= w - 1 - fw; x++) {
      positions.push([x, y]);
    }
  }
  if (positions.length === 0) return null;
  const start = seed % positions.length;
  for (let i = 0; i < positions.length; i++) {
    const [x, y] = positions[(start + i) % positions.length];
    let free = true;
    for (let dx = 0; dx < fw && free; dx++) {
      for (let dy = 0; dy < fh && free; dy++) {
        if (occupied.has(`${x + dx},${y + dy}`)) free = false;
      }
    }
    if (free) return [x, y];
  }
  return null;
}

export default class InteriorScene extends Phaser.Scene {
  private houseId!: string;
  private roomIndex = 0;

  private width = 0;
  private height = 0;
  private doorGx = 0;
  private doorGy = 0;
  private roomDoors: RoomDoor[] = [];
  private blocked = new Set<string>();
  private approach = new Map<string, NoteRef>();

  private player!: Phaser.GameObjects.Sprite;
  private movement!: GridMovement;
  private indicator!: Phaser.GameObjects.Text;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private enterKey!: Phaser.Input.Keyboard.Key;

  private noteOpen = false;
  private exiting = false;
  private prevGx = 0;
  private prevGy = 0;

  private onCloseNote = () => {
    this.noteOpen = false;
  };

  constructor() {
    super('InteriorScene');
  }

  init(data: { houseId: string; roomIndex?: number }) {
    this.houseId = data.houseId;
    this.roomIndex = data.roomIndex ?? 0;
    this.noteOpen = false;
    this.exiting = false;
    this.blocked = new Set();
    this.approach = new Map();
    this.roomDoors = [];
  }

  create() {
    const world = this.game.registry.get('world') as WorldModel | undefined;
    const house = findHouse(world, this.houseId);

    if (!house || house.rooms.length === 0) {
      this.add.text(20, 20, 'Loading house...', { color: '#ffffff' });
      return;
    }

    const room: Room = house.rooms[this.roomIndex] ?? house.rooms[0];
    const [w, h] = roomSize(room);
    this.width = w;
    this.height = h;

    this.doorGx = Math.floor(w / 2);
    this.doorGy = h - 1;

    if (house.rooms.length > 1) {
      const others = house.rooms
        .map((r, i) => ({ r, i }))
        .filter(({ i }) => i !== this.roomIndex);
      const n = others.length;
      others.forEach(({ r, i }, k) => {
        const gx = Math.max(1, Math.min(w - 2, Math.round(((k + 1) * w) / (n + 1))));
        this.roomDoors.push({ gx, gy: 0, roomIndex: i, name: r.name });
      });
    }

    const floorFrame = FLOOR_FRAMES[hash(room.id) % FLOOR_FRAMES.length];
    const wallFrame = WALL_TRIPLES[hash(house.id) % WALL_TRIPLES.length][1];

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const isExitDoor = x === this.doorGx && y === this.doorGy;
        const isRoomDoor = this.roomDoors.some((d) => d.gx === x && d.gy === y);
        const isPerimeter = x === 0 || y === 0 || x === w - 1 || y === h - 1;

        this.add.image(x * TILE, y * TILE, 'interior-floor', floorFrame).setOrigin(0, 0).setDepth(0);

        if (isPerimeter && !isExitDoor && !isRoomDoor) {
          this.add.image(x * TILE, y * TILE, 'interior-walls', wallFrame).setOrigin(0, 0).setDepth(1);
        }
      }
    }

    for (const d of this.roomDoors) {
      this.add
        .text(d.gx * TILE + TILE / 2, -2, d.name.slice(0, 8), {
          fontFamily: 'monospace',
          fontSize: '8px',
          color: '#ffffff',
          backgroundColor: '#000000',
        })
        .setOrigin(0.5, 1)
        .setDepth(6);
    }

    this.add
      .text(this.doorGx * TILE + TILE / 2, h * TILE + 2, 'EXIT', {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#ffffff',
        backgroundColor: '#000000',
      })
      .setOrigin(0.5, 0)
      .setDepth(6);

    const occupied = new Set<string>();
    occupied.add(`${this.doorGx},${this.doorGy}`);
    for (const d of this.roomDoors) occupied.add(`${d.gx},${d.gy}`);

    for (const note of room.notes) {
      const [fw, fh] = FOOTPRINT[note.furniture];
      this.renderFurniture(note.furniture, note.gx, note.gy);

      for (let dx = 0; dx < fw; dx++) {
        for (let dy = 0; dy < fh; dy++) {
          const key = `${note.gx + dx},${note.gy + dy}`;
          this.blocked.add(key);
          occupied.add(key);
        }
      }

      const apx = note.gx + Math.floor(fw / 2);
      const apy = note.gy + fh;
      const apKey = `${apx},${apy}`;
      this.approach.set(apKey, note);
      occupied.add(apKey);
    }

    for (const type of DECOR_TYPES) {
      const [fw, fh] = FOOTPRINT[type];
      const seed = hash(`${room.id}:${type}`);
      const spot = pickSpot(w, h, fw, fh, occupied, seed);
      if (!spot) continue;
      const [dx, dy] = spot;
      this.renderFurniture(type, dx, dy);
      for (let i = 0; i < fw; i++) {
        for (let j = 0; j < fh; j++) {
          const key = `${dx + i},${dy + j}`;
          this.blocked.add(key);
          occupied.add(key);
        }
      }
    }

    const spawnPos = tileToWorld(this.doorGx, this.doorGy);
    this.player = this.add.sprite(spawnPos.x, spawnPos.y, 'player');
    this.player.setOrigin(0.5, 0.64);
    this.player.setDepth(10);
    dressPlayer(this, this.player);

    const isWalkable: Walkable = (gx, gy) => {
      if (gx === this.doorGx && gy === this.doorGy) return true;
      if (this.roomDoors.some((d) => d.gx === gx && d.gy === gy)) return true;
      if (gx <= 0 || gy <= 0 || gx >= w - 1 || gy >= h - 1) return false;
      if (this.blocked.has(`${gx},${gy}`)) return false;
      return true;
    };

    this.movement = new GridMovement(this, this.player, isWalkable);

    this.indicator = this.add
      .text(0, 0, '!', { fontFamily: 'monospace', fontSize: '14px', color: '#ffe066' })
      .setOrigin(0.5, 1)
      .setDepth(1000)
      .setVisible(false);

    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.enterKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);

    this.cameras.main.setBounds(0, 0, w * TILE, h * TILE);
    this.cameras.main.startFollow(this.player, true);

    this.prevGx = this.doorGx;
    this.prevGy = this.doorGy;

    bus.on('close-note', this.onCloseNote);
    this.events.once('shutdown', () => bus.off('close-note', this.onCloseNote));
  }

  private renderFurniture(type: FurnitureId, gx: number, gy: number) {
    const key = `furn_${type}`;
    const [rx, ry, rw, rh] = FURNITURE_RECTS[type];
    const texture = this.textures.get(key);
    if (!texture.has(type)) texture.add(type, 0, rx, ry, rw, rh);
    this.add.image(gx * TILE, gy * TILE, key, type).setOrigin(0, 0).setDepth(5);
  }

  update() {
    if (!this.player || !this.movement) return;
    if (this.noteOpen || this.exiting) return;

    this.movement.update();

    const { gx, gy } = this.movement.getTile();

    if (gx !== this.prevGx || gy !== this.prevGy) {
      if (gx === this.doorGx && gy === this.doorGy) {
        this.exiting = true;
        this.prevGx = gx;
        this.prevGy = gy;
        bus.emit('exit-house', undefined);
        return;
      }

      const roomDoor = this.roomDoors.find((d) => d.gx === gx && d.gy === gy);
      if (roomDoor) {
        this.scene.restart({ houseId: this.houseId, roomIndex: roomDoor.roomIndex });
        return;
      }

      this.prevGx = gx;
      this.prevGy = gy;
    }

    const note = this.approach.get(`${gx},${gy}`);
    if (note) {
      this.indicator.setPosition(this.player.x, this.player.y - 34).setVisible(true);
      if (Phaser.Input.Keyboard.JustDown(this.spaceKey) || Phaser.Input.Keyboard.JustDown(this.enterKey)) {
        this.noteOpen = true;
        bus.emit('open-note', { note });
      }
    } else {
      this.indicator.setVisible(false);
    }
  }
}
