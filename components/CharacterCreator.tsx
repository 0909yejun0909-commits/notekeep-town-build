'use client';

import { useEffect, useState } from 'react';
import styles from './CharacterCreator.module.css';
import pixel from './pixelUi.module.css';
import { CLOTH_COLORS, HAIR_COLORS, HAIR_STYLES } from '@/lib/characterCatalog';
import { loadAppearance, saveAppearance } from '@/lib/appearance';
import type { Appearance, ClothColor, HairColor } from '@/lib/types';
import Coin from './Coin';
import { unlockId } from '@/lib/wallet';
import { unlockAll, unlockCost, useWallet } from '@/lib/walletStore';

const HAIR_SWATCH: Record<HairColor, string> = {
  black: '#2b2320',
  blonde: '#e8c873',
  brown: '#6b4a30',
  ginger: '#b8622f',
  grey: '#a8a29a',
};

const CLOTH_SWATCH: Record<ClothColor, string> = {
  black: '#2b2b2b',
  blue: '#3a6ea5',
  brown: '#6b4a30',
  green: '#4c8c4a',
  orange: '#c97a2b',
  pink: '#d97fa8',
  purple: '#7a4fa0',
  red: '#a4402a',
};

type Row = { key: keyof Appearance; label: string; options: readonly (string | number)[] };

const ROWS: Row[] = [
  { key: 'hairStyle', label: 'Hair', options: HAIR_STYLES },
  { key: 'hairColor', label: '', options: HAIR_COLORS },
  { key: 'shirtColor', label: 'Shirt', options: CLOTH_COLORS },
  { key: 'pantsColor', label: 'Pants', options: CLOTH_COLORS },
  { key: 'shoesColor', label: 'Shoes', options: CLOTH_COLORS },
];
const DONE_ROW = ROWS.length;

// Where the character stands inside each 64px Kenmi frame (measured from the sheets' alpha):
// the whole body, and just the head for the hair-style slots.
const BODY: [number, number, number, number] = [22, 17, 20, 26];
const HEAD: [number, number, number, number] = [23, 17, 18, 18];

function Figure({ layers, crop: [x, y, w, h], scale, idle }: {
  layers: string[];
  crop: [number, number, number, number];
  scale: number;
  idle?: boolean;
}) {
  return (
    <div className={styles.crop} style={{ width: w * scale, height: h * scale }}>
      <div className={styles.frame} style={{ transform: `scale(${scale}) translate(${-x}px, ${-y}px)` }}>
        {layers.map((src) => (
          <div
            key={src}
            className={`${styles.layer} ${idle ? styles.idle : ''}`}
            style={{ backgroundImage: `url('${src}')` }}
          />
        ))}
      </div>
    </div>
  );
}

