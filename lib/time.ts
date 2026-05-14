import { formatInTimeZone } from 'date-fns-tz';
import { subDays, parseISO } from 'date-fns';

export function localHour(d: Date, tz: string): number {
  return Number(formatInTimeZone(d, tz, 'H'));
}

export function localDateISO(d: Date, tz: string): string {
  return formatInTimeZone(d, tz, 'yyyy-MM-dd');
}

export function isSameLocalDate(a: Date, b: Date, tz: string): boolean {
  return localDateISO(a, tz) === localDateISO(b, tz);
}

export function yesterdayLocal(isoDate: string): string {
  const d = parseISO(isoDate + 'T12:00:00Z'); // noon to avoid DST edge
  return formatInTimeZone(subDays(d, 1), 'UTC', 'yyyy-MM-dd');
}

/**
 * Week-start (Monday) for the user's local "logical date", anchored to their
 * reset hour. If `now` is before reset_hour on a Monday, the active week still
 * counts as the previous week's bucket. Returns YYYY-MM-DD (Monday).
 *
 * Example: NYC, reset 4am. Mon 3am local → still last week. Mon 5am → new week.
 */
export function getCurrentWeekStart(now: Date, tz: string, resetHour: number): string {
  // Logical local date: subtract reset_hour so anything before it counts as the previous day.
  const localDate = formatInTimeZone(now, tz, 'yyyy-MM-dd');
  const localH = localHour(now, tz);
  const effectiveDate = localH < resetHour ? yesterdayLocal(localDate) : localDate;

  // Find Monday of that effective date. parseISO with noon UTC keeps DOW stable.
  const d = parseISO(effectiveDate + 'T12:00:00Z');
  const dow = d.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const daysSinceMonday = (dow + 6) % 7; // Mon→0, Tue→1, ..., Sun→6
  return formatInTimeZone(subDays(d, daysSinceMonday), 'UTC', 'yyyy-MM-dd');
}

/** Returns the 7 ISO dates in the week starting at weekStart (inclusive). */
export function daysOfWeek(weekStartISO: string): string[] {
  const start = parseISO(weekStartISO + 'T12:00:00Z');
  return Array.from({ length: 7 }, (_, i) =>
    formatInTimeZone(new Date(start.getTime() + i * 86400000), 'UTC', 'yyyy-MM-dd')
  );
}

