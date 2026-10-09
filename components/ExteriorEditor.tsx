'use client';

import { useEffect, useState } from 'react';
import { bus } from '@/game/bus';
import Coin from './Coin';
import { unlockId } from '@/lib/wallet';
import { unlockAll, unlockCost, useWallet } from '@/lib/walletStore';
import styles from './ExteriorEditor.module.css';
import pixel from './pixelUi.module.css';
import { HOUSE_FOOTPRINT, HOUSE_VARIANTS, MATERIALS, ROOF_COLORS, availableWallColors, canPlaceHouseVariant } from '@/lib/houseCatalog';
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

const ROWS = ['shape', 'material', 'walls', 'roof', 'save', 'cancel'] as const;
const SAVE_ROW = ROWS.indexOf('save');

function cycle<T>(list: readonly T[], current: T, dir: number): T {
  return list[(list.indexOf(current) + dir + list.length) % list.length];
}

export default function ExteriorEditor() {
  const [session, setSession] = useState<Session | null>(null);
  const [variant, setVariant] = useState(0);
  const [material, setMaterial] = useState<MaterialId>('wood');
  const [wallColor, setWallColor] = useState<WallColor>('base');
  const [roofColor, setRoofColor] = useState<RoofColor>('black');
  const [error, setError] = useState<string | null>(null);
  const [row, setRow] = useState(0);
  const wallet = useWallet();

  useEffect(() => {
    const onOpen = (payload: Session) => {
      setSession(payload);
      setVariant(payload.currentVariant);
      setMaterial(payload.currentMaterial);
      setWallColor(payload.currentWallColor);
      setRoofColor(payload.currentRoofColor);
      setError(null);
      setRow(0);
    };
    bus.on('open-exterior-editor', onOpen);
    return () => bus.off('open-exterior-editor', onOpen);
  }, []);

  // Capture phase, following InteriorEditor's convention, so these keys beat Phaser's own
  // listeners. Keys work like the wardrobe's: Up/Down picks a row, Left/Right changes it.
  useEffect(() => {
    if (!session) return;
    function onKey(e: KeyboardEvent) {
      const k = e.key;
      const left = k === 'ArrowLeft' || k === 'a' || k === 'A';
      const right = k === 'ArrowRight' || k === 'd' || k === 'D';
      if (k === 'Escape') close();
      else if (k === 'ArrowUp' || k === 'w' || k === 'W') setRow((r) => (r + ROWS.length - 1) % ROWS.length);
      else if (k === 'ArrowDown' || k === 's' || k === 'S') setRow((r) => (r + 1) % ROWS.length);
      else if (left || right) change(ROWS[row], left ? -1 : 1);
      else if (k === 'Enter' || k === ' ') {
        if (!e.repeat) (ROWS[row] === 'cancel' ? close : save)();
      } else return;
      e.preventDefault();
      e.stopPropagation();
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

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
      setError("Doesn't fit here. Try a smaller building.");
      return;
    }
    setError(null);
    setVariant(next);
    if (!availableWallColors(material, next).includes(wallColor)) setWallColor('base');
  }

  // The next shape along that fits on this plot; shapes too big for it are stepped over.
  function stepVariant(dir: number) {
    if (!session) return;
    for (let i = 1; i < HOUSE_VARIANTS.length; i++) {
      const next = HOUSE_VARIANTS[(variant + dir * i + HOUSE_VARIANTS.length * i) % HOUSE_VARIANTS.length];
      if (canPlaceHouseVariant({ id: session.houseId, gx: session.gx, gy: session.gy }, next, session.siblingHouses)) {
        pickVariant(next);
        return;
      }
    }
    setError("No other shape fits here.");
  }

  function change(which: (typeof ROWS)[number], dir: number) {
    if (which === 'shape') stepVariant(dir);
    else if (which === 'material') pickMaterial(cycle(MATERIALS, material, dir));
    else if (which === 'walls') setWallColor(cycle(availableWallColors(material, variant), wallColor, dir));
    else if (which === 'roof') setRoofColor(cycle(ROOF_COLORS, roofColor, dir));
  }

  function pickMaterial(next: MaterialId) {
    if (next === material) return;
    setMaterial(next);
    if (!availableWallColors(next, variant).includes(wallColor)) setWallColor('base');
  }

  // Upgrades are bought once and then free on every house. Whatever this house already has is
  // free to keep.
  function costOf(kind: 'shape' | 'material' | 'wall' | 'roof', value: string | number): number {
    if (!session) return 0;
    const current = { shape: session.currentVariant, material: session.currentMaterial, wall: session.currentWallColor, roof: session.currentRoofColor }[kind];
    return value === current ? 0 : unlockCost(wallet, unlockId(kind, value));
  }

  function upgrades(): string[] {
    const picked: Array<['shape' | 'material' | 'wall' | 'roof', string | number]> = [
      ['shape', variant], ['material', material], ['wall', wallColor], ['roof', roofColor],
    ];
    return picked.filter(([k, v]) => costOf(k, v) > 0).map(([k, v]) => unlockId(k, v));
  }

  function save() {
    if (!session) return;
    const total = upgrades().reduce((n, id) => n + unlockCost(wallet, id), 0);
    if (total > 0 && !unlockAll(upgrades())) {
      setError(
        wallet.active
          ? `These upgrades cost ${total} coins and you have ${wallet.balance}. Write notes to earn more!`
          : 'Upgrades are bought with your own town\'s coins.',
      );
      return;
    }
    bus.emit('commit-exterior-variant', { houseId: session.houseId, variant, material, wallColor, roofColor });
    setSession(null);
    bus.emit('close-exterior-editor', undefined);
  }

  if (!session) return null;

  const previewSrc = assetPath(variant, material, wallColor, roofColor);
  const wallChoices = availableWallColors(material, variant);

  const [cols, rows] = HOUSE_FOOTPRINT[variant];
  const total = upgrades().reduce((n, id) => n + unlockCost(wallet, id), 0);
  const price = (n: number) =>
    n > 0 ? (
      <span className={styles.price}>
        <Coin size={14} />
        {n}
      </span>
    ) : null;
  const cursor = (i: number) => `${pixel.cursor} ${i === row ? '' : pixel.cursorIdle}`;
  const keep = (e: React.MouseEvent) => e.preventDefault();
  const arrows = (which: (typeof ROWS)[number], value: string) => (
    <div className={styles.options}>
      <button className={`${styles.arrow} ${styles.left}`} aria-label={`Previous ${which}`} onMouseDown={keep} onClick={() => change(which, -1)} />
      <span className={styles.value}>{value}</span>
      <button className={styles.arrow} aria-label={`Next ${which}`} onMouseDown={keep} onClick={() => change(which, 1)} />
      {price(which === 'shape' ? costOf('shape', variant) : costOf('material', material))}
    </div>
  );

  return (
    <div className={styles.screen} onClick={close}>
      <div className={`${pixel.parchment} ${styles.panel}`} data-tour="house-editor" data-panel="house-editor" onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.heading}>Your house</h2>
        {wallet.active && (
          <span className={styles.balance} title="Your coins">
            <Coin size={18} />
            {wallet.balance}
          </span>
        )}
        <div className={styles.body}>
          <div className={styles.stage}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={previewSrc}
              className={styles.house}
              src={previewSrc}
              alt={`Building style ${variant + 1}, ${material}, ${wallColor} walls, ${roofColor} roof`}
              style={{ width: `calc(var(--s) * ${cols * 16}px)`, height: `calc(var(--s) * ${rows * 16}px)` }}
            />
          </div>

          <div className={styles.rows}>
            <div className={styles.row} onMouseEnter={() => setRow(0)}>
              <span className={cursor(0)} />
              <span className={styles.label}>Shape</span>
              {arrows('shape', `${variant + 1} of ${HOUSE_VARIANTS.length}`)}
            </div>

            <div className={styles.row} onMouseEnter={() => setRow(1)}>
              <span className={cursor(1)} />
              <span className={styles.label}>Material</span>
              {arrows('material', MATERIAL_LABEL[material])}
            </div>

            <div className={styles.row} onMouseEnter={() => setRow(2)}>
              <span className={cursor(2)} />
              <span className={styles.label}>Walls</span>
              <div className={styles.options}>
                {wallChoices.map((c) => (
                  <button
                    key={c}
                    className={`${styles.swatch} ${c === wallColor ? styles.selected : ''}`}
                    style={{ backgroundColor: WALL_SWATCH[c] }}
                    title={costOf('wall', c) ? `${c}: ${costOf('wall', c)} coins` : c}
                    aria-label={`${c} walls`}
                    onMouseDown={keep}
                    onClick={() => setWallColor(c)}
                  >
                    {costOf('wall', c) > 0 && <Coin size={12} />}
                  </button>
                ))}
                {price(costOf('wall', wallColor))}
              </div>
            </div>

            <div className={styles.row} data-tour="house-roof" onMouseEnter={() => setRow(3)}>
              <span className={cursor(3)} />
              <span className={styles.label}>Roof</span>
              <div className={styles.options}>
                {ROOF_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`${styles.swatch} ${c === roofColor ? styles.selected : ''}`}
                    style={{ backgroundColor: ROOF_SWATCH[c] }}
                    title={costOf('roof', c) ? `${c}: ${costOf('roof', c)} coins` : c}
                    aria-label={`${c} roof`}
                    onMouseDown={keep}
                    onClick={() => setRoofColor(c)}
                  >
                    {costOf('roof', c) > 0 && <Coin size={12} />}
                  </button>
                ))}
                {price(costOf('roof', roofColor))}
              </div>
            </div>

            {(['save', 'cancel'] as const).map((which, j) => {
              const i = SAVE_ROW + j;
              return (
                <div key={which} className={styles.row} onMouseEnter={() => setRow(i)}>
                  <span className={cursor(i)} />
                  <button
                    className={`${styles.action} ${i === row ? styles.current : ''}`}
                    data-tour={which === 'save' ? 'house-save' : undefined}
                    onMouseDown={keep}
                    onClick={which === 'save' ? save : close}
                  >
                    {which === 'cancel' ? 'Cancel' : total > 0 ? 'Buy and save' : 'Save'}
                  </button>
                  {which === 'save' && price(total)}
                </div>
              );
            })}

            {error && <p className={styles.note}>{error}</p>}
          </div>
        </div>
      </div>
      <p className={styles.hint}>Up/Down picks a row, Left/Right changes it, Enter saves, Esc cancels</p>
    </div>
  );
}
