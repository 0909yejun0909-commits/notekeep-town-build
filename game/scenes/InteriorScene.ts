import Phaser from 'phaser';
import { bus } from '@/game/bus';
import { GridMovement, TILE, tileToWorld, worldToTile, type Walkable } from '@/game/gridMovement';
import { dressPlayer } from '@/game/playerSprite';
import { FOOTPRINT, hash } from '@/lib/types';
import type { House, NoteRef, WorldModel, FurnitureId } from '@/lib/types';

// The room is the whole viewport, whatever size the window is (never smaller than this).
const MIN_ROOM_W = 20;
const MIN_ROOM_H = 15;

// One wide bookshelf built from three copies of the verified 32x32 shelf frame.
const SHELF_SEGMENTS = 3;
const SHELF_W = SHELF_SEGMENTS * 2;
const SHELF_GY = 1;

const FLOOR_FRAMES = [0, 2, 4, 6, 16, 32, 34, 48, 50, 52, 54];
const WALL_TRIPLES: [number, number, number][] = [
  [42, 56, 70],
  [45, 59, 73],
  [46, 60, 74],
  [47, 61, 75],
];

const DECOR_TYPES: FurnitureId[] = ['rug', 'desk', 'bed', 'plant', 'lamp', 'chest', 'painting'];

function findHouse(world: WorldModel | undefined, houseId: string): House | undefined {
  if (!world) return undefined;
  for (const region of world.regions) {
    const house = region.houses.find((h) => h.id === houseId);
    if (house) return house;
  }
  return undefined;
}

