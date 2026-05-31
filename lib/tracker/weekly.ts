export interface WeeklyCompletionInput {
  dailyTemplateCount: number;
  weeklyTemplateCount: number;
  completedDaily: number;
  completedWeekly: number;
}

/** Fraction 0..1 of the week's pool completed. Pool = dailyTemplates*7 + weeklyTemplates. */
export function computeWeeklyCompletion(i: WeeklyCompletionInput): number {
  const total = i.dailyTemplateCount * 7 + i.weeklyTemplateCount;
  if (total === 0) return 0;
  return (i.completedDaily + i.completedWeekly) / total;
}
