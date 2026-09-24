'use client';

import { useEffect, useState } from 'react';
import { bus } from '@/game/bus';
import { HOUSE_VARIANTS, canPlaceHouseVariant } from '@/lib/houseCatalog';

type Session = {
  houseId: string;
  currentVariant: number;
  siblingHouses: Array<{ id: string; gx: number; gy: number; variant: number }>;
  gx: number;
  gy: number;
};

export default function ExteriorEditor() {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onOpen = (payload: Session) => {
      setSession(payload);
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

  function pick(variant: number) {
    if (!session) return;
    if (variant === session.currentVariant) {
      close();
      return;
    }
    const fits = canPlaceHouseVariant(
      { id: session.houseId, gx: session.gx, gy: session.gy },
      variant,
      session.siblingHouses,
    );
    if (!fits) {
      setError("Doesn't fit here — try a smaller building.");
      return;
    }
    bus.emit('commit-exterior-variant', { houseId: session.houseId, variant });
    setSession(null);
    bus.emit('close-exterior-editor', undefined);
  }

  if (!session) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70" onClick={close}>
      <div
        className="flex flex-col gap-3 rounded bg-neutral-900 p-4 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm uppercase tracking-wide text-neutral-300">Customize exterior</span>
          <button className="rounded border border-white px-3 py-1 text-sm" onClick={close}>
            Cancel
          </button>
        </div>

        <div className="flex gap-3">
          {HOUSE_VARIANTS.map((variant) => (
            <button
              key={variant}
              className={`rounded border p-1 ${
                variant === session.currentVariant ? 'border-yellow-400' : 'border-neutral-600'
              }`}
              onClick={() => pick(variant)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/assets/buildings/house_${variant}.png`}
                alt={`Building style ${variant}`}
                style={{ imageRendering: 'pixelated', maxWidth: 96, maxHeight: 96 }}
              />
            </button>
          ))}
        </div>

        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    </div>
  );
}
