'use client';

import { useEffect, useState } from 'react';
import styles from './CharacterCreator.module.css';
import { CLOTH_COLORS, HAIR_COLORS, HAIR_STYLES } from '@/lib/characterCatalog';
import { loadAppearance, saveAppearance } from '@/lib/appearance';
import type { Appearance, ClothColor, HairColor } from '@/lib/types';

// Frame 0 of every 64px-grid sheet is the first idle-down frame, so background-position 0 0
// shows the character standing still — used both for the big preview and the small thumbnails.
function layerStyle(src: string) {
  return { backgroundImage: `url('${src}')` };
}

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

function Swatch<T extends string>({
  value,
  current,
  colorOf,
  onPick,
}: {
  value: T;
  current: T;
  colorOf: Record<T, string>;
  onPick: (v: T) => void;
}) {
  return (
    <button
      className={`h-7 w-7 shrink-0 rounded-full border-2 ${
        value === current ? 'border-yellow-400' : 'border-neutral-600'
      }`}
      style={{ backgroundColor: colorOf[value] }}
      title={value}
      aria-label={value}
      onClick={() => onPick(value)}
    />
  );
}

export default function CharacterCreator({ visible }: { visible: boolean }) {
  const [appearance, setAppearance] = useState<Appearance | null>(null);

  useEffect(() => {
    setAppearance(loadAppearance());
  }, []);

  if (!visible || !appearance) return null;

  function update(next: Partial<Appearance>) {
    setAppearance((prev) => {
      const merged = { ...prev!, ...next };
      saveAppearance(merged);
      return merged;
    });
  }

  const layers = [
    `/assets/character/base.png`,
    `/assets/character/shoes/${appearance.shoesColor}.png`,
    `/assets/character/pants/${appearance.pantsColor}.png`,
    `/assets/character/shirt/${appearance.shirtColor}.png`,
    `/assets/character/hair/${appearance.hairStyle}_${appearance.hairColor}.png`,
  ];

  return (
    <div className={styles.wrapper}>
      <div className={styles.panel}>
        <div className={styles.preview}>
          {layers.map((src) => (
            <div key={src} className={styles.layer} style={layerStyle(src)} />
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-xs uppercase text-neutral-400">Hair</span>
            <div className="flex gap-1.5">
              {HAIR_STYLES.map((style) => (
                <button
                  key={style}
                  className={`rounded border p-0.5 ${
                    style === appearance.hairStyle ? 'border-yellow-400' : 'border-neutral-600'
                  }`}
                  onClick={() => update({ hairStyle: style })}
                >
                  <div className={styles.thumb}>
                    <div
                      className={styles.thumbSheet}
                      style={layerStyle(`/assets/character/hair/${style}_${appearance.hairColor}.png`)}
                    />
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-xs uppercase text-neutral-400" />
            <div className="flex gap-1.5">
              {HAIR_COLORS.map((color) => (
                <Swatch
                  key={color}
                  value={color}
                  current={appearance.hairColor}
                  colorOf={HAIR_SWATCH}
                  onPick={(hairColor) => update({ hairColor })}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-xs uppercase text-neutral-400">Shirt</span>
            <div className="flex gap-1.5">
              {CLOTH_COLORS.map((color) => (
                <Swatch
                  key={color}
                  value={color}
                  current={appearance.shirtColor}
                  colorOf={CLOTH_SWATCH}
                  onPick={(shirtColor) => update({ shirtColor })}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-xs uppercase text-neutral-400">Pants</span>
            <div className="flex gap-1.5">
              {CLOTH_COLORS.map((color) => (
                <Swatch
                  key={color}
                  value={color}
                  current={appearance.pantsColor}
                  colorOf={CLOTH_SWATCH}
                  onPick={(pantsColor) => update({ pantsColor })}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-xs uppercase text-neutral-400">Shoes</span>
            <div className="flex gap-1.5">
              {CLOTH_COLORS.map((color) => (
                <Swatch
                  key={color}
                  value={color}
                  current={appearance.shoesColor}
                  colorOf={CLOTH_SWATCH}
                  onPick={(shoesColor) => update({ shoesColor })}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
