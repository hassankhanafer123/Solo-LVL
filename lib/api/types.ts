// Shared API contract types for the Python (FastAPI) backend.
// Snapshot/quest/profile shapes are re-exported from the existing tracker
// types so the UI keeps one source of truth; the leaderboard shapes (which
// used to live in the now-retired server action file) are defined here.

export type { TrackerSnapshot, TrackerQuest, TrackerProfile } from '@/lib/tracker/types';
export type { PlanRowInput } from '@/lib/tracker/plan-reconcile';

export interface LeaderboardEntry {
  username: string;
  level: number;
  totalXp: number;
  rank: number;
}

export interface LeaderboardView {
  entries: LeaderboardEntry[];
  myUsername: string | null;
  optedIn: boolean;
}

export type SetUsernameResult = { ok: true } | { ok: false; error: string };
