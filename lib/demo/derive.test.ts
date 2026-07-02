import { describe, it, expect } from 'vitest';
import { levelFromTotalXp, questAwardedXp, deriveProfile } from './derive';
import type { TrackerQuest } from '@/lib/tracker/types';

const q = (over: Partial<TrackerQuest>): TrackerQuest => ({
  instanceId: 'x', templateId: null, name: 'n', stat: 'INT', completionType: 'checkbox',
  targetValue: null, actualValue: 0, baseXp: 25, xpAwarded: 0, isRequired: true,
  isPenalty: false, completed: false, cadence: 'daily', ...over,
});

describe('levelFromTotalXp', () => {
  it('level 1 at 0 xp', () => {
    const r = levelFromTotalXp(0);
    expect(r.level).toBe(1);
    expect(r.xpInLevel).toBe(0);
    expect(r.xpToNext).toBe(150);
  });
  it('rolls into level 2 past first threshold', () => {
    const r = levelFromTotalXp(150);
    expect(r.level).toBe(2);
    expect(r.xpInLevel).toBe(0);
  });
});

describe('questAwardedXp', () => {
  it('checkbox: full base when completed, else 0', () => {
    expect(questAwardedXp(q({ completionType: 'checkbox', completed: true, baseXp: 25 }))).toBe(25);
    expect(questAwardedXp(q({ completionType: 'checkbox', completed: false }))).toBe(0);
  });
  it('count: partial by actual/target', () => {
    expect(questAwardedXp(q({ completionType: 'count', targetValue: 10, actualValue: 5, baseXp: 20 }))).toBe(10);
  });
});

describe('deriveProfile', () => {
  it('adds week awarded xp to history baseline', () => {
    const daily = [q({ instanceId: 'a', completionType: 'checkbox', completed: true, baseXp: 25, stat: 'STR' })];
    const p = deriveProfile({
      history: { totalXp: 1000, stats: { INT: 100, STR: 100, DIS: 100 } },
      streakCurrent: 4, streakBest: 9, displayName: 'You', username: 'DemoHunter',
      dailyQuests: daily, weeklyQuests: [],
    });
    expect(p.totalXp).toBe(1025);
    expect(p.stats.STR).toBe(110);
    expect(p.level).toBeGreaterThanOrEqual(1);
    expect(p.streakCurrent).toBe(4);
  });
});
