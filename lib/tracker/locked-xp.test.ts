import { describe, it, expect } from 'vitest';
import { computeLockedXp, categoryXp } from './locked-xp';

describe('computeLockedXp', () => {
  it('checkbox is always 25', () => {
    expect(computeLockedXp({ completion_type: 'checkbox', target_value: null, cadence: 'daily' })).toBe(25);
  });

  it('count target 100 -> 50', () => {
    expect(computeLockedXp({ completion_type: 'count', target_value: 100, cadence: 'daily' })).toBe(50);
  });

  it('count target 5 -> max(15, 3) = 15', () => {
    expect(computeLockedXp({ completion_type: 'count', target_value: 5, cadence: 'daily' })).toBe(15);
  });

  it('timer target 90 -> round(76.5) = 77', () => {
    expect(computeLockedXp({ completion_type: 'timer', target_value: 90, cadence: 'daily' })).toBe(77);
  });

  it('weekly count target 70 -> round(35 * 1.5) = 53', () => {
    expect(computeLockedXp({ completion_type: 'count', target_value: 70, cadence: 'weekly' })).toBe(53);
  });
});

describe('categoryXp', () => {
  it('INT -> 10', () => {
    expect(categoryXp('INT')).toBe(10);
  });

  it('STR -> 10', () => {
    expect(categoryXp('STR')).toBe(10);
  });

  it('DIS -> 20', () => {
    expect(categoryXp('DIS')).toBe(20);
  });
});
