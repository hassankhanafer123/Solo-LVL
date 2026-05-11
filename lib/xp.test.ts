import { describe, it, expect } from 'vitest';
import {
  xpToNext,
  applyXpGain,
  titleForLevel,
  TITLE_BONUS,
} from './xp';

describe('xpToNext', () => {
  it('returns 100 at level 1', () => {
    expect(xpToNext(1)).toBe(100);
  });
  it('scales by 1.4x per level', () => {
    expect(xpToNext(2)).toBe(Math.ceil(100 * 1.4));
    expect(xpToNext(3)).toBe(Math.ceil(100 * 1.4 ** 2));
    expect(xpToNext(10)).toBe(Math.ceil(100 * 1.4 ** 9));
  });
});

describe('titleForLevel', () => {
  it('returns Novice below level 10', () => {
    expect(titleForLevel(1)).toBe('Novice');
    expect(titleForLevel(9)).toBe('Novice');
  });
  it('returns Awakened at 10, Elite Hunter at 25, Necromancer at 50, Shadow Monarch at 100', () => {
    expect(titleForLevel(10)).toBe('Awakened');
    expect(titleForLevel(24)).toBe('Awakened');
    expect(titleForLevel(25)).toBe('Elite Hunter');
    expect(titleForLevel(49)).toBe('Elite Hunter');
    expect(titleForLevel(50)).toBe('Necromancer');
    expect(titleForLevel(99)).toBe('Necromancer');
    expect(titleForLevel(100)).toBe('Shadow Monarch');
    expect(titleForLevel(150)).toBe('Shadow Monarch');
  });
});

describe('TITLE_BONUS', () => {
  it('is +5% per title tier, cumulative', () => {
    expect(TITLE_BONUS.Novice).toBe(1.0);
    expect(TITLE_BONUS.Awakened).toBe(1.05);
    expect(TITLE_BONUS['Elite Hunter']).toBe(1.10);
    expect(TITLE_BONUS.Necromancer).toBe(1.15);
    expect(TITLE_BONUS['Shadow Monarch']).toBe(1.20);
  });
});

describe('applyXpGain', () => {
  const baseProfile = {
    level: 1,
    total_xp: 0,
    xp_in_level: 0,
    xp_to_next: 100,
    unallocated_points: 0,
    title: 'Novice' as const,
  };

  it('adds XP within the same level', () => {
    const r = applyXpGain(baseProfile, 30);
    expect(r.level).toBe(1);
    expect(r.xp_in_level).toBe(30);
    expect(r.total_xp).toBe(30);
    expect(r.unallocated_points).toBe(0);
    expect(r.levels_gained).toBe(0);
  });

  it('levels up exactly once when crossing threshold', () => {
    const r = applyXpGain(baseProfile, 100);
    expect(r.level).toBe(2);
    expect(r.xp_in_level).toBe(0);
    expect(r.xp_to_next).toBe(Math.ceil(100 * 1.4));
    expect(r.unallocated_points).toBe(5);
    expect(r.levels_gained).toBe(1);
  });

  it('levels up multiple times in one gain', () => {
    const r = applyXpGain(baseProfile, 1000);
    expect(r.level).toBeGreaterThan(2);
    expect(r.unallocated_points).toBe(r.levels_gained * 5);
    expect(r.total_xp).toBe(1000);
  });

  it('applies title bonus to incoming XP', () => {
    const monarch = { ...baseProfile, level: 100, title: 'Shadow Monarch' as const, xp_to_next: 1_000_000 };
    const r = applyXpGain(monarch, 100);
    expect(r.total_xp).toBe(120); // +20%
    expect(r.xp_in_level).toBe(120);
  });

  it('unlocks new title on level-up (single threshold cross)', () => {
    const near10 = { ...baseProfile, level: 9, xp_in_level: 0, xp_to_next: xpToNext(9), title: 'Novice' as const };
    const r = applyXpGain(near10, xpToNext(9));
    expect(r.level).toBe(10);
    expect(r.title).toBe('Awakened');
    expect(r.title_unlocked).toBe('Awakened');
  });

  it('reports final title when crossing multiple title thresholds in one gain', () => {
    // Level 9 → ~25+ with a massive XP boost: r.title is the highest title reached
    const near10 = { ...baseProfile, level: 9, xp_in_level: 0, xp_to_next: xpToNext(9), title: 'Novice' as const };
    const r = applyXpGain(near10, 999_999);
    // The user ends up well past level 10. r.title should NOT be stuck at 'Awakened';
    // it should reflect their actual final-level title.
    expect(r.level).toBeGreaterThan(10);
    expect(r.title).toBe(titleForLevel(r.level));
    // title_unlocked is non-null because they started Novice and crossed at least one threshold.
    expect(r.title_unlocked).not.toBeNull();
    expect(r.title_unlocked).toBe(r.title);
  });

  it('returns title_unlocked = null when no title threshold crossed', () => {
    const r = applyXpGain(baseProfile, 50);
    expect(r.level).toBe(1);
    expect(r.title).toBe('Novice');
    expect(r.title_unlocked).toBeNull();
  });

  it('rejects negative XP', () => {
    expect(() => applyXpGain(baseProfile, -10)).toThrow();
  });

  it('treats zero XP as no-op', () => {
    const r = applyXpGain(baseProfile, 0);
    expect(r).toMatchObject({ level: 1, xp_in_level: 0, levels_gained: 0 });
  });
});
