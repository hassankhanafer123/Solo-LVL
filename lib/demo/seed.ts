import type { TrackerSnapshot, TrackerQuest } from '@/lib/tracker/types';
import type { StatKind } from '@/lib/types';
import { deriveProfile } from './derive';

export const DEMO_HISTORY = {
  totalXp: 2200,
  stats: { INT: 320, STR: 280, DIS: 360 } as Record<StatKind, number>,
};
export const DEMO_STREAK_CURRENT = 6;
export const DEMO_STREAK_BEST = 14;
export const DEMO_USERNAME = 'DemoHunter';

const daily = (over: Partial<TrackerQuest> & { instanceId: string; name: string; stat: StatKind }): TrackerQuest => ({
  templateId: null, completionType: 'checkbox', targetValue: null, actualValue: 0,
  baseXp: 25, xpAwarded: 0, isRequired: true, isPenalty: false, completed: false,
  cadence: 'daily', ...over,
});

const DAILY: TrackerQuest[] = [
  daily({ instanceId: 'd-read', name: 'Read 20 pages', stat: 'INT', completionType: 'count', targetValue: 20, actualValue: 20, baseXp: 15, completed: true }),
  daily({ instanceId: 'd-leetcode', name: 'Solve 1 LeetCode', stat: 'INT', completionType: 'checkbox', completed: true }),
  daily({ instanceId: 'd-pushups', name: 'Push-ups', stat: 'STR', completionType: 'count', targetValue: 50, actualValue: 30, baseXp: 25, completed: false }),
  daily({ instanceId: 'd-run', name: 'Run', stat: 'STR', completionType: 'timer', targetValue: 20, actualValue: 0, baseXp: 17, completed: false }),
  daily({ instanceId: 'd-meditate', name: 'Meditate 10 min', stat: 'DIS', completionType: 'timer', targetValue: 10, actualValue: 10, baseXp: 15, completed: true }),
  daily({ instanceId: 'd-nophone', name: 'No phone after 11pm', stat: 'DIS', completionType: 'checkbox', completed: false }),
];

const WEEKLY: TrackerQuest[] = [
  daily({ instanceId: 'w-gym', name: 'Gym sessions', stat: 'DIS', completionType: 'count', targetValue: 4, actualValue: 2, baseXp: 38, cadence: 'weekly', completed: false }),
  daily({ instanceId: 'w-deepwork', name: 'Deep-work blocks', stat: 'INT', completionType: 'count', targetValue: 5, actualValue: 3, baseXp: 30, cadence: 'weekly', completed: false }),
];

export function buildDemoSnapshot(): TrackerSnapshot {
  const dailyQuests = DAILY.map((q) => ({ ...q }));
  const weeklyQuests = WEEKLY.map((q) => ({ ...q }));
  const profile = deriveProfile({
    history: DEMO_HISTORY,
    streakCurrent: DEMO_STREAK_CURRENT,
    streakBest: DEMO_STREAK_BEST,
    displayName: 'You',
    username: DEMO_USERNAME,
    dailyQuests,
    weeklyQuests,
  });
  const all = [...dailyQuests, ...weeklyQuests];
  const weeklyTotal = all.length;
  const weeklyCompleted = all.filter((q) => q.completed).length;
  const today = new Date().toISOString().slice(0, 10);
  return {
    profile,
    dailyQuests,
    weeklyQuests,
    weekStart: today,
    today,
    weeklyCompletionPct: weeklyTotal ? weeklyCompleted / weeklyTotal : 0,
    weeklyCompleted,
    weeklyTotal,
  };
}
