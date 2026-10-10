'use client';

import { useEffect, useRef, useState } from 'react';
import { bus } from '@/game/bus';
import { CATALOG, CATALOG_BY_GROUP, CATALOG_BY_ID, CATALOG_GROUPS, NOTE_STORE_ITEMS, SHELF_RECT, SHELF_SHEET, furnitureSheetUrl } from '@/lib/catalog';
import type { CatalogGroupId } from '@/lib/catalog';
import { canPlace, canPlaceShelf, canResize, resizeLayout, doorCells, doorSlots, placementSpot, restyleShelf, ridersOf, structuralOccupied, shelfSize, surfaceUnder, ROOM_SIZES, doorPositionFor, SHELF_SEGMENTS, FLOOR_FRAMES, WALL_TRIPLES } from '@/lib/interiorLayout';
import type { CatalogEntry, CatalogItemId, CatalogLayer, CatalogTier, FurniturePlacement, InteriorLayout, RoomSize } from '@/lib/types';
import { MIN_WORDS, NOTE_REWARD, available, priceOf, unlockId } from '@/lib/wallet';
import { buy, commitLayoutChange, unlockAll, unlockCost, useWallet } from '@/lib/walletStore';
import { sfx } from '@/game/audio/sfx';
import { useSession } from '@/lib/multiplayer/session';
import { replaceWorld, useVault } from '@/lib/vault/open';
import Coin from './Coin';
import styles from './InteriorEditor.module.css';

const SHELF_SHEET_URL = furnitureSheetUrl(SHELF_SHEET);
// One bookshelf segment, for the shelf's look picker.
const BOOKSHELF_THUMB = { footprint: [2, 2] as [number, number], rect: SHELF_RECT, sheetUrl: SHELF_SHEET_URL };

const TIER_COLOR: Record<CatalogTier, string> = {
  common: '#737373',
  uncommon: '#4ade80',
  rare: '#38bdf8',
  treasure: '#fbbf24',
};

type Session = { houseId: string; roomId: string; doorsNeeded: number; roomNames: string[]; canAddRooms: boolean };

const CROWDED = "You can't add rooms while friends are in your town.";
// A selection/move target is either one furniture placement (its index) or
// the shelf, which isn't part of `placements` — it's always present; only its
// position and look are editable.
type Target = number | 'shelf';
type Tab = CatalogGroupId | 'all';

// Which piece a click on a cell means when several share it: what's on top.
const RANK: Record<CatalogLayer, number> = { rug: 1, wall: 2, floor: 2, tabletop: 3 };

function nameOf(item: CatalogItemId): string {
  return CATALOG_BY_ID[item]?.name ?? item;
}

// A piece's sprite, scaled to fit a fixed box so every tile is the same size.
function Thumb({ entry }: { entry: Pick<CatalogEntry, 'rect' | 'sheetUrl'> }) {
  const [rx, ry, rw, rh] = entry.rect;
  return (
    <span className="flex h-10 w-10 items-center justify-center overflow-hidden">
      <span
        className="shrink-0"
        style={{
          width: rw,
          height: rh,
          backgroundImage: `url(${entry.sheetUrl})`,
          backgroundPosition: `-${rx}px -${ry}px`,
          imageRendering: 'pixelated',
          transform: `scale(${Math.min(40 / Math.max(rw, rh), 2.5)})`,
        }}
      />
    </span>
  );
}

