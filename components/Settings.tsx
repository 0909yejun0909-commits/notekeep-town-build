'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getVolume, isMuted, setVolume, subscribeMute, toggleMute } from '@/game/audio/engine';
import { FONT_STYLES, setFontStyle, setViewMode, useFontStyle } from '@/lib/displayPrefs';
import { useNotebook } from './NotebookMode';
import styles from './Settings.module.css';

// 9x9 pixel gear.
const GEAR = ['...O.O...', '..OOOOO..', '.OOO.OOO.', 'OOO...OOO', '.O.....O.', 'OOO...OOO', '.OOO.OOO.', '..OOOOO..', '...O.O...'];
const STEP = 0.05;

// The gear in the bottom right: sound, the text style and the notebook view, in one panel.
// The same gear sits over the notebook view, drawn to match it.
export default function Settings() {
  const muted = useSyncExternalStore(subscribeMute, isMuted, () => false);
  const volume = useSyncExternalStore(subscribeMute, getVolume, () => 1);
  const font = useFontStyle();
  const notebook = useNotebook();
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [failed, setFailed] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const pct = Math.round(volume * 100);

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

  const setFrom = (clientX: number) => {
    const r = track.current?.getBoundingClientRect();
    if (r) setVolume(Math.round((clientX - r.left) / r.width / STEP) * STEP);
  };

  const flipNotebook = async () => {
    if (!notebook.available || switching) return;
    setSwitching(true);
    const ok = await setViewMode(notebook.on ? 'game' : 'notebook');
    setSwitching(false);
    setFailed(!ok);
  };

  return (
    <div ref={box} className={`${styles.dock} ${notebook.on ? styles.plain : ''}`} data-hud>
      {open && (
        <div className={styles.panel} role="dialog" aria-label="Settings" onKeyDown={(e) => e.stopPropagation()} onKeyUp={(e) => e.stopPropagation()}>
          <div className={styles.title}>Settings</div>

          <div className={styles.section}>
            <div className={styles.head}>
              <span>Sound</span>
              <button
                role="switch"
                aria-checked={!muted}
                className={`${styles.switch} ${!muted ? styles.on : ''}`}
                title="Sound on or off (M)"
                onClick={toggleMute}
              >
                <span className={styles.knobDot} />
              </button>
            </div>
            <div className={styles.volume}>
              <div
                ref={track}
                className={`${styles.track} ${muted ? styles.dim : ''}`}
                role="slider"
                tabIndex={0}
                aria-label="Volume"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
                aria-valuetext={muted ? `${pct}%, muted` : `${pct}%`}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setDragging(true);
                  setFrom(e.clientX);
                }}
                onPointerMove={(e) => dragging && setFrom(e.clientX)}
                onPointerUp={() => setDragging(false)}
                onPointerCancel={() => setDragging(false)}
                onKeyDown={(e) => {
                  const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? STEP : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -STEP : 0;
                  if (!d) return;
                  e.preventDefault();
                  setVolume(volume + d);
                }}
              >
                <span className={styles.fill} style={{ width: `${pct}%` }} />
                <span className={styles.knob} style={{ left: `${pct}%` }} />
              </div>
              <span className={styles.value}>{muted ? 'Off' : pct}</span>
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.head}>Text style</div>
            <div className={styles.fonts} role="radiogroup" aria-label="Text style">
              {FONT_STYLES.map((f) => (
                <button
                  key={f.id}
                  role="radio"
                  aria-checked={font === f.id}
                  data-font-option={f.id}
                  className={`${styles.font} ${font === f.id ? styles.picked : ''}`}
                  title={f.hint}
                  onClick={() => setFontStyle(f.id)}
                >
                  <span className={styles[`sample_${f.id}`]}>{f.label}</span>
                </button>
              ))}
            </div>
            <div className={styles.hint}>{FONT_STYLES.find((f) => f.id === font)?.hint}</div>
          </div>

          <div className={styles.section}>
            <div className={styles.head}>
              <span>Notebook mode</span>
              <button
                role="switch"
                aria-checked={notebook.on}
                data-tour="view-notebook"
                className={`${styles.switch} ${notebook.on ? styles.on : ''}`}
                disabled={!notebook.available || switching}
                title="Your notes as a plain notebook, without the town. Nothing is lost either way."
                onClick={() => void flipNotebook()}
              >
                <span className={styles.knobDot} />
              </button>
            </div>
            <div className={styles.hint}>
              {failed
                ? "Couldn't save the open note, so nothing switched. Try again."
                : !notebook.available
                  ? 'Open your own town to use it.'
                  : notebook.on
                    ? 'The town is paused. Switch off to go back.'
                    : 'A plain notes app: folders on the side, the page beside them.'}
            </div>
          </div>
        </div>
      )}
      <button
        className={styles.gear}
        data-tour="settings"
        title="Settings"
        aria-label="Settings"
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 9 9" shapeRendering="crispEdges" aria-hidden>
          {GEAR.flatMap((row, y) => [...row].map((c, x) => (c === 'O' ? <rect key={`${x},${y}`} x={x} y={y} width={1} height={1} fill="currentColor" /> : null)))}
        </svg>
      </button>
    </div>
  );
}
