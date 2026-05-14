import { describe, it, expect } from 'vitest';
import {
  localHour,
  localDateISO,
  isSameLocalDate,
  yesterdayLocal,
  getCurrentWeekStart,
  daysOfWeek,
} from './time';

describe('localHour', () => {
  it('returns hour in given timezone', () => {
    // 2026-05-11 17:30 UTC = 13:30 EDT
    const d = new Date('2026-05-11T17:30:00Z');
    expect(localHour(d, 'America/New_York')).toBe(13);
  });
  it('handles UTC tz', () => {
    const d = new Date('2026-05-11T17:30:00Z');
    expect(localHour(d, 'UTC')).toBe(17);
  });
});

describe('localDateISO', () => {
  it('returns YYYY-MM-DD in local tz', () => {
    const d = new Date('2026-05-11T03:00:00Z'); // 23:00 prev day in NYC
    expect(localDateISO(d, 'America/New_York')).toBe('2026-05-10');
  });
});

describe('yesterdayLocal', () => {
  it('returns previous local date', () => {
    expect(yesterdayLocal('2026-05-11')).toBe('2026-05-10');
    expect(yesterdayLocal('2026-01-01')).toBe('2025-12-31');
  });
});

describe('isSameLocalDate', () => {
  it('true when same date in given tz', () => {
    const a = new Date('2026-05-11T10:00:00Z');
    const b = new Date('2026-05-11T22:00:00Z');
    expect(isSameLocalDate(a, b, 'America/New_York')).toBe(true);
  });
  it('false across local-date boundary', () => {
    const a = new Date('2026-05-11T03:00:00Z'); // May 10 in NYC
    const b = new Date('2026-05-11T13:00:00Z'); // May 11 in NYC
    expect(isSameLocalDate(a, b, 'America/New_York')).toBe(false);
  });
});

describe('getCurrentWeekStart', () => {
  const tz = 'America/New_York';
  it('returns Monday for a midweek date past reset hour', () => {
    // 2026-05-13 (Wed) 14:00 NYC → week starts Mon 2026-05-11
    const d = new Date('2026-05-13T18:00:00Z'); // 14:00 EDT
    expect(getCurrentWeekStart(d, tz, 4)).toBe('2026-05-11');
  });
  it('returns previous Monday on Monday before reset hour', () => {
    // 2026-05-11 (Mon) 03:00 NYC → still last week (2026-05-04)
    const d = new Date('2026-05-11T07:00:00Z'); // 03:00 EDT
    expect(getCurrentWeekStart(d, tz, 4)).toBe('2026-05-04');
  });
  it('rolls over to new week on Monday at/after reset hour', () => {
    // 2026-05-11 (Mon) 05:00 NYC → new week (2026-05-11)
    const d = new Date('2026-05-11T09:00:00Z'); // 05:00 EDT
    expect(getCurrentWeekStart(d, tz, 4)).toBe('2026-05-11');
  });
  it('handles Sunday correctly (still last week)', () => {
    // 2026-05-17 (Sun) 14:00 NYC → still 2026-05-11 week
    const d = new Date('2026-05-17T18:00:00Z');
    expect(getCurrentWeekStart(d, tz, 4)).toBe('2026-05-11');
  });
});

describe('daysOfWeek', () => {
  it('returns 7 consecutive ISO dates starting at given Monday', () => {
    expect(daysOfWeek('2026-05-11')).toEqual([
      '2026-05-11', '2026-05-12', '2026-05-13', '2026-05-14',
      '2026-05-15', '2026-05-16', '2026-05-17',
    ]);
  });
});
