'use client';

import { useEffect } from 'react';
import { sfx } from '@/game/audio/sfx';
import { dismissToast } from '@/lib/achievementStore';
import { rewardName } from '@/lib/rewards';
import { useAchievements } from '@/lib/useAchievements';
import styles from './AchievementUi.module.css';

export default function AchievementToast() {
  const { toasts } = useAchievements();
  const head = toasts[0] ?? null;
  const id = head?.id;

  useEffect(() => {
    if (id === undefined) return;
    sfx('buy');
    const t = setTimeout(() => dismissToast(id), 5000);
    return () => clearTimeout(t);
  }, [id]);

  if (!head) return null;
  const { achievement: a } = head;
  return (
    <div key={head.id} className={styles.toast} onClick={() => dismissToast(head.id)}>
      <span className={styles.toastTitle}>{a.name}</span>
      <span className={styles.toastBody}>
        Unlocked {a.reward.kind === 'skin' ? 'outfit' : 'pet'}: {rewardName(a.reward.kind, a.reward.id)}
      </span>
    </div>
  );
}
