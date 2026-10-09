'use client';

import { useEffect, useState } from 'react';
import styles from './CharacterCreator.module.css';
import pixel from './pixelUi.module.css';
import { CLOTH_COLORS, HAIR_COLORS, HAIR_STYLES } from '@/lib/characterCatalog';
import { loadAppearance, saveAppearance } from '@/lib/appearance';
import type { Appearance, ClothColor, HairColor } from '@/lib/types';
import { SKINS, PETS, SKIN_CLASS_LABEL } from '@/lib/rewards';
import { outfitLayerUrls } from '@/lib/outfitLayers';
import { achievementFor } from '@/lib/achievements';
import { equip, getEquipped, isUnlocked, type Equipped } from '@/lib/achievementStore';
import { useAchievements } from '@/lib/useAchievements';

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
type RewardKind = 'skin' | 'pet';
const REWARD_ROWS: { kind: RewardKind; label: string }[] = [
  { kind: 'skin', label: 'Outfit' },
  { kind: 'pet', label: 'Pet' },
];

function Portrait({ src, scale }: { src: string; scale: number }) {
  return (
    <div style={{ width: 16 * scale, height: 16 * scale }}>
      <div className={styles.portrait} style={{ backgroundImage: `url('${src}')`, transform: `scale(${scale})` }} />
    </div>
  );
}

// Where the character stands inside each 64px Kenmi frame (measured from the sheets' alpha):
// the whole body, and just the head for the hair-style slots.
const BODY: [number, number, number, number] = [22, 17, 20, 26];
const HEAD: [number, number, number, number] = [23, 17, 18, 18];
// Outfits reach higher than the default head: a wizard hat's tip is at y=12. Slot thumbnails stop at the chest.
const OUTFIT_BODY: [number, number, number, number] = [22, 10, 20, 33];
const OUTFIT_SLOT: [number, number, number, number] = [22, 10, 20, 24];

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

export default function CharacterCreator({ onDone, rewards = false }: { onDone: () => void; rewards?: boolean }) {
  const [appearance, setAppearance] = useState<Appearance | null>(null);
  const [row, setRow] = useState(0);
  const [equipped, setEquipped] = useState<Equipped>({ skin: null, pet: null });
  const [lockHint, setLockHint] = useState<string | null>(null);
  useAchievements();
  const rewardRows = rewards ? REWARD_ROWS : [];
  const doneRow = ROWS.length + rewardRows.length;

  useEffect(() => {
    setEquipped(getEquipped());
  }, []);

  function choose(kind: RewardKind, id: string | null) {
    if (id !== null && !isUnlocked(kind, id)) {
      const a = achievementFor(kind, id);
      setLockHint(a ? (a.secret ? 'Unlocked by a secret achievement.' : `Locked. ${a.name}: ${a.description}`) : 'Locked.');
      return;
    }
    setLockHint(null);
    equip({ [kind]: id } as Partial<Equipped>);
    setEquipped(getEquipped());
  }

  function cycle(kind: RewardKind, dir: 1 | -1) {
    const ids = [null, ...(kind === 'skin' ? SKINS : PETS).map((e) => e.id).filter((id) => isUnlocked(kind, id))];
    const i = ids.indexOf(equipped[kind] as never);
    choose(kind, ids[(i + dir + ids.length) % ids.length] as string | null);
  }

  useEffect(() => {
    setAppearance(loadAppearance());
  }, []);

  function update(patch: Partial<Appearance>) {
    const next = { ...appearance!, ...patch };
    saveAppearance(next);
    setAppearance(next);
  }

  useEffect(() => {
    if (!appearance) return;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      const left = k === 'ArrowLeft' || k === 'a' || k === 'A';
      const right = k === 'ArrowRight' || k === 'd' || k === 'D';
      if (k === 'ArrowUp' || k === 'w' || k === 'W') setRow((r) => (r + doneRow) % (doneRow + 1));
      else if (k === 'ArrowDown' || k === 's' || k === 'S') setRow((r) => (r + 1) % (doneRow + 1));
      else if ((left || right) && row < ROWS.length) {
        const { key, options } = ROWS[row];
        const i = options.indexOf(appearance[key]);
        update({ [key]: options[(i + (left ? -1 : 1) + options.length) % options.length] } as Partial<Appearance>);
      } else if ((left || right) && row < doneRow) {
        cycle(rewardRows[row - ROWS.length].kind, left ? -1 : 1);
      } else if (k === 'Enter' || k === ' ' || k === 'Escape') {
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
          <Figure
            layers={equipped.skin ? ['/assets/character/base.png', ...outfitLayerUrls(equipped.skin, appearance)] : layers}
            crop={equipped.skin ? OUTFIT_BODY : BODY}
            scale={5}
            idle
          />
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
                      >
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
                      title={String(value)}
                      aria-label={String(value)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={pick}
                    />
                  );
                })}
              </div>
            </div>
          ))}

          {rewardRows.map(({ kind, label }, i) => {
            const index = ROWS.length + i;
            const entries = kind === 'skin' ? SKINS : PETS;
            return (
              <div key={kind} className={styles.row} onMouseEnter={() => setRow(index)}>
                <span className={cursor(index)} />
                <span className={styles.label}>{label}</span>
                <div className={`${styles.options} ${styles.rewardOptions}`}>
                  <button
                    className={`${styles.slot} ${styles.none} ${equipped[kind] === null ? styles.selected : ''}`}
                    aria-label={`No ${label.toLowerCase()}`}
                    title="None"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(kind, null)}
                  >
                    -
                  </button>
                  {entries.map((e) => {
                    const open = isUnlocked(kind, e.id);
                    const title = 'cls' in e ? `${SKIN_CLASS_LABEL[e.cls]}: ${e.name}` : e.name;
                    return (
                      <button
                        key={e.id}
                        className={`${styles.slot} ${equipped[kind] === e.id ? styles.selected : ''} ${open ? '' : styles.locked}`}
                        aria-label={open ? title : `${title} (locked)`}
                        title={open ? title : `${title} (locked)`}
                        onMouseDown={(ev) => ev.preventDefault()}
                        onClick={() => choose(kind, e.id)}
                      >
                        {'layers' in e ? (
                          <Figure layers={['/assets/character/base.png', ...outfitLayerUrls(e.id, appearance)]} crop={OUTFIT_SLOT} scale={2} />
                        ) : (
                          <Portrait src={`/assets/pets/${e.id}.png`} scale={2} />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {lockHint && <p className={styles.lockHint}>{lockHint}</p>}

          <div className={styles.row} onMouseEnter={() => setRow(doneRow)}>
            <span className={cursor(doneRow)} />
            <button className={styles.done} onMouseDown={(e) => e.preventDefault()} onClick={onDone}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
