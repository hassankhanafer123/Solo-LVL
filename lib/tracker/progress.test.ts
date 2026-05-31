import { describe, it, expect } from 'vitest';
import { decideStreak } from './progress';

describe('decideStreak', () => {
  it('starts streak at 1 when first clear and yesterday not cleared', () => {
    const r = decideStreak({ current: 0, best: 0, yesterdayCleared: false });
    expect(r).toEqual({ current: 1, best: 1 });
  });

  it('increments and continues when yesterday cleared', () => {
    const r = decideStreak({ current: 5, best: 9, yesterdayCleared: true });
    expect(r).toEqual({ current: 6, best: 9 });
  });

  it('raises best when current exceeds it', () => {
    const r = decideStreak({ current: 9, best: 9, yesterdayCleared: true });
    expect(r).toEqual({ current: 10, best: 10 });
  });

  it('resets to 1 when a gap occurred', () => {
    const r = decideStreak({ current: 5, best: 9, yesterdayCleared: false });
    expect(r).toEqual({ current: 1, best: 9 });
  });
});
