'use client';

import { useEffect, useState } from 'react';
import { bus } from '@/game/bus';
import { CATALOG, CATALOG_BY_ID } from '@/lib/catalog';
import { canPlace, canPlaceShelf, structuralOccupied, shelfOccupied, SHELF_W, SHELF_SEGMENTS, FLOOR_FRAMES, WALL_TRIPLES } from '@/lib/interiorLayout';
import type { CatalogItemId, FurniturePlacement, InteriorLayout } from '@/lib/types';

// Matches game/scenes/BootScene.ts's FURNITURE_RECT.shelf exactly — the shelf
// isn't a CatalogEntry (it's structural, not a placeable catalog item), so its
// sprite data is duplicated here the same way furniture sprite data is.
const SHELF_SHEET_URL = '/assets/furniture/bookshelves.png';
const SHELF_RECT: [number, number, number, number] = [16, 0, 32, 32];

type Session = { houseId: string; w: number; h: number; doorGx: number; doorGy: number };
// A selection/move target is either one furniture placement (its index) or
// the shelf, which isn't part of `placements` — it's always present, always
// the same style, only its position is editable.
type Target = number | 'shelf';

export default function InteriorEditor() {
  const [session, setSession] = useState<Session | null>(null);
  const [draft, setDraft] = useState<InteriorLayout | null>(null);
  const [selected, setSelected] = useState<Target | null>(null);
  const [picking, setPicking] = useState<{ gx: number; gy: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moving, setMoving] = useState<Target | null>(null);

  useEffect(() => {
    const onOpen = (payload: Session & { layout: InteriorLayout }) => {
      const { layout, ...s } = payload;
      setSession(s);
      setDraft(layout);
      setSelected(null);
      setPicking(null);
      setError(null);
      setMoving(null);
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
        if (moving !== null) {
          setMoving(null);
          return;
        }
        close();
      }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [session, moving]);

  function close() {
    setSession(null);
    setDraft(null);
    bus.emit('close-interior-editor', undefined);
  }

  function save() {
    if (!session || !draft) return;
    bus.emit('commit-interior-layout', { houseId: session.houseId, layout: draft });
    setSession(null);
    setDraft(null);
    bus.emit('close-interior-editor', undefined);
  }

  if (!session || !draft) return null;

  const { w, h, doorGx } = session;
  // A fresh non-null binding: nested function declarations below close over `draft`
  // without narrowing (TS doesn't carry the early-return null check across function
  // boundaries), so they read this instead.
  const layout = draft;

  // Perimeter + door lane only — does NOT include the shelf's own footprint,
  // since the shelf can move now. This is what marks a grid cell permanently
  // unusable (disabled button); the shelf blocks furniture too, but that's
  // handled by unioning in `shelfOccupied()` only where furniture placement
  // is actually validated, not by disabling the underlying cell everywhere.
  const structural = structuralOccupied(w, h, doorGx);
  const structuralWithShelf = new Set(structural);
  for (const cell of shelfOccupied(layout.shelf.gx, layout.shelf.gy)) structuralWithShelf.add(cell);

  function cellPlacementIndex(gx: number, gy: number): number | null {
    for (let i = 0; i < layout.placements.length; i++) {
      const p = layout.placements[i];
      const entry = CATALOG_BY_ID[p.item];
      if (!entry) continue;
      const [fw, fh] = entry.footprint;
      if (gx >= p.gx && gx < p.gx + fw && gy >= p.gy && gy < p.gy + fh) return i;
    }
    return null;
  }

  function isShelfCell(gx: number, gy: number): boolean {
    const { gx: sx, gy: sy } = layout.shelf;
    return gx >= sx && gx < sx + SHELF_W && gy >= sy && gy < sy + 2;
  }

  function onCellClick(gx: number, gy: number) {
    setError(null);
    if (structural.has(`${gx},${gy}`)) return;
    const idx = cellPlacementIndex(gx, gy);
    const onShelf = isShelfCell(gx, gy);

    if (moving !== null) {
      if (idx !== null || onShelf) {
        // Clicking any occupied cell (furniture, the shelf, or the moving
        // piece's own current spot) cancels the pending move and selects
        // whatever was clicked — more forgiving than silently ignoring it.
        setMoving(null);
        setSelected(onShelf ? 'shelf' : idx);
        setPicking(null);
        return;
      }
      if (!draft) return;
      if (moving === 'shelf') {
        if (!canPlaceShelf(draft, CATALOG_BY_ID, structural, w, h, gx, gy)) {
          setError("Doesn't fit there.");
          return;
        }
        setDraft({ ...draft, shelf: { gx, gy } });
        setSelected('shelf');
        setMoving(null);
        return;
      }
      const p = draft.placements[moving];
      if (!canPlace(draft, CATALOG_BY_ID, structuralWithShelf, w, h, p.item, gx, gy, moving)) {
        setError("Doesn't fit there.");
        return;
      }
      const placements = draft.placements.slice();
      placements[moving] = { ...p, gx, gy };
      setDraft({ ...draft, placements });
      setSelected(moving);
      setMoving(null);
      return;
    }

    if (onShelf) {
      setSelected('shelf');
      setPicking(null);
    } else if (idx !== null) {
      setSelected(idx);
      setPicking(null);
    } else {
      setSelected(null);
      setPicking({ gx, gy });
    }
  }

  function placeItem(item: CatalogItemId) {
    if (!picking || !draft) return;
    if (!canPlace(draft, CATALOG_BY_ID, structuralWithShelf, w, h, item, picking.gx, picking.gy)) {
      setError("Doesn't fit there.");
      return;
    }
    const placement: FurniturePlacement = { item, gx: picking.gx, gy: picking.gy, rotation: 0 };
    setDraft({ ...draft, placements: [...draft.placements, placement] });
    setPicking(null);
  }

  function toggleMove() {
    if (selected === null) return;
    setError(null);
    setMoving((prev) => (prev === selected ? null : selected));
  }

  function removeSelected() {
    if (selected === null || selected === 'shelf' || !draft) return;
    setDraft({ ...draft, placements: draft.placements.filter((_, i) => i !== selected) });
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
    const placements = draft.placements.slice();
    placements[selected] = { ...placements[selected], item, rotation: 0 };
    setDraft({ ...draft, placements });
  }

  const selectedPlacement = typeof selected === 'number' ? draft.placements[selected] : null;
  const selectedCategory = selectedPlacement ? CATALOG_BY_ID[selectedPlacement.item]?.category : null;
  const shelfSelected = selected === 'shelf';

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={close}
    >
      <div
        className="flex max-h-[90vh] flex-col gap-3 rounded bg-neutral-900 p-4 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm uppercase tracking-wide text-neutral-300">Customize interior</span>
          <div className="flex gap-2">
            <button className="rounded border border-white px-3 py-1 text-sm" onClick={close}>
              Cancel
            </button>
            <button className="rounded bg-white px-3 py-1 text-sm text-black" onClick={save}>
              Save
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <span className="text-xs uppercase text-neutral-400">Floor</span>
          {FLOOR_FRAMES.map((frame, i) => (
            <button
              key={frame}
              className={`h-6 w-6 border ${draft.floorFrame === i ? 'border-yellow-400' : 'border-neutral-600'}`}
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
        <div className="flex gap-2">
          <span className="text-xs uppercase text-neutral-400">Wallpaper</span>
          {WALL_TRIPLES.map((triple, i) => (
            <button
              key={i}
              className={`h-6 w-6 border ${draft.wallTriple === i ? 'border-yellow-400' : 'border-neutral-600'}`}
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

        <div
          className="relative grid border border-neutral-700"
          style={{ gridTemplateColumns: `repeat(${w}, 16px)`, gridTemplateRows: `repeat(${h}, 16px)` }}
        >
          {Array.from({ length: h }).map((_, gy) =>
            Array.from({ length: w }).map((_, gx) => {
              const idx = cellPlacementIndex(gx, gy);
              const onShelf = isShelfCell(gx, gy);
              const isStructural = structural.has(`${gx},${gy}`);
              const isDoor = gx === doorGx && gy === session.doorGy;
              return (
                <button
                  key={`${gx},${gy}`}
                  className="border border-neutral-800 text-[8px]"
                  style={{
                    background: isDoor
                      ? '#8a5a2a'
                      : isStructural
                        ? '#333'
                        : idx !== null || onShelf
                          ? '#5a7a5a'
                          : '#1a1a1a',
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
                  title={idx !== null ? draft.placements[idx].item : onShelf ? 'shelf' : ''}
                />
              );
            }),
          )}

          {draft.placements.map((p, i) => {
            const entry = CATALOG_BY_ID[p.item];
            if (!entry) return null;
            const [fw, fh] = entry.footprint;
            const [rx, ry] = entry.rect;
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
                onDrop={(e) => {
                  e.preventDefault();
                  onCellClick(p.gx, p.gy);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onCellClick(p.gx, p.gy);
                }}
                style={{
                  position: 'absolute',
                  left: p.gx * 16,
                  top: p.gy * 16,
                  width: fw * 16,
                  height: fh * 16,
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

          {Array.from({ length: SHELF_SEGMENTS }).map((_, s) => (
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
                left: (layout.shelf.gx + s * 2) * 16,
                top: layout.shelf.gy * 16,
                width: 32,
                height: 32,
                backgroundImage: `url(${SHELF_SHEET_URL})`,
                backgroundPosition: `-${SHELF_RECT[0]}px -${SHELF_RECT[1]}px`,
                imageRendering: 'pixelated',
                cursor: moving === 'shelf' ? 'grabbing' : 'grab',
                outline: shelfSelected ? '2px solid #facc15' : undefined,
                outlineOffset: shelfSelected ? '-2px' : undefined,
              }}
            />
          ))}
        </div>

        {error && <span className="text-xs text-red-400">{error}</span>}
        {moving !== null && <span className="text-xs text-yellow-400">Drag it, or click a cell to move it there.</span>}

        {picking && (
          <div className="flex flex-wrap gap-2">
            <span className="text-xs uppercase text-neutral-400">Place:</span>
            {CATALOG.map((entry) => (
              <button
                key={entry.id}
                className="rounded border border-neutral-600 px-2 py-1 text-xs"
                onClick={() => placeItem(entry.id)}
              >
                {entry.id}
              </button>
            ))}
          </div>
        )}

        {selectedPlacement && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase text-neutral-400">Selected: {selectedPlacement.item}</span>
            <button className="rounded border border-neutral-600 px-2 py-1 text-xs" onClick={rotateSelected}>
              Rotate
            </button>
            <button
              className={`rounded border px-2 py-1 text-xs ${moving === selected ? 'border-yellow-400 text-yellow-400' : 'border-neutral-600'}`}
              onClick={toggleMove}
            >
              {moving === selected ? 'Cancel move' : 'Move'}
            </button>
            <button className="rounded border border-neutral-600 px-2 py-1 text-xs" onClick={removeSelected}>
              Remove
            </button>
            {CATALOG.filter((e) => e.category === selectedCategory && e.id !== selectedPlacement.item).map((e) => (
              <button
                key={e.id}
                className="rounded border border-neutral-600 px-2 py-1 text-xs"
                onClick={() => swapSelected(e.id)}
              >
                {e.id}
              </button>
            ))}
          </div>
        )}

        {shelfSelected && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase text-neutral-400">Selected: shelf</span>
            <button
              className={`rounded border px-2 py-1 text-xs ${moving === 'shelf' ? 'border-yellow-400 text-yellow-400' : 'border-neutral-600'}`}
              onClick={toggleMove}
            >
              {moving === 'shelf' ? 'Cancel move' : 'Move'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
