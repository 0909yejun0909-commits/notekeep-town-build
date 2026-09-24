'use client';

import { useEffect, useState } from 'react';
import { bus } from '@/game/bus';
import { HOUSE_VARIANTS, MATERIALS, ROOF_COLORS, availableWallColors, canPlaceHouseVariant } from '@/lib/houseCatalog';
import type { MaterialId, RoofColor, WallColor } from '@/lib/types';

function assetPath(variant: number, material: MaterialId, wallColor: WallColor, roofColor: RoofColor): string {
  return `/assets/buildings/house_${variant}_${material}_${wallColor}_${roofColor}.png`;
}

const MATERIAL_LABEL: Record<MaterialId, string> = { wood: 'Wood', stone: 'Stone', limestone: 'Limestone' };

type Session = {
  houseId: string;
  currentVariant: number;
  currentMaterial: MaterialId;
  currentWallColor: WallColor;
  currentRoofColor: RoofColor;
  siblingHouses: Array<{ id: string; gx: number; gy: number; variant: number }>;
  gx: number;
  gy: number;
};

// Approximate swatch colors for the wall/roof color rows — the live thumbnail preview below
// (built from the real installed sprite for the current shape+material+wallColor+roofColor) is
// the authoritative preview; these chips are just quick-pick affordances, so each also carries
// a text label (title attribute) rather than relying on the color alone.
const WALL_SWATCH: Record<WallColor, string> = { base: '#c9924f', green: '#4c8c4a', red: '#a4402a' };
const ROOF_SWATCH: Record<RoofColor, string> = { black: '#2b2b2b', blue: '#3a6ea5', red: '#8a2f22' };

export default function ExteriorEditor() {
  const [session, setSession] = useState<Session | null>(null);
  const [variant, setVariant] = useState(0);
  const [material, setMaterial] = useState<MaterialId>('wood');
  const [wallColor, setWallColor] = useState<WallColor>('base');
  const [roofColor, setRoofColor] = useState<RoofColor>('black');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onOpen = (payload: Session) => {
      setSession(payload);
      setVariant(payload.currentVariant);
      setMaterial(payload.currentMaterial);
      setWallColor(payload.currentWallColor);
      setRoofColor(payload.currentRoofColor);
      setError(null);
    };
    bus.on('open-exterior-editor', onOpen);
    return () => bus.off('open-exterior-editor', onOpen);
  }, []);

  // Capture phase, following InteriorEditor's convention, so Escape beats Phaser's own listeners.
  useEffect(() => {
    if (!session) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [session]);

  function close() {
    setSession(null);
    bus.emit('close-exterior-editor', undefined);
  }

  // Not every material+shape combo ships every wall color (Limestone is one look per shape;
  // Stone's shape index 3 is base-only) — 'base' is always available everywhere, so any pick
  // that would leave the current wall color unavailable falls back to it instead of blocking.
  function pickVariant(next: number) {
    if (!session) return;
    if (next === variant) return;
    const fits = canPlaceHouseVariant({ id: session.houseId, gx: session.gx, gy: session.gy }, next, session.siblingHouses);
    if (!fits) {
      setError("Doesn't fit here — try a smaller building.");
      return;
    }
    setError(null);
    setVariant(next);
    if (!availableWallColors(material, next).includes(wallColor)) setWallColor('base');
  }

  function pickMaterial(next: MaterialId) {
    if (next === material) return;
    setMaterial(next);
    if (!availableWallColors(next, variant).includes(wallColor)) setWallColor('base');
  }

  function save() {
    if (!session) return;
    bus.emit('commit-exterior-variant', { houseId: session.houseId, variant, material, wallColor, roofColor });
    setSession(null);
    bus.emit('close-exterior-editor', undefined);
  }

  if (!session) return null;

  const previewSrc = assetPath(variant, material, wallColor, roofColor);
  const wallChoices = availableWallColors(material, variant);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70" onClick={close}>
      <div
        className="flex flex-col gap-3 rounded bg-neutral-900 p-4 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm uppercase tracking-wide text-neutral-300">Customize exterior</span>
          <div className="flex gap-2">
            <button className="rounded border border-white px-3 py-1 text-sm" onClick={close}>
              Cancel
            </button>
            <button className="rounded bg-white px-3 py-1 text-sm text-black" onClick={save}>
              Save
            </button>
          </div>
        </div>

        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={previewSrc}
            src={previewSrc}
            alt={`Building style ${variant}, ${material}, ${wallColor} walls, ${roofColor} roof`}
            style={{ imageRendering: 'pixelated', maxWidth: 160, maxHeight: 160 }}
          />
        </div>

        <div className="flex gap-2">
          <span className="w-16 shrink-0 text-xs uppercase text-neutral-400">Shape</span>
          <div className="flex gap-2">
            {HOUSE_VARIANTS.map((v) => (
              <button
                key={v}
                className={`rounded border p-1 ${v === variant ? 'border-yellow-400' : 'border-neutral-600'}`}
                onClick={() => pickVariant(v)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={assetPath(v, material, wallColor, roofColor)}
                  alt={`Building style ${v}`}
                  style={{ imageRendering: 'pixelated', maxWidth: 56, maxHeight: 56 }}
                />
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <span className="w-16 shrink-0 text-xs uppercase text-neutral-400">Material</span>
          <div className="flex gap-2">
            {MATERIALS.map((m) => (
              <button
                key={m}
                className={`rounded border px-2 py-1 text-xs capitalize ${
                  m === material ? 'border-yellow-400 text-yellow-400' : 'border-neutral-600'
                }`}
                onClick={() => pickMaterial(m)}
              >
                {MATERIAL_LABEL[m]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <span className="w-16 shrink-0 text-xs uppercase text-neutral-400">Walls</span>
          <div className="flex gap-2">
            {wallChoices.map((c) => (
              <button
                key={c}
                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${
                  c === wallColor ? 'border-yellow-400' : 'border-neutral-600'
                }`}
                style={{ backgroundColor: WALL_SWATCH[c] }}
                title={c}
                onClick={() => setWallColor(c)}
              />
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <span className="w-16 shrink-0 text-xs uppercase text-neutral-400">Roof</span>
          <div className="flex gap-2">
            {ROOF_COLORS.map((c) => (
              <button
                key={c}
                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${
                  c === roofColor ? 'border-yellow-400' : 'border-neutral-600'
                }`}
                style={{ backgroundColor: ROOF_SWATCH[c] }}
                title={c}
                onClick={() => setRoofColor(c)}
              />
            ))}
          </div>
        </div>

        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    </div>
  );
}
