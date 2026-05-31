import { describe, it, expect } from 'vitest';
import { decideCompletion } from './complete';
import type { XpInput } from '../xp';

const profile: XpInput = {
  level: 1, total_xp: 0, xp_in_level: 0, xp_to_next: 100,
  unallocated_points: 0, title: 'Novice',
};

describe('decideCompletion', () => {
  it('awards full base_xp when count target met', () => {
    const d = decideCompletion(
      { actual_value: 100, target_value: 100, base_xp: 50, completed: false },
      profile,
    );
    expect(d.alreadyComplete).toBe(false);
    expect(d.xpAward).toBe(50);
    expect(d.xpResult?.total_xp).toBe(50);
    expect(d.xpResult?.level).toBe(profile.level);
    expect(d.xpResult?.levels_gained).toBe(0);
  });

  it('awards partial XP when below target', () => {
    const d = decideCompletion(
      { actual_value: 50, target_value: 100, base_xp: 50, completed: false },
      profile,
    );
    expect(d.xpAward).toBe(25);
  });

  it('is idempotent: already-complete awards nothing', () => {
    const d = decideCompletion(
      { actual_value: 100, target_value: 100, base_xp: 50, completed: true },
      profile,
    );
    expect(d.alreadyComplete).toBe(true);
    expect(d.xpAward).toBe(0);
    expect(d.xpResult).toBeNull();
  });

  it('checkbox (null target) awards base_xp when actual >= 1', () => {
    const d = decideCompletion(
      { actual_value: 1, target_value: null, base_xp: 25, completed: false },
      profile,
    );
    expect(d.xpAward).toBe(25);
  });
});
