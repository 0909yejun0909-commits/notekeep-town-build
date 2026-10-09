import { useSyncExternalStore } from 'react';
import { INACTIVE_VIEW, getView, subscribe, type AchievementView } from './achievementStore';

export function useAchievements(): AchievementView {
  return useSyncExternalStore(subscribe, getView, () => INACTIVE_VIEW);
}
