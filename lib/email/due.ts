import { localHour, localDateISO, getCurrentWeekStart } from '../time';

export interface DueInput {
  now: Date;
  timezone: string;
  sendHour: number; // email_send_hour_local
  resetHour: number; // reset_hour_local
  emailEnabled: boolean;
}

export interface DueResult {
  daily: boolean; // morning reminder due this hour
  weekly: boolean; // weekly reminder due this hour (local Monday)
  localDate: string; // YYYY-MM-DD
  weekStart: string; // YYYY-MM-DD (Monday)
}

export function reminderDue(i: DueInput): DueResult {
  const localDate = localDateISO(i.now, i.timezone);
  const weekStart = getCurrentWeekStart(i.now, i.timezone, i.resetHour);
  const atSendHour =
    i.emailEnabled && localHour(i.now, i.timezone) === i.sendHour;
  const daily = atSendHour;
  // It's Monday when today's local date IS the week-start Monday.
  const weekly = atSendHour && localDate === weekStart;
  return { daily, weekly, localDate, weekStart };
}