// `owned` null = no wallet (free placement, no badge). The bottom border is the piece's tier.
function ShopTile({ entry, owned, balance, disabled, onClick, onHover }: {
  entry: CatalogEntry;
  owned: number | null;
  balance: number;
  disabled?: boolean;
  onClick: () => void;
  onHover?: (entry: CatalogEntry | null) => void;
}) {
  const price = priceOf(entry.id);
  const forSale = owned !== null && owned <= 0;
  const short = forSale && price !== null && price > balance;
  const title = disabled
    ? `${entry.name} - doesn't fit here`
    : forSale
      ? `${entry.name} (${entry.tier}) - buy for ${price} coins`
      : owned !== null
        ? `${entry.name} - you have ${owned}`
        : `${entry.name} (${entry.tier})`;
  return (
    <button
      title={title}
      disabled={disabled}
      className={`${styles.tile} ${short ? styles.short : ''}`}
      style={{ borderBottomColor: TIER_COLOR[entry.tier] }}
      onClick={onClick}
      onMouseEnter={() => onHover?.(entry)}
      onMouseLeave={() => onHover?.(null)}
    >
      <Thumb entry={entry} />
      {owned !== null &&
        (forSale ? (
          <span className={`${styles.price} ${short ? styles.priceShort : ''}`}>
            <Coin size={8} />
            {price}
          </span>
        ) : (
          <span className={styles.owned}>x{owned}</span>
        ))}
    </button>
  );
}

