import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dismissToast, equip, getEquipped, getView, isUnlocked, startAchievements, stopAchievements,
  track, trackDistinct, trackMax,
} from './achievementStore.ts';

const mem = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
};

beforeEach(() => {
  stopAchievements();
  mem.clear();
});

test('inactive until started, and track is a no-op', () => {
  track('notesRead');
  assert.equal(getView().active, false);
});

test('unlocking queues a toast and makes the reward available', () => {
  startAchievements('v', true);
  assert.equal(isUnlocked('pet', 'cat'), false);
  trackDistinct('notesRead', 'a.md');
  assert.equal(isUnlocked('pet', 'cat'), true);
  assert.deepEqual(getView().toasts.map((t) => t.achievement.id), ['first-page']);
  dismissToast(getView().toasts[0].id);
  assert.equal(getView().toasts.length, 0);
});

test('progress persists per vault and reloads', () => {
  startAchievements('v', true);
  trackDistinct('notesRead', 'a.md');
  stopAchievements();
  startAchievements('v', true);
  assert.equal(isUnlocked('pet', 'cat'), true);
  stopAchievements();
  startAchievements('other', true);
  assert.equal(isUnlocked('pet', 'cat'), false);
});

test('the demo town (persist=false) writes nothing', () => {
  startAchievements('demo', false);
  trackDistinct('notesRead', 'a.md');
  stopAchievements();
  assert.equal(mem.size, 0);
});

test('corrupt saved state falls back to empty', () => {
  mem.set('achievements:v', '{not json');
  startAchievements('v', true);
  assert.equal(getView().active, true);
  assert.equal(isUnlocked('pet', 'cat'), false);
  mem.set('achievements:w', JSON.stringify({ stats: 7, unlocked: ['x'] }));
  startAchievements('w', true);
  assert.equal(isUnlocked('pet', 'cat'), false);
});

test('a huge jump unlocks every crossed reward', () => {
  startAchievements('v', true);
  track('coinsEarned', 6000);
  for (const id of ['cat-black', 'cat-cyclop']) assert.equal(isUnlocked('pet', id), true, id);
  assert.equal(isUnlocked('skin', 'royal-purple'), true);
});

test('trackMax unlocks on the best single room', () => {
  startAchievements('v', true);
  trackMax('roomFurniture', 4);
  assert.equal(isUnlocked('pet', 'dog2'), true);
  assert.equal(isUnlocked('skin', 'knight-bronze'), false);
});

test('equipped only returns unlocked, known ids', () => {
  startAchievements('v', true);
  equip({ skin: 'farmer', pet: 'cat' });
  assert.deepEqual(getEquipped(), { skin: null, pet: null });
  trackDistinct('notesRead', 'a.md');
  assert.deepEqual(getEquipped(), { skin: null, pet: 'cat' });
  mem.set('notekeep-town:equipped', JSON.stringify({ skin: 'not-a-skin', pet: 'cat' }));
  assert.deepEqual(getEquipped(), { skin: null, pet: 'cat' });
  mem.set('notekeep-town:equipped', 'garbage');
  assert.deepEqual(getEquipped(), { skin: null, pet: null });
});

test('the dev unlock-all flag unlocks everything', () => {
  mem.set('notekeep-town:unlock-all', '1');
  assert.equal(isUnlocked('skin', 'royal-red'), true);
  equip({ skin: 'royal-red' });
  assert.equal(getEquipped().skin, 'royal-red');
});
