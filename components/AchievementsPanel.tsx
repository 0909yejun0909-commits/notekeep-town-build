'use client';

import { useEffect, useState } from 'react';
import pixel from './pixelUi.module.css';
import styles from './AchievementUi.module.css';
import { ACHIEVEMENTS } from '@/lib/achievements';
import { current, progress } from '@/lib/achievementState';
import { refreshAchievements } from '@/lib/achievementStore';
import { rewardName } from '@/lib/rewards';
import { useAchievements } from '@/lib/useAchievements';

function Trophy() {
  return (
    <svg width="24" height="24" viewBox="0 0 12 12" shapeRendering="crispEdges" aria-hidden>
      <path fill="#f7c948" d="M3 1h6v1h2v3H9v1H8v2H7v1h2v2H3v-2h2V8H4V6H3V5H1V2h2z" />
      <path fill="#a4402a" d="M5 2h2v3H5z" />
    </svg>
  );
}

export default function AchievementsPanel() {
  const { active, state } = useAchievements();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    refreshAchievements();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!active) return null;
  const done = ACHIEVEMENTS.filter((a) => state.unlocked[a.id] !== undefined).length;

  return (
    <>
      <button
        className={styles.trophy}
        title="Achievements"
        aria-label="Achievements"
        onClick={(e) => {
          e.currentTarget.blur();
          setOpen(true);
        }}
      >
        <Trophy />
      </button>
      {open && (
        <div className={styles.screen} onClick={() => setOpen(false)}>
          <div className={`${pixel.parchment} ${styles.panel}`} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.heading}>Achievements</h2>
            <p className={styles.count}>{done} / {ACHIEVEMENTS.length}</p>
            <div className={styles.list}>
              {ACHIEVEMENTS.map((a) => {
                const got = state.unlocked[a.id] !== undefined;
                const hidden = a.secret && !got;
                return (
                  <div key={a.id} className={`${styles.item} ${got ? styles.done : ''}`}>
                    <span className={styles.name}>{hidden ? '???' : a.name}</span>
                    <span className={styles.desc}>
                      {hidden ? 'A secret. Keep playing to find it.' : a.description}
                      {!got && !hidden && ` (${Math.min(current(state, a), a.target)} / ${a.target})`}
                    </span>
                    {!hidden && (
                      <span className={styles.reward}>
                        {a.reward.kind === 'skin' ? 'Outfit' : 'Pet'}: {rewardName(a.reward.kind, a.reward.id)}
                      </span>
                    )}
                    {!hidden && (
                      <div className={styles.bar}>
                        <div className={styles.fill} style={{ width: `${progress(state, a) * 100}%` }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <button className={styles.close} onClick={() => setOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}
