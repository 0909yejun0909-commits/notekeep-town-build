'use client';

import { useEffect, useRef, useState } from 'react';
import { FONT_STYLES, setFontStyle, setViewMode, useFontStyle } from '@/lib/displayPrefs';
import { useTutorialStep } from '@/lib/tutorial';
import styles from './ViewSwitch.module.css';

// "Aa": how pixelated the text is, from all pixel letters to plain smooth type.
export function FontMenu({ variant }: { variant: 'hud' | 'plain' }) {
  const font = useFontStyle();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
    };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', esc, true);
    return () => {
      window.removeEventListener('pointerdown', away, true);
      window.removeEventListener('keydown', esc, true);
    };
  }, [open]);

  return (
    <div ref={box} className={`${styles.fontBox} ${styles[variant]}`}>
      <button className={styles.aa} data-tour="font" title="Text style: pixel or smooth" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Aa
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          <div className={styles.menuHead}>Text style</div>
          {FONT_STYLES.map((f) => (
            <button
              key={f.id}
              role="menuitemradio"
              aria-checked={font === f.id}
              className={`${styles.item} ${font === f.id ? styles.on : ''}`}
              onClick={() => setFontStyle(f.id)}
            >
              <span className={styles[`sample_${f.id}`]}>{f.label}</span>
              <span className={styles.hint}>{f.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// On the town's top bar: the plain notebook view, and the text style.
export default function ViewSwitch() {
  const step = useTutorialStep();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const toNotebook = async () => {
    setBusy(true);
    const ok = await setViewMode('notebook');
    setBusy(false);
    setFailed(!ok);
  };

  return (
    <>
      {step === null && (
        <button
          className={styles.notebook}
          data-tour="view-notebook"
          disabled={busy}
          title={failed ? "Couldn't save the open note, so the town stays. Try again." : 'Switch to a plain notebook: your notes without the town. Nothing is lost.'}
          onClick={() => void toNotebook()}
        >
          {failed ? 'Retry' : 'Notebook'}
        </button>
      )}
      <FontMenu variant="hud" />
    </>
  );
}