export default function InteriorEditor() {
  const [session, setSession] = useState<Session | null>(null);
  const [draft, setDraft] = useState<InteriorLayout | null>(null);
  // The committed placements this session started from; the draft's difference from these is
  // what Save takes out of (or puts back into) the inventory.
  const [saved, setSaved] = useState<FurniturePlacement[]>([]);
  // The size the room had when the editor opened: always free to keep.
  const [savedSize, setSavedSize] = useState<RoomSize>('small');
  const wallet = useWallet();
  const [selected, setSelected] = useState<Target | null>(null);
  const [picking, setPicking] = useState<{ gx: number; gy: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moving, setMoving] = useState<Target | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');
  const [hovered, setHovered] = useState<CatalogEntry | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const { vault, setVault } = useVault();
  const study = useSession();
  // Rooms made during this edit: they exist on disk already, so their doorways join the draft.
  const [added, setAdded] = useState<string[]>([]);
  const [naming, setNaming] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [roomError, setRoomError] = useState<string | null>(null);
  const [creatingRoom, setCreatingRoom] = useState(false);

  useEffect(() => {
    const onOpen = (payload: Session & { layout: InteriorLayout }) => {
      const { layout, ...s } = payload;
      setSession(s);
      setDraft(layout);
      setSaved(layout.placements);
      setSavedSize(layout.roomSize);
      setSelected(null);
      setPicking(null);
      setError(null);
      setMoving(null);
      setAdded([]);
      setNaming(false);
      setRoomError(null);
    };
    bus.on('open-interior-editor', onOpen);
    return () => bus.off('open-interior-editor', onOpen);
  }, []);

  // Capture phase, following NoteReader's convention, so Escape beats Phaser's own listeners.
  useEffect(() => {
    if (!session) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (naming) {
          setNaming(false);
          return;
        }
        if (moving !== null) {
          setMoving(null);
          return;
        }
        close();
      }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [session, moving, naming]);

  function close() {
    setSession(null);
    setDraft(null);
    bus.emit('close-interior-editor', undefined);
  }

  // Rooms start small; Medium and Large are bought once and then free in every room.
  function sizeCost(size: RoomSize): number {
    return size === savedSize ? 0 : unlockCost(wallet, unlockId('roomSize', size));
  }

  function save() {
    if (!session || !draft) return;
    const cost = sizeCost(draft.roomSize);
    if (cost > 0 && !unlockAll([unlockId('roomSize', draft.roomSize)])) {
      setError(
        wallet.active
          ? `A ${draft.roomSize} room costs ${cost} coins and you have ${wallet.balance}. Write notes to earn more!`
          : "Bigger rooms are bought with your own town's coins.",
      );
      return;
    }
    commitLayoutChange(saved, draft.placements);
    bus.emit('commit-interior-layout', { roomId: session.roomId, layout: draft });
    setSession(null);
    setDraft(null);
    bus.emit('close-interior-editor', undefined);
  }

  if (!session || !draft) return null;

  const [w, h] = ROOM_SIZES[draft.roomSize];
  const [doorGx, doorGy] = doorPositionFor(w, h);
  // A fresh non-null binding: nested function declarations below close over `draft`
  // without narrowing (TS doesn't carry the early-return null check across function
  // boundaries), so they read this instead.
  const layout = draft;

  const doorsNeeded = session.doorsNeeded + added.length;
  // Doorways to the house's other rooms and the tiles in front of them, recomputed from the
  // draft so they shift live as the size, shelf or furniture change. Nothing may be placed
  // on them, which keeps every door reachable.
  const roomDoors = doorCells(doorSlots(layout, CATALOG_BY_ID, doorsNeeded));
  const fitsDoors = (next: InteriorLayout) => doorSlots(next, CATALOG_BY_ID, doorsNeeded).length >= doorsNeeded;

  // The perimeter and the doorways — cells nothing can ever occupy (disabled buttons). The
  // shelf blocks furniture too, but it can move, so canPlace checks it wherever it stands.
  const structural = structuralOccupied(w, h);
  for (const cell of roomDoors) structural.add(cell);
  const spotFor = (item: CatalogItemId, gx: number, gy: number, skip?: ReadonlySet<number>) =>
    placementSpot(layout, CATALOG_BY_ID, structural, w, h, item, gx, gy, skip);
  const [shelfW, shelfH] = shelfSize(layout.shelf, CATALOG_BY_ID);
  const shelfEntry = layout.shelf.item ? CATALOG_BY_ID[layout.shelf.item] : undefined;
  const shelfName = shelfEntry?.name ?? 'Bookshelf';

  const crowded = study.status === 'live' && study.peers.length > 0;
  const addBlocked = crowded
    ? CROWDED
    : doorSlots(layout, CATALOG_BY_ID, doorsNeeded + 1).length <= doorsNeeded
      ? 'Make the room bigger or clear a wall to fit another door.'
      : null;

  async function addRoom() {
    if (!session || !vault?.createRoom || creatingRoom) return;
    // Someone may have joined while the name was being typed.
    if (study.status === 'live' && study.peers.length > 0) {
      setRoomError(CROWDED);
      return;
    }
    setCreatingRoom(true);
    setRoomError(null);
    try {
      const { world, room } = await vault.createRoom(session.houseId, roomName);
      setVault({ ...vault, world });
      replaceWorld(world);
      setAdded((a) => [...a, room.name]);
      setNaming(false);
    } catch (err) {
      setRoomError(err instanceof Error ? err.message : 'Could not add the room.');
    } finally {
      setCreatingRoom(false);
    }
  }

  function owned(item: CatalogItemId): number {
    return available(wallet.inventory, saved, layout.placements, item);
  }

  // Takes one piece from the inventory, buying it first if there's none left. Purchases are
  // final even if the edit is cancelled — the piece just stays in the inventory.
  function acquire(item: CatalogItemId): boolean {
    if (!wallet.active || owned(item) > 0) return true;
    const price = priceOf(item);
    if (price === null) return false;
    if (!buy(item)) {
      sfx('error');
      setError(`${nameOf(item)} costs ${price} coins. Write notes to earn more!`);
      return false;
    }
    sfx('buy');
    return true;
  }

  // The topmost piece covering a cell: a candle over its table over the rug beneath.
  function cellPlacementIndex(gx: number, gy: number): number | null {
    let best: number | null = null;
    let bestRank = 0;
    for (let i = 0; i < layout.placements.length; i++) {
      const p = layout.placements[i];
      const entry = CATALOG_BY_ID[p.item];
      if (!entry) continue;
      const [fw, fh] = entry.footprint;
      if (gx >= p.gx && gx < p.gx + fw && gy >= p.gy && gy < p.gy + fh && RANK[entry.layer] > bestRank) {
        best = i;
        bestRank = RANK[entry.layer];
      }
    }
    return best;
  }

  // Can something go on top of piece `idx` at this cell — furniture on a rug, a candle on a table?
  function hosts(idx: number, gx: number, gy: number): boolean {
    const entry = CATALOG_BY_ID[layout.placements[idx].item];
    return entry?.layer === 'rug' || surfaceUnder(layout, CATALOG_BY_ID, gx, gy) === idx;
  }

  // The cell under the pointer: pieces drawn taller than their footprint, or under others, are
  // clicked through to whatever is really at that spot.
  function cellAt(e: React.MouseEvent): [number, number] | null {
    const el = gridRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const gx = Math.floor((e.clientX - rect.left - el.clientLeft) / 16);
    const gy = Math.floor((e.clientY - rect.top - el.clientTop) / 16);
    return gx >= 0 && gy >= 0 && gx < w && gy < h ? [gx, gy] : null;
  }

  function onPieceClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const cell = cellAt(e);
    if (cell) onCellClick(...cell);
  }

  function isShelfCell(gx: number, gy: number): boolean {
    const { gx: sx, gy: sy } = layout.shelf;
    return gx >= sx && gx < sx + shelfW && gy >= sy && gy < sy + shelfH;
  }

  function select(gx: number, gy: number, idx: number | null, onShelf: boolean) {
    if (onShelf) {
      setSelected('shelf');
      setPicking(null);
    } else if (idx !== null) {
      setSelected(idx);
      setPicking(hosts(idx, gx, gy) ? { gx, gy } : null);
      if (surfaceUnder(layout, CATALOG_BY_ID, gx, gy) === idx) setTab('tabletop');
    } else {
      setSelected(null);
      setPicking({ gx, gy });
    }
  }

  function onCellClick(gx: number, gy: number) {
    setError(null);
    const idx = cellPlacementIndex(gx, gy);
    if (structural.has(`${gx},${gy}`) && idx === null) return;
    const onShelf = isShelfCell(gx, gy);

    if (moving !== null) {
      if (!draft) return;
      if (moving !== 'shelf') {
        // Whatever stands on the piece moves with it.
        const p = draft.placements[moving];
        const riders = ridersOf(draft, CATALOG_BY_ID, moving);
        const spot = spotFor(p.item, gx, gy, new Set([moving, ...riders]));
        if (!spot) {
          if ((idx !== null && idx !== moving) || onShelf) {
            // Clicking something that's in the way cancels the move and selects it instead —
            // more forgiving than silently ignoring it.
            setMoving(null);
            select(gx, gy, idx, onShelf);
          } else {
            setError("Doesn't fit there.");
          }
          return;
        }
        const [dx, dy] = [spot[0] - p.gx, spot[1] - p.gy];
        const placements = draft.placements.map((q, i) =>
          i === moving || riders.includes(i) ? { ...q, gx: q.gx + dx, gy: q.gy + dy } : q);
        setDraft({ ...draft, placements });
        setSelected(moving);
        setMoving(null);
        return;
      }
      if (idx !== null && CATALOG_BY_ID[draft.placements[idx].item]?.layer !== 'rug') {
        setMoving(null);
        select(gx, gy, idx, onShelf);
        return;
      }
      const next = { ...draft, shelf: { ...draft.shelf, gx, gy } };
      if (!canPlaceShelf(draft, CATALOG_BY_ID, structural, w, h, gx, gy, draft.shelf.item) || !fitsDoors(next)) {
        setError("Doesn't fit there.");
        return;
      }
      setDraft(next);
      setSelected('shelf');
      setMoving(null);
      return;
    }

    select(gx, gy, idx, onShelf);
  }

  function placeItem(item: CatalogItemId) {
    if (!picking || !draft) return;
    const spot = spotFor(item, picking.gx, picking.gy);
    if (!spot) {
      setError("Doesn't fit there.");
      return;
    }
    if (!acquire(item)) return;
    const placement: FurniturePlacement = { item, gx: spot[0], gy: spot[1], rotation: 0 };
    setDraft({ ...draft, placements: [...draft.placements, placement] });
    setSelected(null);
    setPicking(null);
    setHovered(null);
  }

  function toggleMove() {
    if (selected === null) return;
    setError(null);
    setMoving((prev) => (prev === selected ? null : selected));
  }

  function restyle(item: CatalogItemId | undefined) {
    if (!draft) return;
    setError(null);
    const shelf = restyleShelf(draft, CATALOG_BY_ID, structural, w, h, item);
    const next = shelf && { ...draft, shelf };
    if (!next || !fitsDoors(next)) {
      setError("That doesn't fit here — move the shelf or clear some space first.");
      return;
    }
    setDraft(next);
    setMoving(null);
  }

  // Whatever stands on the piece is put away with it.
  function removeSelected() {
    if (selected === null || selected === 'shelf' || !draft) return;
    const gone = new Set([selected, ...ridersOf(draft, CATALOG_BY_ID, selected)]);
    setDraft({ ...draft, placements: draft.placements.filter((_, i) => !gone.has(i)) });
    setSelected(null);
    setMoving(null);
  }

  function rotateSelected() {
    if (selected === null || selected === 'shelf' || !draft) return;
    const p = draft.placements[selected];
    const entry = CATALOG_BY_ID[p.item];
    if (!entry) return;
    const options = entry.rotations;
    const next = options[(options.indexOf(p.rotation) + 1) % options.length];
    const placements = draft.placements.slice();
    placements[selected] = { ...p, rotation: next };
    setDraft({ ...draft, placements });
  }

  function swapSelected(item: CatalogItemId) {
    if (selected === null || selected === 'shelf' || !draft) return;
    setError(null);
    if (!acquire(item)) return;
    const placements = draft.placements.slice();
    placements[selected] = { ...placements[selected], item, rotation: 0 };
    setDraft({ ...draft, placements });
  }

  const needle = query.trim().toLowerCase();
  const shown = (tab === 'all' ? CATALOG : CATALOG_BY_GROUP[tab]).filter(
    (e) => !needle || e.name.toLowerCase().includes(needle),
  );

  const selectedPlacement = typeof selected === 'number' ? draft.placements[selected] : null;
  const selectedCategory = selectedPlacement ? CATALOG_BY_ID[selectedPlacement.item]?.category : null;
  const swaps = selectedPlacement
    ? CATALOG.filter((e) => e.category === selectedCategory && e.id !== selectedPlacement.item)
    : [];
  const shelfSelected = selected === 'shelf';

  return (
    <div
      className={styles.screen}
      onClick={close}
    >
      <div
        className={styles.panel}
        data-panel="room-editor"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <span className={styles.title}>
            Customize
            {wallet.active && (
              <span className={styles.coins} title="Your coins">
                <Coin size={16} />
                {wallet.balance}
              </span>
            )}
          </span>
          <div className="flex gap-2">
            <button className={styles.btn} onClick={close}>
              Cancel
            </button>
            <button className={`${styles.btn} ${styles.primary}`} data-tour="room-save" onClick={save}>
              {sizeCost(draft.roomSize) > 0 ? (
                <span className="flex items-center gap-2">
                  Buy and save
                  <Coin size={14} />
                  {sizeCost(draft.roomSize)}
                </span>
              ) : (
                'Save'
              )}
            </button>
          </div>
        </div>

        <div className={styles.row}>
          <span className={styles.label}>Floor</span>
          {FLOOR_FRAMES.map((frame, i) => (
            <button
              key={frame}
              className={`${styles.swatch} ${draft.floorFrame === i ? styles.swatchOn : ''}`}
              style={{
                // floor.png is 128x128, 8 cols x 8 rows of 16px tiles (docs/ASSETS.md).
                backgroundImage: "url('/assets/interior/floor.png')",
                backgroundPosition: `${-(frame % 8) * 16}px ${-Math.floor(frame / 8) * 16}px`,
                imageRendering: 'pixelated',
              }}
              onClick={() => setDraft({ ...draft, floorFrame: i })}
            />
          ))}
        </div>
        <div className={styles.row}>
          <span className={styles.label}>Wallpaper</span>
          {WALL_TRIPLES.map((triple, i) => (
            <button
              key={i}
              className={`${styles.swatch} ${draft.wallTriple === i ? styles.swatchOn : ''}`}
              style={{
                // walls.png is 224x96, 14 cols x 6 rows of 16px tiles (docs/ASSETS.md).
                backgroundImage: "url('/assets/interior/walls.png')",
                backgroundPosition: `${-(triple[1] % 14) * 16}px ${-Math.floor(triple[1] / 14) * 16}px`,
                imageRendering: 'pixelated',
              }}
              onClick={() => setDraft({ ...draft, wallTriple: i })}
            />
          ))}
        </div>
        <div className={styles.row}>
          <span className={styles.label}>Room size</span>
          {(['small', 'medium', 'large'] as const).map((size) => (
            <button
              key={size}
              className={`${styles.btn} ${draft.roomSize === size ? styles.on : ''}`}
              onClick={() => {
                if (size === draft.roomSize) return;
                const resized = resizeLayout(draft, CATALOG_BY_ID, size, doorsNeeded);
                if (!resized) {
                  setError("These doors won't fit at that size.");
                  return;
                }
                setError(
                  resized.putAway > 0
                    ? `${resized.putAway} ${resized.putAway === 1 ? 'piece' : 'pieces'} didn't fit and went back to your inventory.`
                    : null,
                );
                setPicking(null);
                setDraft(resized.layout);
              }}
              title={sizeCost(size) > 0 ? `${sizeCost(size)} coins, paid when you save` : undefined}
            >
              <span className="flex items-center gap-2">
                {size[0].toUpperCase() + size.slice(1)}
                {sizeCost(size) > 0 && (
                  <>
                    <Coin size={12} />
                    {sizeCost(size)}
                  </>
                )}
              </span>
            </button>
          ))}
        </div>
        {session.canAddRooms && (
          <div className={styles.row}>
            <span className={styles.label}>Rooms</span>
            {[...session.roomNames, ...added].map((name) => (
              <span key={name} className={styles.chip}>{name}</span>
            ))}
            {naming ? (
              <form
                className={styles.row}
                onSubmit={(e) => {
                  e.preventDefault();
                  void addRoom();
                }}
              >
                <input
                  autoFocus
                  className={styles.input}
                  value={roomName}
                  maxLength={60}
                  placeholder="Room name"
                  spellCheck={false}
                  onChange={(e) => setRoomName(e.target.value)}
                  // Keep typed keys away from Phaser's window listeners.
                  onKeyDown={(e) => e.stopPropagation()}
                  onKeyUp={(e) => e.stopPropagation()}
                />
                <button type="submit" className={`${styles.btn} ${styles.primary}`} disabled={creatingRoom || !roomName.trim()}>
                  {creatingRoom ? 'Creating…' : 'Create'}
                </button>
                <button type="button" className={styles.btn} onClick={() => setNaming(false)}>
                  Never mind
                </button>
              </form>
            ) : (
              <button
                className={styles.btn}
                disabled={!!addBlocked}
                title={addBlocked ?? 'Makes a new folder in this house'}
                onClick={() => {
                  setRoomName('');
                  setRoomError(null);
                  setNaming(true);
                }}
              >
                + Add room
              </button>
            )}
            {(roomError || addBlocked) && <span className={styles.error}>{roomError ?? addBlocked}</span>}
          </div>
        )}

        <div className="flex items-start gap-4">
          <div className="flex flex-col gap-2">
            <div
              ref={gridRef}
              className={styles.grid}
              data-tour="room-grid"
              style={{ gridTemplateColumns: `repeat(${w}, 16px)`, gridTemplateRows: `repeat(${h}, 16px)` }}
            >
              {Array.from({ length: h }).map((_, gy) =>
                Array.from({ length: w }).map((_, gx) => {
                  const idx = cellPlacementIndex(gx, gy);
                  const onShelf = isShelfCell(gx, gy);
                  const isStructural = structural.has(`${gx},${gy}`);
                  const isDoor = gx === doorGx && gy === doorGy;
                  const isRoomDoor = roomDoors.has(`${gx},${gy}`);
                  return (
                    <button
                      key={`${gx},${gy}`}
                      className={styles.cell}
                      style={{
                        background: isDoor || isRoomDoor
                          ? '#8a5a2a'
                          : isStructural
                            ? '#3f2832'
                            : idx !== null || onShelf
                              ? '#5a7a5a'
                              : '#2a1c20',
                        cursor: isStructural ? 'default' : 'pointer',
                      }}
                      disabled={isStructural}
                      onClick={() => onCellClick(gx, gy)}
                      onDragOver={(e) => {
                        if (moving === null) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        onCellClick(gx, gy);
                      }}
                      title={isRoomDoor ? 'Doorway' : idx !== null ? nameOf(draft.placements[idx].item) : onShelf ? shelfName : ''}
                    />
                  );
                }),
              )}

              {draft.placements.map((p, i) => {
                const entry = CATALOG_BY_ID[p.item];
                if (!entry) return null;
                const [fw, fh] = entry.footprint;
                const [rx, ry, , rh] = entry.rect;
                const isQuarterTurn = entry.rotations.length > 2;
                return (
                  <div
                    key={i}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', String(i));
                      setError(null);
                      setPicking(null);
                      setSelected(i);
                      setMoving(i);
                    }}
                    onDragEnd={() => setMoving((m) => (m === i ? null : m))}
                    onDragOver={(e) => {
                      if (moving === null) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                    }}
                    onDrop={onPieceClick}
                    onClick={onPieceClick}
                    style={{
                      position: 'absolute',
                      zIndex: RANK[entry.layer],
                      left: p.gx * 16,
                      top: (p.gy + fh) * 16 - rh,
                      width: fw * 16,
                      height: rh,
                      backgroundImage: `url(${entry.sheetUrl})`,
                      backgroundPosition: `-${rx}px -${ry}px`,
                      imageRendering: 'pixelated',
                      cursor: moving === i ? 'grabbing' : 'grab',
                      outline: i === selected ? '2px solid #facc15' : undefined,
                      outlineOffset: i === selected ? '-2px' : undefined,
                      transform: isQuarterTurn ? `rotate(${p.rotation}deg)` : p.rotation === 180 ? 'scaleX(-1)' : undefined,
                      transformOrigin: 'center center',
                    }}
                  />
                );
              })}

              {(shelfEntry ? [shelfEntry] : Array.from({ length: SHELF_SEGMENTS }, () => BOOKSHELF_THUMB)).map((sprite, s) => (
                <div
                  key={`shelf-${s}`}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', 'shelf');
                    setError(null);
                    setPicking(null);
                    setSelected('shelf');
                    setMoving('shelf');
                  }}
                  onDragEnd={() => setMoving((m) => (m === 'shelf' ? null : m))}
                  onDragOver={(e) => {
                    if (moving === null) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    onCellClick(layout.shelf.gx, layout.shelf.gy);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCellClick(layout.shelf.gx, layout.shelf.gy);
                  }}
                  style={{
                    position: 'absolute',
                    zIndex: 2,
                    left: (layout.shelf.gx + s * 2) * 16,
                    top: layout.shelf.gy * 16,
                    width: sprite.footprint[0] * 16,
                    height: sprite.footprint[1] * 16,
                    backgroundImage: `url(${sprite.sheetUrl})`,
                    backgroundPosition: `-${sprite.rect[0]}px -${sprite.rect[1]}px`,
                    imageRendering: 'pixelated',
                    cursor: moving === 'shelf' ? 'grabbing' : 'grab',
                    outline: shelfSelected ? '2px solid #facc15' : undefined,
                    outlineOffset: shelfSelected ? '-2px' : undefined,
                  }}
                />
              ))}
            </div>

            {error && <span className={`${styles.error} ${styles.under}`}>{error}</span>}
            {moving !== null && <span className={`${styles.note} ${styles.under}`}>Drag it, or click a cell to move it there.</span>}
          </div>

          <div className={styles.side}>
            {selectedPlacement && (
              <>
                <div className={styles.row}>
                  <span className={styles.small}>Selected: {nameOf(selectedPlacement.item)}</span>
                  <button className={styles.btn} onClick={rotateSelected}>
                    Rotate
                  </button>
                  <button
                    className={`${styles.btn} ${moving === selected ? styles.on : ''}`}
                    onClick={toggleMove}
                  >
                    {moving === selected ? 'Cancel move' : 'Move'}
                  </button>
                  <button className={styles.btn} onClick={removeSelected}>
                    {wallet.active ? 'Put away' : 'Remove'}
                  </button>
                </div>
                {swaps.length > 0 && (
                  <>
                    <span className={styles.small}>Swap for</span>
                    <div className={`${styles.shelf} ${styles.swaps}`}>
                      {swaps.map((entry) => (
                        <ShopTile
                          key={entry.id}
                          entry={entry}
                          owned={wallet.active ? owned(entry.id) : null}
                          balance={wallet.balance}
                          onClick={() => swapSelected(entry.id)}
                        />
                      ))}
                    </div>
                  </>
                )}
              </>
            )}

            {picking && (
              <div className={styles.catalogue}>
                <div className={styles.catalogueHead}>
                  <span>Catalogue</span>
                  <input
                    className={styles.search}
                    value={query}
                    placeholder="Search"
                    spellCheck={false}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setHovered(null);
                    }}
                    // Keep typed keys away from Phaser's window listeners.
                    onKeyDown={(e) => e.stopPropagation()}
                    onKeyUp={(e) => e.stopPropagation()}
                  />
                </div>
                <div className={styles.tabs}>
                  {[{ id: 'all' as const, label: 'All' }, ...CATALOG_GROUPS].map((g) => (
                    <button
                      key={g.id}
                      className={`${styles.tab} ${tab === g.id ? styles.tabOn : ''}`}
                      onClick={() => {
                        setTab(g.id);
                        setHovered(null);
                      }}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
                <div className={styles.shelf} data-tour="furniture">
                  {shown.map((entry) => (
                    <ShopTile
                      key={entry.id}
                      entry={entry}
                      owned={wallet.active ? owned(entry.id) : null}
                      balance={wallet.balance}
                      disabled={!spotFor(entry.id, picking.gx, picking.gy)}
                      onClick={() => placeItem(entry.id)}
                      onHover={setHovered}
                    />
                  ))}
                  {shown.length === 0 && <span className={styles.small}>Nothing called that.</span>}
                </div>
                <div className={styles.info}>
                  {hovered ? (
                    <>
                      <span>{hovered.name}</span>
                      <span style={{ color: TIER_COLOR[hovered.tier] }}>{hovered.tier}</span>
                    </>
                  ) : (
                    <span className={styles.small}>
                      {shown.length} pieces{wallet.active ? ' - place one you own, or buy it' : ''}
                    </span>
                  )}
                </div>
              </div>
            )}

            {shelfSelected && (
              <>
                <div className={styles.row}>
                  <span className={styles.small}>Selected: {shelfName}</span>
                  <button
                    className={`${styles.btn} ${moving === 'shelf' ? styles.on : ''}`}
                    onClick={toggleMove}
                  >
                    {moving === 'shelf' ? 'Cancel move' : 'Move'}
                  </button>
                </div>
                <span className={styles.small}>Keep this room&apos;s notes in</span>
                <div className={styles.row}>
                  {[undefined, ...NOTE_STORE_ITEMS].map((item) => (
                    <button
                      key={item ?? 'bookshelf'}
                      title={item ? nameOf(item) : 'Bookshelf'}
                      className={`${styles.tile} ${layout.shelf.item === item ? styles.tileOn : ''}`}
                      onClick={() => restyle(item)}
                    >
                      <Thumb entry={item ? CATALOG_BY_ID[item] : BOOKSHELF_THUMB} />
                    </button>
                  ))}
                </div>
              </>
            )}

            {!picking && !selectedPlacement && !shelfSelected && (
              <p className={styles.hint}>
                Click an empty tile to place furniture{wallet.active ? ' from your inventory, or buy something new' : ''}.
                Click a piece to move or rotate it{wallet.active ? ', or put it back in your inventory' : ''}.
              </p>
            )}
            {wallet.active && (
              <p className={styles.coinNote}>
                <Coin size={10} /> Every new note of {MIN_WORDS}+ words earns {NOTE_REWARD} coins.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
