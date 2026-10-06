import Phaser from 'phaser';
import { bus } from '@/game/bus';
import { GridMovement, TILE, tileToWorld, worldToTile, type Walkable } from '@/game/gridMovement';
import { dressPlayer } from '@/game/playerSprite';
import { lie, sit } from '@/game/furniturePoses';
import type { Appearance, CatalogEntry, House, NoteRef, WorldModel, InteriorLayout, FurniturePlacement } from '@/lib/types';
import { DEFAULT_APPEARANCE } from '@/lib/characterCatalog';
import { loadAppearance } from '@/lib/appearance';
import {
  SHELF_SEGMENTS,
  SHELF_GY,
  SHELF_W,
  FLOOR_FRAMES,
  WALL_TRIPLES,
  ROOM_SIZES,
  doorPositionFor,
  doorSlots,
  computeDefaultLayout,
  HEADER_TILES,
  TOP_FIRST_GX,
  type DoorSlot,
} from '@/lib/interiorLayout';
import { getLayout, saveLayout } from '@/lib/interiorStore';
import {
  CATALOG_BY_ID,
  FURNITURE_ACTIONS,
  SHELF_SHEET,
  WALKABLE,
  furnitureTextureKey,
  type FurnitureAction,
} from '@/lib/catalog';
import { attachRemotePlayers } from '@/game/remotePlayers';
import { setSelfPresence } from '@/lib/multiplayer/session';

function findHouse(world: WorldModel | undefined, houseId: string): House | undefined {
  if (!world) return undefined;
  for (const region of world.regions) {
    const house = region.houses.find((h) => h.id === houseId);
    if (house) return house;
  }
  return undefined;
}

type PieceAction = {
  action: FurnitureAction;
  entry: CatalogEntry;
  placement: FurniturePlacement;
  note?: NoteRef;
};

// A doorway in the entrance's wall to one of the house's other rooms.
type Door = { slot: DoorSlot; roomId: string; name: string };

function shorten(name: string, max: number): string {
  return name.length <= max ? name : `${name.slice(0, max - 2)}..`;
}

// In-room labels use the game's pixel font, boxed in the bookshelf's dark wood. The game draws
// at 1/3 of screen size and the browser scales it up, so text has to sit on the game's own
// pixel grid: ArcadeClassic's grid is 1/14 of its size, so 14px makes one font pixel one game
// pixel, and 0.3px of letter spacing rounds its 7.7px advance to a whole 8. CuteFantasy fills
// in the punctuation ArcadeClassic lacks.
const LABEL_FONT = 'ArcadeClassic, CuteFantasy';
function labelStyle(color = '#f4e4c1'): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: LABEL_FONT, fontSize: '14px', letterSpacing: 0.3, color, backgroundColor: '#3f2832', padding: { x: 2, y: 1 } };
}

// ArcadeClassic's space is barely wider than its letter gap; canvas text has no word-spacing.
function spaced(text: string): string {
  return text.replace(/ /g, '  ');
}

// Shows "Name (count)" in `label`, cut until it's no wider than `maxWidth`.
function fitHeader(label: Phaser.GameObjects.Text, name: string, count: number, maxWidth: number) {
  const suffix = ` (${count})`;
  for (let n = name.length; n > 0; n--) {
    label.setText(spaced((n === name.length ? name : `${name.slice(0, n).trimEnd()}..`) + suffix));
    if (label.displayWidth <= maxWidth) return;
  }
  label.setText(suffix.trim());
}

export default class InteriorScene extends Phaser.Scene {
  private houseId!: string;
  private roomCount = 0;
  private canAddRooms = false;
  private roomId!: string;
  private fromRoomId: string | undefined;
  private isEntrance = true;
  private doors = new Map<string, Door>();
  private doorAhead = new Map<string, Door>();
  private doorHint!: Phaser.GameObjects.Text;

  private doorGx = 0;
  private doorGy = 0;
  private blocked = new Set<string>();
  private shelfApproach = new Set<string>();
  private approach = new Map<string, NoteRef>();
  private actions = new Map<string, PieceAction>();

  private player!: Phaser.GameObjects.Sprite;
  private appearance!: Appearance;
  private undress: (() => void) | null = null;
  private movement!: GridMovement;
  private indicator!: Phaser.GameObjects.Text;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private enterKey!: Phaser.Input.Keyboard.Key;
  private standKeys: Phaser.Input.Keyboard.Key[] = [];

