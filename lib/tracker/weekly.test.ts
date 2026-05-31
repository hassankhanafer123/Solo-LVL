import { describe, it, expect } from 'vitest';
import { computeWeeklyCompletion } from './weekly';

describe('computeWeeklyCompletion', () => {
  it('returns correct fraction for a typical mixed week (2 daily + 2 weekly, 12 + 2 completed = 14/16)', () => {
    const result = computeWeeklyCompletion({
      dailyTemplateCount: 2,
      weeklyTemplateCount: 2,
      completedDaily: 12,
      completedWeekly: 2,
    });
    // pool = 2*7 + 2 = 16; completed = 12+2 = 14; fraction = 14/16 = 0.875
    expect(result).toBe(0.875);
  });

  it('returns 0 when there are no templates (zero pool)', () => {
    const result = computeWeeklyCompletion({
      dailyTemplateCount: 0,
      weeklyTemplateCount: 0,
      completedDaily: 0,
      completedWeekly: 0,
    });
    expect(result).toBe(0);
  });

  it('returns 1 when all quests are completed (full completion)', () => {
    const result = computeWeeklyCompletion({
      dailyTemplateCount: 3,
      weeklyTemplateCount: 1,
      completedDaily: 21,
      completedWeekly: 1,
    });
    // pool = 3*7 + 1 = 22; completed = 21+1 = 22; fraction = 1
    expect(result).toBe(1);
  });
});