export default function CharacterCreator({ onDone }: { onDone: () => void }) {
  const [appearance, setAppearance] = useState<Appearance | null>(null);
  // What the hero wore when this opened: always free to keep.
  const [worn, setWorn] = useState<Appearance | null>(null);
  const [row, setRow] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const wallet = useWallet();

  useEffect(() => {
    const a = loadAppearance();
    setAppearance(a);
    setWorn(a);
  }, []);

  // Pieces beyond the starting outfit are bought once with coins, then free for good.
  function costOf(key: keyof Appearance, value: string | number): number {
    return worn && worn[key] === value ? 0 : unlockCost(wallet, unlockId(key, value));
  }
  function locked(a: Appearance): string[] {
    return ROWS.filter(({ key }) => costOf(key, a[key]) > 0).map(({ key }) => unlockId(key, a[key]));
  }
  function totalOf(a: Appearance): number {
    return ROWS.reduce((n, { key }) => n + costOf(key, a[key]), 0);
  }

  // Only a look you own is saved; one with pieces still to buy is a preview until Done.
  function update(patch: Partial<Appearance>) {
    const next = { ...appearance!, ...patch };
    if (!wallet.active && totalOf(next) > 0) {
      setNote('Unlock new looks with coins at the wardrobe, inside any house.');
      return;
    }
    setNote(null);
    if (totalOf(next) === 0) saveAppearance(next);
    setAppearance(next);
  }

  function finish() {
    const total = totalOf(appearance!);
    if (total > 0 && !unlockAll(locked(appearance!))) {
      setNote(`This look costs ${total} coins and you have ${wallet.balance}. Write notes to earn more!`);
      return;
    }
    if (total > 0) saveAppearance(appearance!);
    onDone();
  }

  useEffect(() => {
    if (!appearance) return;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      const left = k === 'ArrowLeft' || k === 'a' || k === 'A';
      const right = k === 'ArrowRight' || k === 'd' || k === 'D';
      if (k === 'ArrowUp' || k === 'w' || k === 'W') setRow((r) => (r + DONE_ROW) % (DONE_ROW + 1));
      else if (k === 'ArrowDown' || k === 's' || k === 'S') setRow((r) => (r + 1) % (DONE_ROW + 1));
      else if ((left || right) && row < DONE_ROW) {
        const { key, options } = ROWS[row];
        // Without coins to spend, step over pieces that would have to be bought.
        const open = wallet.active ? options : options.filter((o) => costOf(key, o) === 0);
        const i = open.indexOf(appearance[key]);
        update({ [key]: open[(i + (left ? -1 : 1) + open.length) % open.length] } as Partial<Appearance>);
      } else if (k === 'Enter' || k === ' ') {
        if (!e.repeat) finish();
      } else if (k === 'Escape') {
        if (!e.repeat) onDone();
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!appearance) return null;

  const hair = `/assets/character/hair/${appearance.hairStyle}_${appearance.hairColor}.png`;
  const shirt = `/assets/character/shirt/${appearance.shirtColor}.png`;
  const layers = [
    '/assets/character/base.png',
    `/assets/character/shoes/${appearance.shoesColor}.png`,
    `/assets/character/pants/${appearance.pantsColor}.png`,
    shirt,
    hair,
  ];

  const cursor = (i: number) => `${pixel.cursor} ${i === row ? '' : pixel.cursorIdle}`;

  return (
    <div className={`${pixel.parchment} ${styles.panel}`}>
      <h2 className={styles.heading}>Your hero</h2>
      <div className={styles.body}>
        <div className={styles.stage}>
          <Figure layers={layers} crop={BODY} scale={5} idle />
        </div>

        <div className={styles.rows}>
          {ROWS.map(({ key, label, options }, i) => (
            <div key={key} className={styles.row} onMouseEnter={() => setRow(i)}>
              <span className={cursor(i)} />
              <span className={styles.label}>{label}</span>
              <div className={styles.options}>
                {options.map((value) => {
                  const selected = appearance[key] === value;
                  const pick = () => update({ [key]: value } as Partial<Appearance>);
                  if (key === 'hairStyle') {
                    return (
                      <button
                        key={value}
                        className={`${styles.slot} ${selected ? styles.selected : ''}`}
                        aria-label={`Hair style ${value}`}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={pick}
                        title={costOf(key, value) ? `${costOf(key, value)} coins` : undefined}
                      >
                        {costOf(key, value) > 0 && <span className={styles.lock}><Coin size={12} /></span>}
                        <Figure
                          layers={[
                            '/assets/character/base.png',
                            shirt,
                            `/assets/character/hair/${value}_${appearance.hairColor}.png`,
                          ]}
                          crop={HEAD}
                          scale={2}
                        />
                      </button>
                    );
                  }
                  const color = key === 'hairColor' ? HAIR_SWATCH[value as HairColor] : CLOTH_SWATCH[value as ClothColor];
                  return (
                    <button
                      key={value}
                      className={`${styles.swatch} ${selected ? styles.selected : ''}`}
                      style={{ backgroundColor: color }}
                      title={costOf(key, value) ? `${value}: ${costOf(key, value)} coins` : String(value)}
                      aria-label={String(value)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={pick}
                    >
                      {costOf(key, value) > 0 && <Coin size={12} />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div className={styles.row} onMouseEnter={() => setRow(DONE_ROW)}>
            <span className={cursor(DONE_ROW)} />
            <button className={styles.done} onMouseDown={(e) => e.preventDefault()} onClick={finish}>
              {totalOf(appearance) > 0 ? 'Buy and done' : 'Done'}
            </button>
            {totalOf(appearance) > 0 && (
              <span className={styles.price}>
                <Coin size={14} />
                {totalOf(appearance)}
              </span>
            )}
          </div>
          {note && <p className={styles.note}>{note}</p>}
        </div>
      </div>
    </div>
  );
}