  // Sitting or lying: how to take the pose apart, the tile to stand back up on, and which
  // keys were already held when it began (they don't count until pressed again).
  private pose: { undo: () => void; gx: number; gy: number; held: Set<Phaser.Input.Keyboard.Key> } | null = null;
  private bedTarget: PieceAction | null = null;

  private shelfOpen = false;
  private noteOpen = false;
  private wardrobeOpen = false;
  private bedMenuOpen = false;
  private exiting = false;
  private prevGx = 0;
  private prevGy = 0;
  private roomPxW = 0;
  private roomPxH = 0;
  // In-room text is drawn at 1/zoom, so it stays its usual size on screen when the room is
  // scaled up to fill the view.
  private labelScale = 1;
  private labels: Phaser.GameObjects.Text[] = [];
  private header: { label: Phaser.GameObjects.Text; customize: Phaser.GameObjects.Text | null; name: string; count: number; leftX: number; rightX: number } | null = null;

  private editingLayout = false;
  private fingerprint: string | undefined;
  private layout!: InteriorLayout;

  private onCloseShelf = () => {
    this.shelfOpen = false;
  };

  private onCloseNote = () => {
    this.noteOpen = false;
  };

  // A room added from the editor needs its doorway drawn, even if the edit was cancelled.
  private onCloseEditor = () => {
    this.editingLayout = false;
    const house = findHouse(this.game.registry.get('world'), this.houseId);
    if (house && house.rooms.length !== this.roomCount) this.scene.restart({ houseId: this.houseId, roomId: this.roomId });
  };

  // The picker already saved each change; pick it up and redress on the spot. Keys are
  // reset because the Enter that closed the picker would otherwise reopen it next frame.
  private onCloseWardrobe = () => {
    this.wardrobeOpen = false;
    this.input.keyboard?.resetKeys();
    this.appearance = loadAppearance();
    this.game.registry.set('appearance', this.appearance);
    this.undress?.();
    this.undress = dressPlayer(this, this.player, this.appearance);
  };

  private onBedMenuChoice = ({ choice }: { choice: 'read' | 'lie' | 'cancel' }) => {
    this.bedMenuOpen = false;
    this.input.keyboard?.resetKeys();
    const target = this.bedTarget;
    this.bedTarget = null;
    if (!target) return;
    if (choice === 'read' && target.note) this.openNote(target.note);
    else if (choice === 'lie') this.act(target);
  };

  private onCommitLayout = ({ roomId, layout }: { roomId: string; layout: InteriorLayout }) => {
    if (roomId !== this.roomId || !this.fingerprint) return;
    saveLayout(this.fingerprint, roomId, layout);
    this.scene.restart({ houseId: this.houseId, roomId });
  };

  private onWorldUpdated = () => {
    if (this.fingerprint) return;
    const layouts = this.game.registry.get('sessionLayouts') as Record<string, InteriorLayout> | undefined;
    const next = layouts?.[this.roomId];
    if (next && JSON.stringify(next) !== JSON.stringify(this.layout)) this.scene.restart({ houseId: this.houseId, roomId: this.roomId });
  };


  constructor() {
    super('InteriorScene');
  }

  init(data: { houseId: string; roomId?: string; fromRoomId?: string }) {
    this.houseId = data.houseId;
    this.roomId = data.roomId ?? data.houseId;
    this.fromRoomId = data.fromRoomId;
    this.shelfOpen = false;
    this.noteOpen = false;
    this.wardrobeOpen = false;
    this.bedMenuOpen = false;
    this.exiting = false;
    this.editingLayout = false;
    this.blocked = new Set();
    this.shelfApproach = new Set();
    this.approach = new Map();
    this.actions = new Map();
    this.pose = null;
    this.bedTarget = null;
    this.undress = null;
    this.doors = new Map();
    this.labels = [];
    this.header = null;
    this.doorAhead = new Map();
  }

