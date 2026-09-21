import Phaser from 'phaser';
import { bus } from '@/game/bus';
import { GridMovement, TILE, tileToWorld, worldToTile, type Walkable } from '@/game/gridMovement';
import { dressPlayer } from '@/game/playerSprite';
import type { House, NoteRef, WorldModel, InteriorLayout, FurniturePlacement } from '@/lib/types';
import {
  SHELF_SEGMENTS,
  SHELF_GY,
  SHELF_W,
  FLOOR_FRAMES,
  WALL_TRIPLES,
  computeDefaultLayout,
} from '@/lib/interiorLayout';
import { getLayout, saveLayout } from '@/lib/interiorStore';
import { CATALOG_BY_ID } from '@/lib/catalog';

// The room is the whole viewport, whatever size the window is (never smaller than this).
const MIN_ROOM_W = 20;
const MIN_ROOM_H = 15;

function findHouse(world: WorldModel | undefined, houseId: string): House | undefined {
  if (!world) return undefined;
  for (const region of world.regions) {
    const house = region.houses.find((h) => h.id === houseId);
    if (house) return house;
  }
  return undefined;
}

export default class InteriorScene extends Phaser.Scene {
  private houseId!: string;

  private doorGx = 0;
  private doorGy = 0;
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

  private editingLayout = false;
  private fingerprint: string | undefined;
  private layout!: InteriorLayout;

  private onCloseShelf = () => {
    this.shelfOpen = false;
  };

  private onCloseNote = () => {
    this.noteOpen = false;
  };

  private onCloseEditor = () => {
    this.editingLayout = false;
  };

  private onCommitLayout = ({ houseId, layout }: { houseId: string; layout: InteriorLayout }) => {
    if (houseId !== this.houseId || !this.fingerprint) return;
    saveLayout(this.fingerprint, houseId, layout);
    this.scene.restart({ houseId: this.houseId });
  };

  constructor() {
    super('InteriorScene');
  }

  init(data: { houseId: string }) {
    this.houseId = data.houseId;
    this.shelfOpen = false;
    this.noteOpen = false;
    this.exiting = false;
    this.editingLayout = false;
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

    this.fingerprint = this.game.registry.get('vaultFingerprint') as string | undefined;
    const saved = this.fingerprint ? getLayout(this.fingerprint, this.houseId) : null;
    this.layout = saved ?? computeDefaultLayout(house, w, h, this.doorGx, this.doorGy);
    const shelfGx = this.layout.shelf.gx;
    const shelfGy = this.layout.shelf.gy;

    const noteCount = house.rooms.reduce((n, r) => n + r.notes.length, 0);
    // this.layout.floorFrame/wallTriple are indices into FLOOR_FRAMES/WALL_TRIPLES
    // (see lib/interiorLayout.ts's computeDefaultLayout) — look up the real frame
    // number/triple here, never store the raw frame number in the layout itself.
    const floorFrame = FLOOR_FRAMES[this.layout.floorFrame] ?? FLOOR_FRAMES[0];
    const [wallTop, wallMid, wallBase] = WALL_TRIPLES[this.layout.wallTriple] ?? WALL_TRIPLES[0];

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

    // Back wall gets a second row so the shelf has something to lean on — only
    // when the shelf is actually against the top wall; moved elsewhere, it's
    // just a free-standing piece like any other furniture.
    if (shelfGy === SHELF_GY) {
      for (let x = 1; x < w - 1; x++) {
        this.add.image(x * TILE, SHELF_GY * TILE, 'interior-walls', wallBase).setOrigin(0, 0).setDepth(1);
        this.blocked.add(`${x},${SHELF_GY}`);
      }
    }

    // Bookshelf: three verified 32x32 shelf frames side by side, rows shelfGy..shelfGy+1.
    for (let s = 0; s < SHELF_SEGMENTS; s++) {
      const gx = shelfGx + s * 2;
      const img = this.add
        .image(gx * TILE, shelfGy * TILE, 'furn_shelf', 'shelf')
        .setOrigin(0, 0)
        .setDepth(5)
        .setInteractive({ useHandCursor: true });
      img.on('pointerdown', () => this.openShelf());
      for (let dx = 0; dx < 2; dx++) {
        for (let dy = 0; dy < 2; dy++) this.blocked.add(`${gx + dx},${shelfGy + dy}`);
      }
    }
    for (let x = shelfGx; x < shelfGx + SHELF_W; x++) {
      this.shelfApproach.add(`${x},${shelfGy + 2}`);
    }

    const labelCenterX = (w / 2) * TILE;

    this.add
      .text(labelCenterX, 3, `${house.name} · ${noteCount}`, {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#ffffff',
        backgroundColor: '#000000',
      })
      .setOrigin(0.5, 0)
      .setDepth(6);

    this.add
      .text(labelCenterX, 13, 'CUSTOMIZE', {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#ffe066',
        backgroundColor: '#000000',
      })
      .setOrigin(0.5, 0)
      .setDepth(6)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.openEditor());