function pickSpot(
  roomW: number,
  fw: number,
  fh: number,
  occupied: Set<string>,
  seed: number,
  minY: number,
  maxY: number,
): [number, number] | null {
  const positions: [number, number][] = [];
  for (let y = minY; y <= maxY - fh; y++) {
    for (let x = 1; x <= roomW - 1 - fw; x++) positions.push([x, y]);
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

  private doorGx = 0;
  private doorGy = 0;
  private shelfGx = 0;
  private blocked = new Set<string>();
  private shelfApproach = new Set<string>();
  private approach = new Map<string, NoteRef>();

  private player!: Phaser.GameObjects.Sprite;
  private movement!: GridMovement;
  private indicator!: Phaser.GameObjects.Text;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private enterKey!: Phaser.Input.Keyboard.Key;

  private shelfOpen = false;
  private noteOpen = false;
  private exiting = false;
  private prevGx = 0;
  private prevGy = 0;

  private onCloseShelf = () => {
    this.shelfOpen = false;
  };

  private onCloseNote = () => {
    this.noteOpen = false;
  };

  constructor() {
    super('InteriorScene');
  }

  init(data: { houseId: string }) {
    this.houseId = data.houseId;
    this.shelfOpen = false;
    this.noteOpen = false;
    this.exiting = false;
    this.blocked = new Set();
    this.shelfApproach = new Set();
    this.approach = new Map();
  }

  create() {
    const world = this.game.registry.get('world') as WorldModel | undefined;
    const house = findHouse(world, this.houseId);

    if (!house) {
      this.add.text(20, 20, 'Loading house...', { color: '#ffffff' });
      return;
    }

    const w = Math.max(MIN_ROOM_W, Math.ceil(this.scale.width / TILE));
    const h = Math.max(MIN_ROOM_H, Math.ceil(this.scale.height / TILE));
    this.doorGx = Math.floor(w / 2);
    this.doorGy = h - 1;
    this.shelfGx = Math.floor((w - SHELF_W) / 2);

    const noteCount = house.rooms.reduce((n, r) => n + r.notes.length, 0);
    const floorFrame = FLOOR_FRAMES[hash(house.id) % FLOOR_FRAMES.length];
    const [wallTop, wallMid, wallBase] = WALL_TRIPLES[hash(house.name) % WALL_TRIPLES.length];

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        this.add.image(x * TILE, y * TILE, 'interior-floor', floorFrame).setOrigin(0, 0).setDepth(0);

        const isExitDoor = x === this.doorGx && y === this.doorGy;
        const isPerimeter = x === 0 || y === 0 || x === w - 1 || y === h - 1;
        if (!isPerimeter || isExitDoor) continue;

        let frame = wallMid;
        if (y === 0) frame = wallTop;
        else if (y === h - 1) frame = wallBase;
        this.add.image(x * TILE, y * TILE, 'interior-walls', frame).setOrigin(0, 0).setDepth(1);
      }
    }

    // Back wall gets a second row so the shelf has something to lean on.
    for (let x = 1; x < w - 1; x++) {
      this.add.image(x * TILE, SHELF_GY * TILE, 'interior-walls', wallBase).setOrigin(0, 0).setDepth(1);
      this.blocked.add(`${x},${SHELF_GY}`);
    }

    const occupied = new Set<string>();
    for (let x = 0; x < w; x++) {
      occupied.add(`${x},0`);
      occupied.add(`${x},${SHELF_GY}`);
      occupied.add(`${x},${h - 1}`);
    }
    for (let y = 0; y < h; y++) {
      occupied.add(`0,${y}`);
      occupied.add(`${w - 1},${y}`);
    }

    // Bookshelf: three verified 32x32 shelf frames side by side, rows SHELF_GY..SHELF_GY+1.
    for (let s = 0; s < SHELF_SEGMENTS; s++) {
      const gx = this.shelfGx + s * 2;
      const img = this.add
        .image(gx * TILE, SHELF_GY * TILE, 'furn_shelf', 'shelf')
        .setOrigin(0, 0)
        .setDepth(5)
        .setInteractive({ useHandCursor: true });
      img.on('pointerdown', () => this.openShelf());
      for (let dx = 0; dx < 2; dx++) {
        for (let dy = 0; dy < 2; dy++) {
          const key = `${gx + dx},${SHELF_GY + dy}`;
          this.blocked.add(key);
          occupied.add(key);
        }
      }
    }
    for (let x = this.shelfGx; x < this.shelfGx + SHELF_W; x++) {
      const key = `${x},${SHELF_GY + 2}`;
      this.shelfApproach.add(key);
      occupied.add(key);
    }

    this.add
      .text((this.shelfGx + SHELF_W / 2) * TILE, 3, `${house.name} · ${noteCount}`, {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#ffffff',
        backgroundColor: '#000000',
      })
      .setOrigin(0.5, 0)
      .setDepth(6);

    // Keep a clear lane from the door up to the shelf.
    for (let y = SHELF_GY + 2; y < h; y++) {
      occupied.add(`${this.doorGx},${y}`);
      occupied.add(`${this.doorGx - 1},${y}`);
      occupied.add(`${this.doorGx + 1},${y}`);
    }

    // Every solid piece of furniture holds one of the house's notes (the shelf
    // holds all of them). Walk up to it and press Space, or just click it.
    const pending = house.rooms.flatMap((r) => r.notes);
    for (const type of DECOR_TYPES) {
      const [fw, fh] = FOOTPRINT[type];
      const seed = hash(`${house.id}:${type}`);
      const spot = pickSpot(w, fw, fh, occupied, seed, SHELF_GY + 2, h - 3);
      if (!spot) continue;
      const [dx, dy] = spot;
      const note = type === 'rug' ? undefined : pending.shift();
      const img = this.add.image(dx * TILE, dy * TILE, `furn_${type}`, type).setOrigin(0, 0).setDepth(type === 'rug' ? 2 : 5);
      for (let i = 0; i < fw; i++) {
        for (let j = 0; j < fh; j++) {
          const key = `${dx + i},${dy + j}`;
          occupied.add(key);
          if (type !== 'rug') this.blocked.add(key);
        }
      }
      if (note) {
        img.setInteractive({ useHandCursor: true });
        img.on('pointerdown', () => this.openNote(note));
        const apKey = `${dx + Math.floor(fw / 2)},${dy + fh}`;
        this.approach.set(apKey, note);
        occupied.add(apKey);
      }
    }

    this.add
      .text(this.doorGx * TILE + TILE / 2, h * TILE - 2, 'EXIT', {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#ffffff',
        backgroundColor: '#000000',
      })
      .setOrigin(0.5, 1)
      .setDepth(6);

    const spawn = tileToWorld(this.doorGx, this.doorGy);
    this.player = this.add.sprite(spawn.x, spawn.y, 'player');
    this.player.setOrigin(0.5, 0.64);
    this.player.setDepth(10);
    dressPlayer(this, this.player);

    const isWalkable: Walkable = (gx, gy) => {
      if (gx === this.doorGx && gy === this.doorGy) return true;
      if (gx <= 0 || gy <= 0 || gx >= w - 1 || gy >= h - 1) return false;
      return !this.blocked.has(`${gx},${gy}`);
    };

    this.movement = new GridMovement(this, this.player, isWalkable);

    this.indicator = this.add
      .text(0, 0, '!', { fontFamily: 'monospace', fontSize: '14px', color: '#ffe066' })
      .setOrigin(0.5, 1)
      .setDepth(1000)
      .setVisible(false);

    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.enterKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);

    this.cameras.main.setScroll(0, 0);
    this.cameras.main.setBackgroundColor('#141018');
    const onResize = () => this.scene.restart({ houseId: this.houseId });
    this.scale.on(Phaser.Scale.Events.RESIZE, onResize);
    this.events.once('shutdown', () => this.scale.off(Phaser.Scale.Events.RESIZE, onResize));

    this.prevGx = this.doorGx;
    this.prevGy = this.doorGy;

    bus.on('close-shelf', this.onCloseShelf);
    bus.on('close-note', this.onCloseNote);
    this.events.once('shutdown', () => {
      bus.off('close-shelf', this.onCloseShelf);
      bus.off('close-note', this.onCloseNote);
    });
  }

  private openNote(note: NoteRef) {
    if (this.noteOpen || this.shelfOpen || this.exiting) return;
    this.noteOpen = true;
    bus.emit('open-note', { note });
  }

  private openShelf() {
    if (this.shelfOpen || this.exiting) return;
    this.shelfOpen = true;
    bus.emit('open-shelf', { houseId: this.houseId });
  }

  update() {
    if (!this.player || !this.movement) return;
    if (this.shelfOpen || this.noteOpen || this.exiting) return;

    this.movement.update();

    const { gx, gy } = worldToTile(this.player.x, this.player.y);

    if (gx !== this.prevGx || gy !== this.prevGy) {
      if (gx === this.doorGx && gy === this.doorGy) {
        this.exiting = true;
        this.prevGx = gx;
        this.prevGy = gy;
        bus.emit('exit-house', undefined);
        return;
      }
      this.prevGx = gx;
      this.prevGy = gy;
    }

    const settled = !this.movement.isMoving();
    const atShelf = settled && this.shelfApproach.has(`${gx},${gy}`);
    const note = settled ? this.approach.get(`${gx},${gy}`) : undefined;
    if (atShelf || note) {
      this.indicator.setPosition(this.player.x, this.player.y - 34).setVisible(true);
      if (Phaser.Input.Keyboard.JustDown(this.spaceKey) || Phaser.Input.Keyboard.JustDown(this.enterKey)) {
        if (note) this.openNote(note);
        else this.openShelf();
      }
    } else {
      this.indicator.setVisible(false);
    }
  }
}
