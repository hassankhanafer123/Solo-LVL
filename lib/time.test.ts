import { describe, it, expect } from 'vitest';
import { localHour, localDateISO, isSameLocalDate, yesterdayLocal } from './time';

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
