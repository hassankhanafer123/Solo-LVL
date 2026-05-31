export interface StreakInput {
  current: number;
  best: number;
  yesterdayCleared: boolean;
}

export interface StreakResult {
  current: number;
  best: number;
}

/** Pure: streak transition for the moment today's required quests all clear. */
export function decideStreak(input: StreakInput): StreakResult {
  const current = input.yesterdayCleared ? input.current + 1 : 1;
  return { current, best: Math.max(current, input.best) };
}
