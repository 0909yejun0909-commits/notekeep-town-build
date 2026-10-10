'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AMBIENCES, BREATHS, BREATH_WORD, SESSION_MINUTES, breathAt, clock, meditationCoins, type AmbienceId,
} from '@/lib/chill';
import { payCalm } from '@/lib/calmStore';
import { setLevel, useChill } from '@/game/audio/chill';
import { sfx } from '@/game/audio/sfx';
import { bus } from '@/game/bus';
import pixel from './pixelUi.module.css';
import styles from './Meditate.module.css';

type Stage = 'setup' | 'running' | 'done';

// Soft backgrounds first: the same sounds the player offers, but only the ones that suit sitting still.
const BACKDROPS: Array<AmbienceId | null> = [null, 'rain', 'ocean', 'fire', 'wind', 'crickets', 'brown'];
const ROWS = ['Length', 'Breath', 'Sound', 'Begin'] as const;

const backdropLabel = (id: AmbienceId | null) => (id ? AMBIENCES.find((a) => a.id === id)!.label : 'Silence');
const cycle = (i: number, n: number, dir: number) => (i + dir + n) % n;

// Opened by sitting on a meditation cushion (InteriorScene). A breathing circle to follow, a
// quiet sound if you want one, and a coin for every full minute you stay, up to the daily limit.
export default function Meditate() {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>('setup');
  const [row, setRow] = useState(0);
  const [minutes, setMinutes] = useState(1);
  const [breath, setBreath] = useState(0);
  const [backdrop, setBackdrop] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [paid, setPaid] = useState(0);
  const chill = useChill();
  const startedAt = useRef(0);
  const ownsBackdrop = useRef<AmbienceId | null>(null);

  useEffect(() => {
    const onOpen = () => {
      setOpen(true);
      setStage('setup');
      setRow(3);
      setElapsed(0);
      setPaid(0);
    };
    bus.on('open-meditate', onOpen);
    return () => bus.off('open-meditate', onOpen);
  }, []);

  const total = SESSION_MINUTES[minutes] * 60;

  const dropBackdrop = () => {
    const id = ownsBackdrop.current;
    ownsBackdrop.current = null;
    if (id) setLevel(id, 0);
  };

  const finish = (seconds: number, complete: boolean) => {
    dropBackdrop();
    const coins = payCalm(meditationCoins(seconds), complete ? 'You finished your meditation. Well done.' : 'A little calm goes a long way.');
    setPaid(coins);
    setElapsed(seconds);
    setStage('done');
    if (complete) sfx('bowl');
  };

  const begin = () => {
    const id = BACKDROPS[backdrop];
    if (id && !chill.levels[id]) {
      setLevel(id, 0.45);
      ownsBackdrop.current = id;
    }
    startedAt.current = Date.now();
    setElapsed(0);
    setStage('running');
    sfx('bowl');
  };

  const leave = () => {
    dropBackdrop();
    setOpen(false);
    bus.emit('close-meditate', undefined);
  };

  useEffect(() => {
    if (stage !== 'running') return;
    let frame = 0;
    const tick = () => {
      const seconds = (Date.now() - startedAt.current) / 1000;
      if (seconds >= total) {
        finish(total, true);
        return;
      }
      setElapsed(seconds);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, total]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      if (k === 'Escape') {
        if (stage === 'running') finish(elapsed, false);
        else leave();
      } else if (stage === 'done') {
        if ((k === 'Enter' || k === ' ') && !e.repeat) leave();
        else return;
      } else if (stage === 'running') {
        return;
      } else if (k === 'ArrowUp' || k === 'w' || k === 'W') setRow((r) => cycle(r, ROWS.length, -1));
      else if (k === 'ArrowDown' || k === 's' || k === 'S') setRow((r) => cycle(r, ROWS.length, 1));
      else if (k === 'ArrowLeft' || k === 'a' || k === 'A') change(-1);
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') change(1);
      else if (k === 'Enter' || k === ' ') {
        if (e.repeat) return;
        if (row === 3) begin();
        else change(1);
      } else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const change = (dir: number) => {
    if (row === 0) setMinutes((m) => cycle(m, SESSION_MINUTES.length, dir));
    else if (row === 1) setBreath((b) => cycle(b, BREATHS.length, dir));
    else if (row === 2) setBackdrop((b) => cycle(b, BACKDROPS.length, dir));
  };

  if (!open) return null;

  const shape = BREATHS[breath];
  const now = breathAt(shape, elapsed);
  const values = [`${SESSION_MINUTES[minutes]} min`, shape.name, backdropLabel(BACKDROPS[backdrop]), 'Start'];

  return (
    <div className={styles.screen}>
      {stage === 'setup' && (
        <div className={`${pixel.parchment} ${styles.panel}`}>
          <p className={styles.title}>Meditate</p>
          <ul className={styles.rows} role="menu">
            {ROWS.map((label, i) => (
              <li key={label} role="none">
                <button
                  role="menuitem"
                  className={`${pixel.item} ${i === row ? pixel.current : ''}`}
                  onMouseEnter={() => setRow(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setRow(i);
                    if (i === 3) begin();
                    else if (i === 0) setMinutes((m) => cycle(m, SESSION_MINUTES.length, 1));
                    else if (i === 1) setBreath((b) => cycle(b, BREATHS.length, 1));
                    else setBackdrop((b) => cycle(b, BACKDROPS.length, 1));
                  }}
                >
                  <span className={`${pixel.cursor} ${i === row ? '' : pixel.cursorIdle}`} />
                  <span className={styles.label}>{i === 3 ? '' : label}</span>
                  <span className={i === 3 ? styles.start : styles.value}>{i === 3 ? 'Start' : `< ${values[i]} >`}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className={styles.hint}>A coin for every full minute, up to 12 a day · Esc to get up</p>
        </div>
      )}

      {stage === 'running' && (
        <div className={styles.session}>
          <div className={styles.stage}>
            <div className={styles.ring} style={{ transform: `scale(${0.35 + now.size * 0.65})` }} />
            <div className={styles.core} style={{ transform: `scale(${0.2 + now.size * 0.4})` }} />
          </div>
          <p className={`${pixel.outlined} ${styles.word}`}>{BREATH_WORD[now.phase]}</p>
          <p className={`${pixel.outlined} ${styles.time}`}>{clock(total - elapsed)}</p>
          <p className={styles.sub}>Esc to finish early</p>
        </div>
      )}

      {stage === 'done' && (
        <div className={`${pixel.parchment} ${styles.panel}`}>
          <p className={styles.title}>{elapsed >= total ? 'Well done' : 'Welcome back'}</p>
          <p className={styles.result}>{clock(elapsed)} of stillness</p>
          <p className={styles.result}>
            {paid > 0 ? `+${paid} ${paid === 1 ? 'coin' : 'coins'}` : meditationCoins(elapsed) > 0 ? 'Today’s calm coins are all collected' : 'Stay a full minute to earn a coin'}
          </p>
          <p className={styles.hint}>Enter to get up</p>
        </div>
      )}
    </div>
  );
}
