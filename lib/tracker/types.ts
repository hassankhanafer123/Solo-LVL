import type { StatKind, CompletionType, Cadence } from '../types';

export interface TrackerQuest {
  instanceId: string;
  templateId: string | null;
  name: string;
  stat: StatKind;
  completionType: CompletionType;
  targetValue: number | null;
  actualValue: number;
  baseXp: number;
  xpAwarded: number;
  isRequired: boolean;
  isPenalty: boolean;
  completed: boolean;
  cadence: Cadence;
}

export interface TrackerProfile {
  displayName: string;
  username: string | null;
  level: number;
  title: string;
  xpInLevel: number;
  xpToNext: number;
  totalXp: number;
  streakCurrent: number;
  streakBest: number;
  stats: { INT: number; STR: number; DIS: number };
}

export interface ActiveDuelSummary {
  id: string;
  opponentUsername: string | null;
  myScore: number;
  opponentScore: number;
  endsAt: string | null;
}

export interface TrackerSnapshot {
  profile: TrackerProfile;
  dailyQuests: TrackerQuest[];
  weeklyQuests: TrackerQuest[];
  weekStart: string; // YYYY-MM-DD (Monday)
  today: string;     // YYYY-MM-DD (logical local date)
  weeklyCompletionPct: number;  // 0..1, current week
  weeklyCompleted: number;
  weeklyTotal: number;
  activeDuel?: ActiveDuelSummary | null;
}