  create() {
    const world = this.game.registry.get('world') as WorldModel | undefined;
    const house = findHouse(world, this.houseId);

    if (!house) {
      this.add.text(20, 20, 'Loading house...', { color: '#ffffff' });
      return;
    }

    const room = house.rooms.find((r) => r.id === this.roomId) ?? house.rooms[0];
    this.roomId = room.id;
    this.roomCount = house.rooms.length;
    this.isEntrance = room.id === house.id;

    this.fingerprint = this.game.registry.get('vaultFingerprint') as string | undefined;
    const sessionLayouts = this.game.registry.get('sessionLayouts') as Record<string, InteriorLayout> | undefined;
    const saved = this.fingerprint
      ? getLayout(this.fingerprint, room.id)
      : (sessionLayouts?.[room.id] ?? null);
    this.layout = saved ?? computeDefaultLayout(house, room);
    const [w, h] = ROOM_SIZES[this.layout.roomSize];
    [this.doorGx, this.doorGy] = doorPositionFor(w, h);
    this.roomPxW = w * TILE;
    this.roomPxH = h * TILE;
    // A room too big for the view at the usual pixel size gets a step smaller (game/config.ts).
    const minView = this.game.registry.get('minView') as [number, number] | null | undefined;
    if (minView?.[0] !== this.roomPxW || minView?.[1] !== this.roomPxH) this.game.registry.set('minView', [this.roomPxW, this.roomPxH]);
    this.labelScale = 1 / this.roomZoom();

    // The entrance has a doorway per other room. Rooms beyond the wall's capacity get no door;
    // their notes are still on the entrance bookshelf. Rooms are added from CUSTOMIZE, only by
    // the town's owner and only in a house with its own folder (a "Main" house's subfolder
    // would parse as a new house, not a room).
    const others = this.isEntrance ? house.rooms.slice(1) : [];
    this.canAddRooms = this.isEntrance && this.game.registry.get('role') !== 'guest' && house.id.includes('/');
    const slots = doorSlots(this.layout, CATALOG_BY_ID, others.length);
    others.forEach((r, i) => {
      if (slots[i]) this.addDoor({ slot: slots[i], roomId: r.id, name: r.name });
    });
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

        const isDoorway = (x === this.doorGx && y === this.doorGy) || this.doors.has(`${x},${y}`);
        const isPerimeter = x === 0 || y === 0 || x === w - 1 || y === h - 1;
        if (!isPerimeter || isDoorway) continue;

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
        if (this.doors.has(`${x},0`)) continue;
        this.add.image(x * TILE, SHELF_GY * TILE, 'interior-walls', wallBase).setOrigin(0, 0).setDepth(1);
        this.blocked.add(`${x},${SHELF_GY}`);
      }
    }

    // Bookshelf: three verified 32x32 shelf frames side by side, rows shelfGy..shelfGy+1.
    for (let s = 0; s < SHELF_SEGMENTS; s++) {
      const gx = shelfGx + s * 2;
      const img = this.add
        .image(gx * TILE, shelfGy * TILE, furnitureTextureKey(SHELF_SHEET), 'shelf')
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

    // Name and CUSTOMIZE share the top wall's row in the top-right corner, so they never cover
    // the bookshelf; the name gets whatever the door slots and the coin purse leave free.
    const labelRightX = w * TILE - 3;
    const customize = this.game.registry.get('role') === 'guest' ? null
      : this.label(labelRightX, 1, 'CUSTOMIZE', labelStyle('#ffe066'))
        .setOrigin(1, 0)
        .setDepth(6)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.openEditor());
    this.header = {
      label: this.label(labelRightX, 1, '', labelStyle()).setOrigin(1, 0).setDepth(6),
      customize,
      name: this.isEntrance ? house.name : room.name,
      count: this.isEntrance ? noteCount : room.notes.length,
      leftX: Math.max(w - 1 - HEADER_TILES, TOP_FIRST_GX) * TILE,
      rightX: labelRightX,
    };
    this.layoutHeader();

    for (const door of this.doors.values()) this.drawDoorLabel(door);

    const allNotes = house.rooms.flatMap((r) => r.notes);
    for (const placement of this.layout.placements) {
      this.renderPlacement(placement, allNotes);
    }

    this.label(this.doorGx * TILE + TILE / 2, h * TILE - 2, this.isEntrance ? 'EXIT' : 'BACK', labelStyle())
      .setOrigin(0.5, 1)
      .setDepth(6);

    // Back from a room: stand just inside its doorway, not at the house's front door.
    const back = this.fromRoomId ? [...this.doors.values()].find((d) => d.roomId === this.fromRoomId) : undefined;
    const [spawnGx, spawnGy] = back ? back.slot.inside[0] : [this.doorGx, this.doorGy];
    const spawn = tileToWorld(spawnGx, spawnGy);
    this.player = this.add.sprite(spawn.x, spawn.y, 'player');
    this.player.setOrigin(0.5, 0.64);
    this.player.setDepth(10);
    this.appearance = (this.game.registry.get('appearance') as Appearance | undefined) ?? DEFAULT_APPEARANCE;
    this.undress = dressPlayer(this, this.player, this.appearance);

    const isWalkable: Walkable = (gx, gy) => {
      if (gx === this.doorGx && gy === this.doorGy) return true;
      if (this.doors.has(`${gx},${gy}`)) return true;
      if (gx <= 0 || gy <= 0 || gx >= w - 1 || gy >= h - 1) return false;
      return !this.blocked.has(`${gx},${gy}`);
    };

    this.movement = new GridMovement(this, this.player, isWalkable);
    // Back from a room you're often still holding the key that walked you out, and a bottom-wall
    // doorway is right behind you.
    if (back) this.movement.ignoreHeldKeys();
    const sceneId = `house:${this.roomId}` as const;
    this.movement.onStep = (gx, gy, facing) => setSelfPresence({ scene: sceneId, gx, gy, facing });
    setSelfPresence({ scene: sceneId, gx: spawnGx, gy: spawnGy, facing: 'down' });
    attachRemotePlayers(this, sceneId, this.player);

    this.indicator = this
      .label(0, 0, '!', { fontFamily: LABEL_FONT, fontSize: '14px', color: '#ffe066' })
      
      .setOrigin(0.5, 1)
      .setDepth(1000)
      .setVisible(false);

    this.doorHint = this
      .label(0, 0, '', labelStyle())
      .setOrigin(0.5, 1)
      .setDepth(1000)
      .setVisible(false);

    const keyboard = this.input.keyboard!;
    this.spaceKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.enterKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    const cursors = keyboard.createCursorKeys();
    const wasd = keyboard.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;
    this.standKeys = [cursors.up, cursors.down, cursors.left, cursors.right, ...Object.values(wasd), this.spaceKey, this.enterKey];

    this.cameras.main.setBackgroundColor('#141018');
    this.fitCamera();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.fitCamera);

    this.prevGx = spawnGx;
    this.prevGy = spawnGy;

    bus.on('close-shelf', this.onCloseShelf);
    bus.on('close-note', this.onCloseNote);
    bus.on('close-interior-editor', this.onCloseEditor);
    bus.on('close-wardrobe', this.onCloseWardrobe);
    bus.on('bed-menu-choice', this.onBedMenuChoice);
    bus.on('commit-interior-layout', this.onCommitLayout);
    bus.on('world-updated', this.onWorldUpdated);
    this.events.once('shutdown', () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.fitCamera);
      bus.off('close-shelf', this.onCloseShelf);
      bus.off('close-note', this.onCloseNote);
      bus.off('close-interior-editor', this.onCloseEditor);
      bus.off('close-wardrobe', this.onCloseWardrobe);
      bus.off('bed-menu-choice', this.onBedMenuChoice);
      bus.off('commit-interior-layout', this.onCommitLayout);
      bus.off('world-updated', this.onWorldUpdated);
    });
  }

  // A room is only a few hundred pixels across. Show it as big as fits whole, scaled by a
  // whole number (pixel art stays crisp only at whole multiples), centred in the view. In a
  // window too small for the room even at 1x, follow the player across it instead.
  private roomZoom() {
    const cam = this.cameras.main;
    return Math.max(1, Math.floor(Math.min(cam.width / this.roomPxW, cam.height / this.roomPxH)));
  }

  private label(x: number, y: number, text: string, style: Phaser.Types.GameObjects.Text.TextStyle) {
    const t = this.add.text(x, y, text, style).setScale(this.labelScale);
    this.labels.push(t);
    return t;
  }

  // The room name takes whatever CUSTOMIZE leaves of the top-right corner.
  private layoutHeader() {
    const h = this.header;
    if (!h) return;
    const rightX = h.customize ? h.rightX - h.customize.displayWidth - 2 * this.labelScale : h.rightX;
    h.label.setX(rightX);
    fitHeader(h.label, h.name, h.count, rightX - h.leftX);
  }

  private fitCamera = () => {
    const cam = this.cameras.main;
    const rw = this.roomPxW, rh = this.roomPxH;
    const zoom = this.roomZoom();
    if (Math.abs(zoom * this.labelScale - 1) > 1e-9) {
      this.labelScale = 1 / zoom;
      for (const t of this.labels) t.setScale(this.labelScale);
      this.layoutHeader();
    }
    cam.setZoom(zoom);
    const vw = cam.width / zoom, vh = cam.height / zoom;
    // Bounds at least the view's size, centred on the room, so a room smaller than the view
    // sits in the middle and a bigger one scrolls only as far as its walls.
    cam.setBounds(Math.min(0, Math.round((rw - vw) / 2)), Math.min(0, Math.round((rh - vh) / 2)), Math.max(rw, vw), Math.max(rh, vh));
    cam.startFollow(this.player, true);
  };

  private overlayOpen() {
    return this.shelfOpen || this.noteOpen || this.wardrobeOpen || this.bedMenuOpen || this.editingLayout;
  }

  private openNote(note: NoteRef) {
    if (this.overlayOpen() || this.exiting) return;
    this.noteOpen = true;
    bus.emit('open-note', { note });
  }

  private openShelf() {
    if (this.overlayOpen() || this.exiting) return;
    this.shelfOpen = true;
    bus.emit('open-shelf', { houseId: this.houseId, roomId: this.roomId });
  }

  private openEditor() {
    if (this.overlayOpen() || this.exiting) return;
    this.editingLayout = true;
    bus.emit('open-interior-editor', {
      houseId: this.houseId,
      roomId: this.roomId,
      layout: this.layout,
      doorsNeeded: this.doors.size,
      roomNames: [...this.doors.values()].map((d) => d.name),
      canAddRooms: this.canAddRooms,
    });
  }

  private addDoor(door: Door) {
    this.doors.set(`${door.slot.gx},${door.slot.gy}`, door);
    for (const [x, y] of door.slot.inside) this.doorAhead.set(`${x},${y}`, door);
  }

  private drawDoorLabel(door: Door) {
    const { gx, gy, side } = door.slot;
    const text = spaced(shorten(door.name, side === 'top' || side === 'bottom' ? 4 : 8));
    const style = labelStyle();
    const cx = gx * TILE + TILE / 2;
    const cy = gy * TILE + TILE / 2;
    const label =
      side === 'top' ? this.label(cx, 2, text, style).setOrigin(0.5, 0)
      : side === 'bottom' ? this.label(cx, (gy + 1) * TILE - 2, text, style).setOrigin(0.5, 1)
      : side === 'left' ? this.label(TILE + 2, cy, text, style).setOrigin(0, 0.5)
      : this.label(gx * TILE - 2, cy, text, style).setOrigin(1, 0.5);
    label.setDepth(6);
  }

  private enterRoom(roomId: string) {
    this.exiting = true;
    this.scene.restart({ houseId: this.houseId, roomId });
  }

  private openBedMenu(piece: PieceAction) {
    this.bedMenuOpen = true;
    this.bedTarget = piece;
    bus.emit('open-bed-menu', { note: piece.note! });
  }

  private act(piece: PieceAction) {
    if (piece.action === 'wardrobe') {
      this.wardrobeOpen = true;
      bus.emit('open-wardrobe', undefined);
      return;
    }
    const { gx, gy } = this.movement.getTile();
    this.indicator.setVisible(false);
    const undo =
      piece.action === 'sit'
        ? sit(this, this.player, piece.entry, piece.placement)
        : lie(this, this.player, piece.entry, piece.placement, this.appearance);
    this.pose = { undo, gx, gy, held: new Set(this.standKeys.filter((k) => k.isDown)) };
  }

  // Reading JustDown clears it: a Space/Enter that stood you up must not also count as a
  // fresh press next frame, back on the approach tile, and sit you straight down again.
  private standUp() {
    if (!this.pose) return;
    Phaser.Input.Keyboard.JustDown(this.spaceKey);
    Phaser.Input.Keyboard.JustDown(this.enterKey);
    this.pose.undo();
    this.movement.snapTo(this.pose.gx, this.pose.gy);
    this.player.setFlipX(false).play('idle-down', true);
    this.pose = null;
  }

  // Keys held when the pose began are ignored until they've been let go; Phaser's own
  // JustDown can't be used because it stays true for any press nothing has read yet.
  private wantsToStand() {
    const held = this.pose!.held;
    for (const key of this.standKeys) {
      if (!key.isDown) held.delete(key);
      else if (!held.has(key)) return true;
    }
    return false;
  }

  private renderPlacement(placement: FurniturePlacement, allNotes: NoteRef[]) {
    const entry = CATALOG_BY_ID[placement.item];
    if (!entry) return;
    const [fw, fh] = entry.footprint;
    const { gx, gy, rotation } = placement;
    const walkable = WALKABLE.has(entry.category);

    const img = this.add
      .image(gx * TILE, gy * TILE, entry.textureKey, entry.frameKey)
      .setOrigin(0, 0)
      .setDepth(walkable ? 2 : 5);

    if (entry.rotations.length > 2) {
      img.setOrigin(0.5, 0.5).setPosition((gx + fw / 2) * TILE, (gy + fh / 2) * TILE).setAngle(rotation);
    } else if (rotation === 180) {
      img.setFlipX(true);
    }

    for (let i = 0; i < fw; i++) {
      for (let j = 0; j < fh; j++) {
        const key = `${gx + i},${gy + j}`;
        if (!walkable) this.blocked.add(key);
      }
    }

    const apKey = `${gx + Math.floor(fw / 2)},${gy + fh}`;
    const note = placement.noteId ? allNotes.find((n) => n.id === placement.noteId) : undefined;
    if (note) {
      img.setInteractive({ useHandCursor: true });
      img.on('pointerdown', () => this.openNote(note));
      this.approach.set(apKey, note);
    }

    const action = FURNITURE_ACTIONS[entry.category];
    if (action && !this.actions.has(apKey)) this.actions.set(apKey, { action, entry, placement, note });
  }

  update() {
    if (!this.player || !this.movement) return;
    if (this.overlayOpen() || this.exiting) return;

    if (this.pose) {
      if (this.wantsToStand()) this.standUp();
      return;
    }

    this.movement.update();

    const { gx, gy } = worldToTile(this.player.x, this.player.y);

    if (gx !== this.prevGx || gy !== this.prevGy) {
      this.prevGx = gx;
      this.prevGy = gy;
      if (gx === this.doorGx && gy === this.doorGy) {
        this.exiting = true;
        if (this.isEntrance) bus.emit('exit-house', undefined);
        else this.scene.restart({ houseId: this.houseId, fromRoomId: this.roomId });
        return;
      }
      const door = this.doors.get(`${gx},${gy}`);
      if (door) {
        this.enterRoom(door.roomId);
        return;
      }
    }

    const settled = !this.movement.isMoving();
    const here = `${gx},${gy}`;
    const atShelf = settled && this.shelfApproach.has(here);
    const note = settled ? this.approach.get(here) : undefined;
    const piece = settled ? this.actions.get(here) : undefined;
    if (atShelf || note || piece) {
      this.indicator.setPosition(this.player.x, this.player.y - 34).setVisible(true);
      if (Phaser.Input.Keyboard.JustDown(this.spaceKey) || Phaser.Input.Keyboard.JustDown(this.enterKey)) {
        if (note && piece?.note === note && piece.action === 'lie') this.openBedMenu(piece);
        else if (note) this.openNote(note);
        else if (atShelf) this.openShelf();
        else if (piece) this.act(piece);
      }
    } else {
      this.indicator.setVisible(false);
    }

    // Door labels are cut short; standing in front of one spells out where it goes.
    const ahead = settled ? this.doorAhead.get(here) : undefined;
    if (ahead) {
      const y = this.indicator.visible ? this.player.y - 50 : this.player.y - 34;
      this.doorHint.setText(spaced(ahead.name)).setPosition(this.player.x, y).setVisible(true);
    } else {
      this.doorHint.setVisible(false);
    }
  }
}
