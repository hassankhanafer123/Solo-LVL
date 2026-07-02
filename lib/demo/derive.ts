import { xpToNext, titleForLevel } from '@/lib/xp';
import { computePartialXp } from '@/lib/quests';
import { categoryXp } from '@/lib/tracker/locked-xp';
import type { StatKind } from '@/lib/types';
import type { TrackerQuest, TrackerProfile } from '@/lib/tracker/types';

export function levelFromTotalXp(total: number): { level: number; xpInLevel: number; xpToNext: number } {
  let level = 1;
  let remaining = Math.max(0, Math.floor(total));
  while (level < 1000 && remaining >= xpToNext(level)) {
    remaining -= xpToNext(level);
    level += 1;
  }
  return { level, xpInLevel: remaining, xpToNext: xpToNext(level) };
}

export function questAwardedXp(q: TrackerQuest): number {
  if (q.completionType === 'checkbox') return q.completed ? q.baseXp : 0;
  return computePartialXp({ actual: q.actualValue, target: q.targetValue, base_xp: q.baseXp });
}

export interface DeriveInput {
  history: { totalXp: number; stats: Record<StatKind, number> };
  streakCurrent: number;
  streakBest: number;
  displayName: string;
  username: string | null;
  dailyQuests: TrackerQuest[];
  weeklyQuests: TrackerQuest[];
}

export function deriveProfile(input: DeriveInput): TrackerProfile {
  const all = [...input.dailyQuests, ...input.weeklyQuests];
  const weekAwarded = all.reduce((sum, q) => sum + questAwardedXp(q), 0);
  const totalXp = input.history.totalXp + weekAwarded;
  const { level, xpInLevel, xpToNext: toNext } = levelFromTotalXp(totalXp);

  const stats: Record<StatKind, number> = { ...input.history.stats };
  for (const q of all) {
    if (questAwardedXp(q) > 0) stats[q.stat] += categoryXp(q.stat);
  }

  return {
    displayName: input.displayName,
    username: input.username,
    level,
    title: titleForLevel(level),
    xpInLevel,
    xpToNext: toNext,
    totalXp,
    streakCurrent: input.streakCurrent,
    streakBest: input.streakBest,
    stats,
  };
}
