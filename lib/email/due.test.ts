import { describe, it, expect } from 'vitest';
import { reminderDue } from './due';

const tz = 'America/New_York'; // EDT (UTC-4) in May 2026

describe('reminderDue', () => {
  it('daily true at local send hour (7am)', () => {
    // 2026-05-12 (Tue) 11:00 UTC = 07:00 EDT
    const r = reminderDue({
      now: new Date('2026-05-12T11:00:00Z'),
      timezone: tz,
      sendHour: 7,
      resetHour: 4,
      emailEnabled: true,
    });
    expect(r.daily).toBe(true);
    expect(r.localDate).toBe('2026-05-12');
  });

  it('daily false an hour before send hour (6am)', () => {
    // 2026-05-12 (Tue) 10:00 UTC = 06:00 EDT
    const r = reminderDue({
      now: new Date('2026-05-12T10:00:00Z'),
      timezone: tz,
      sendHour: 7,
      resetHour: 4,
      emailEnabled: true,
    });
    expect(r.daily).toBe(false);
    expect(r.weekly).toBe(false);
  });

  it('emailEnabled false → daily and weekly both false even at send hour', () => {
    const r = reminderDue({
      now: new Date('2026-05-11T11:00:00Z'), // Mon 07:00 EDT
      timezone: tz,
      sendHour: 7,
      resetHour: 4,
      emailEnabled: false,
    });
    expect(r.daily).toBe(false);
    expect(r.weekly).toBe(false);
  });

  it('weekly true on Monday at send hour (7am)', () => {
    // 2026-05-11 (Mon) 11:00 UTC = 07:00 EDT, past reset hour 4 → weekStart is this Monday
    const r = reminderDue({
      now: new Date('2026-05-11T11:00:00Z'),
      timezone: tz,
      sendHour: 7,
      resetHour: 4,
      emailEnabled: true,
    });
    expect(r.daily).toBe(true);
    expect(r.weekly).toBe(true);
    expect(r.localDate).toBe('2026-05-11');
    expect(r.weekStart).toBe('2026-05-11');
  });

  it('weekly false on Tuesday at send hour (7am)', () => {
    // 2026-05-12 (Tue) 11:00 UTC = 07:00 EDT → localDate != weekStart
    const r = reminderDue({
      now: new Date('2026-05-12T11:00:00Z'),
      timezone: tz,
      sendHour: 7,
      resetHour: 4,
      emailEnabled: true,
    });
    expect(r.daily).toBe(true);
    expect(r.weekly).toBe(false);
    expect(r.localDate).toBe('2026-05-12');
    expect(r.weekStart).toBe('2026-05-11');
  });

  it('weekly false on Monday outside the send hour', () => {
    // 2026-05-11 (Mon) 10:00 UTC = 06:00 EDT → not send hour
    const r = reminderDue({
      now: new Date('2026-05-11T10:00:00Z'),
      timezone: tz,
      sendHour: 7,
      resetHour: 4,
      emailEnabled: true,
    });
    expect(r.daily).toBe(false);
    expect(r.weekly).toBe(false);
  });
});
