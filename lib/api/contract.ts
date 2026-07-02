// lib/api/contract.ts
import type {
  LeaderboardView,
  PlanRowInput,
  SetUsernameResult,
  TrackerSnapshot,
} from '@/lib/api/types';

/** The behaviour the tracker UI depends on. Live client (Python backend) and
 *  the in-browser demo both implement this so the shells are backend-agnostic. */
export interface TrackerApi {
  getSnapshot(): Promise<TrackerSnapshot>;
  setUsername(username: string): Promise<SetUsernameResult>;
  setQuestProgress(instanceId: string, actualValue: number): Promise<TrackerSnapshot>;
  completeQuest(instanceId: string): Promise<TrackerSnapshot>;
  uncompleteQuest(instanceId: string): Promise<TrackerSnapshot>;
  setWeeklyProgress(weeklyInstanceId: string, actualValue: number): Promise<TrackerSnapshot>;
  getLeaderboard(): Promise<LeaderboardView>;
  joinLeaderboard(): Promise<LeaderboardView>;
  leaveLeaderboard(): Promise<LeaderboardView>;
  planWeek(rows: PlanRowInput[]): Promise<TrackerSnapshot>;
}
