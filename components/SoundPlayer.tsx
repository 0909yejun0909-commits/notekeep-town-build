'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { AMBIENCES, PLAYLIST, nextTrack, type PlayerTab } from '@/lib/chill';
import { isMuted, subscribeMute } from '@/game/audio/engine';
import { likedLevel, setLevel, setTrack, toggleAmbience, useChill } from '@/game/audio/chill';
import { bus } from '@/game/bus';
import pixel from './pixelUi.module.css';
import styles from './SoundPlayer.module.css';

const STEPS = 10;

// Opened by walking up to a speaker, headphones, earbuds, boombox, record player or
// white-noise machine (InteriorScene). What it starts keeps playing after it closes.
export default function SoundPlayer() {
  const [open, setOpen] = useState<{ device: string; tab: PlayerTab } | null>(null);
  const [tab, setTab] = useState<PlayerTab>('music');
  const [cursor, setCursor] = useState(0);
  const chill = useChill();
  const muted = useSyncExternalStore(subscribeMute, isMuted, () => false);

  useEffect(() => {
    const onOpen = (e: { device: string; tab: PlayerTab }) => {
      setOpen(e);
      setTab(e.tab);
      setCursor(0);
    };
    bus.on('open-sound-player', onOpen);
    return () => bus.off('open-sound-player', onOpen);
  }, []);

  const close = () => {
    setOpen(null);
    bus.emit('close-sound-player', undefined);
  };

  const rows = tab === 'music' ? PLAYLIST.length : AMBIENCES.length;

  const pick = (i: number) => {
    if (tab === 'music') {
      const place = PLAYLIST[i].place;
      setTrack(chill.track === place ? null : place);
    } else {
      toggleAmbience(AMBIENCES[i].id);
    }
  };

  const nudge = (i: number, dir: 1 | -1) => {
    if (tab === 'music') {
      setTrack(nextTrack(chill.track ?? PLAYLIST[i].place, dir));
      return;
    }
    const id = AMBIENCES[i].id;
    const now = chill.levels[id] ?? 0;
    setLevel(id, Math.round((now + dir / STEPS) * STEPS) / STEPS);
  };

  const switchTab = (next: PlayerTab) => {
    setTab(next);
    setCursor(0);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (k === 'Escape') close();
      else if (k === 'ArrowUp' || k === 'w' || k === 'W') setCursor((c) => (c + rows - 1) % rows);
      else if (k === 'ArrowDown' || k === 's' || k === 'S') setCursor((c) => (c + 1) % rows);
      else if (k === 'ArrowLeft' || k === 'a' || k === 'A') nudge(cursor, -1);
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') nudge(cursor, 1);
      else if (k === 'Tab' || k === '1' || k === '2') switchTab(k === '1' ? 'music' : k === '2' ? 'ambience' : tab === 'music' ? 'ambience' : 'music');
      else if (k === 'Enter' || k === ' ') {
        if (!e.repeat) pick(cursor);
      } else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  if (!open) return null;

  return (
    <div className={styles.screen} onClick={close}>
      <div className={`${pixel.parchment} ${styles.panel}`} onClick={(e) => e.stopPropagation()}>
        <p className={styles.title}>{open.device}</p>
        <div className={styles.tabs} role="tablist">
          {(['music', 'ambience'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              className={`${styles.tab} ${tab === t ? styles.tabOn : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => switchTab(t)}
            >
              {t === 'music' ? 'Music' : 'Sounds'}
            </button>
          ))}
        </div>
        {muted && <p className={styles.muted}>Sound is off. Press M to turn it on.</p>}

        {tab === 'music' ? (
          <ul className={styles.list} role="menu">
            {PLAYLIST.map((t, i) => {
              const on = chill.track === t.place;
              return (
                <li key={t.place} role="none">
                  <button
                    role="menuitem"
                    className={`${pixel.item} ${i === cursor ? pixel.current : ''}`}
                    onMouseEnter={() => setCursor(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(i)}
                  >
                    <span className={`${pixel.cursor} ${i === cursor ? '' : pixel.cursorIdle}`} />
                    <span className={styles.state}>{on ? '>' : ''}</span>
                    <span className={styles.name}>{t.name}</span>
                    <span className={styles.mood}>{t.mood}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <ul className={styles.list} role="menu">
            {AMBIENCES.map((a, i) => {
              const level = chill.levels[a.id] ?? 0;
              const lit = Math.round((level || likedLevel(a.id)) * STEPS);
              return (
                <li key={a.id} role="none">
                  <div className={`${pixel.item} ${styles.mix} ${i === cursor ? pixel.current : ''}`} onMouseEnter={() => setCursor(i)}>
                    <button
                      role="menuitemcheckbox"
                      aria-checked={level > 0}
                      className={`${pixel.item} ${i === cursor ? pixel.current : ''}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => toggleAmbience(a.id)}
                    >
                      <span className={`${pixel.cursor} ${i === cursor ? '' : pixel.cursorIdle}`} />
                      <span className={styles.state}>{level > 0 ? 'ON' : ''}</span>
                      <span className={styles.name}>{a.label}</span>
                    </button>
                    <span className={`${styles.bar} ${level > 0 ? '' : styles.barOff}`} aria-label={`${a.label} volume`}>
                      {Array.from({ length: STEPS }, (_, s) => (
                        <button
                          key={s}
                          className={`${styles.seg} ${s < lit ? styles.segLit : ''}`}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => setLevel(a.id, (s + 1) / STEPS)}
                          tabIndex={-1}
                          aria-label={`${(s + 1) * 10}%`}
                        />
                      ))}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className={styles.hint}>
          {tab === 'music' ? 'Enter plays or stops, Left/Right skips' : 'Enter toggles, Left/Right sets volume'}
          {' · Tab switches · Esc closes'}
        </p>
      </div>
    </div>
  );
}