    const allNotes = house.rooms.flatMap((r) => r.notes);
    for (const placement of this.layout.placements) {
      this.renderPlacement(placement, allNotes);
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
    const onResize = () => {
      bus.emit('close-interior-editor', undefined);
      this.scene.restart({ houseId: this.houseId });
    };
    this.scale.on(Phaser.Scale.Events.RESIZE, onResize);
    this.events.once('shutdown', () => this.scale.off(Phaser.Scale.Events.RESIZE, onResize));

    this.prevGx = this.doorGx;
    this.prevGy = this.doorGy;

    bus.on('close-shelf', this.onCloseShelf);
    bus.on('close-note', this.onCloseNote);
    bus.on('close-interior-editor', this.onCloseEditor);
    bus.on('commit-interior-layout', this.onCommitLayout);
    this.events.once('shutdown', () => {
      bus.off('close-shelf', this.onCloseShelf);
      bus.off('close-note', this.onCloseNote);
      bus.off('close-interior-editor', this.onCloseEditor);
      bus.off('commit-interior-layout', this.onCommitLayout);
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

  private openEditor() {
    if (this.shelfOpen || this.noteOpen || this.exiting || this.editingLayout) return;
    this.editingLayout = true;
    bus.emit('open-interior-editor', {
      houseId: this.houseId,
      w: Math.max(MIN_ROOM_W, Math.ceil(this.scale.width / TILE)),
      h: Math.max(MIN_ROOM_H, Math.ceil(this.scale.height / TILE)),
      doorGx: this.doorGx,
      doorGy: this.doorGy,
      layout: this.layout,
    });
  }

  private renderPlacement(placement: FurniturePlacement, allNotes: NoteRef[]) {
    const entry = CATALOG_BY_ID[placement.item];
    if (!entry) return;
    const [fw, fh] = entry.footprint;
    const { gx, gy, rotation } = placement;
    const isRug = entry.category === 'rug';

    const img = this.add
      .image(gx * TILE, gy * TILE, entry.textureKey, entry.frameKey)
      .setOrigin(0, 0)
      .setDepth(isRug ? 2 : 5);

    if (entry.rotations.length > 2) {
      img.setOrigin(0.5, 0.5).setPosition((gx + fw / 2) * TILE, (gy + fh / 2) * TILE).setAngle(rotation);
    } else if (rotation === 180) {
      img.setFlipX(true);
    }

    for (let i = 0; i < fw; i++) {
      for (let j = 0; j < fh; j++) {
        const key = `${gx + i},${gy + j}`;
        if (!isRug) this.blocked.add(key);
      }
    }

    const note = placement.noteId ? allNotes.find((n) => n.id === placement.noteId) : undefined;
    if (note) {
      img.setInteractive({ useHandCursor: true });
      img.on('pointerdown', () => this.openNote(note));
      const apKey = `${gx + Math.floor(fw / 2)},${gy + fh}`;
      this.approach.set(apKey, note);
    }
  }

  update() {
    if (!this.player || !this.movement) return;
    if (this.shelfOpen || this.noteOpen || this.exiting || this.editingLayout) return;

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
