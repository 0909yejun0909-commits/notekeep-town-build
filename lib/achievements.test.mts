import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACHIEVEMENTS, achievementFor } from './achievements.ts';
import { STAT_KEYS } from './achievementState.ts';
import { PETS, SKINS } from './rewards.ts';

test('achievement ids are unique and targets are positive integers', () => {
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, ACHIEVEMENTS.length);
  for (const a of ACHIEVEMENTS) {
    assert.ok(Number.isInteger(a.target) && a.target > 0, a.id);
    assert.ok(STAT_KEYS.includes(a.stat), a.id);
  }
});

test('every skin and every pet is granted by exactly one achievement', () => {
  for (const [kind, list] of [['skin', SKINS], ['pet', PETS]] as const) {
    for (const e of list) {
      const owners = ACHIEVEMENTS.filter((a) => a.reward.kind === kind && a.reward.id === e.id);
      assert.equal(owners.length, 1, `${kind} ${e.id}`);
    }
  }
  assert.equal(ACHIEVEMENTS.length, SKINS.length + PETS.length);
});

test('achievementFor finds the owner of a reward', () => {
  assert.equal(achievementFor('pet', 'cat')?.id, 'first-page');
  assert.equal(achievementFor('skin', 'does-not-exist'), undefined);
});

test('secret achievements exist and are a minority', () => {
  const secrets = ACHIEVEMENTS.filter((a) => a.secret);
  assert.ok(secrets.length >= 3 && secrets.length < ACHIEVEMENTS.length / 2);
});
