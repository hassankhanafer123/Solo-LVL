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
