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

export interface PartyInfo {
  id: string;
  name: string;
  code: string;
  combinedXp: number;
}

export interface PartyMemberEntry {
  userId: string;
  username: string | null;
  level: number;
  totalXp: number;
  weeklyXp: number;
  duelWins: number;
  isLeader: boolean;
}

export interface FeedEventView {
  id: string;
  kind:
    | 'quest_complete'
    | 'level_up'
    | 'weekly_goal_hit'
    | 'member_joined'
    | 'duel_started'
    | 'duel_won';
  username: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface DuelEntry {
  id: string;
  status: 'pending' | 'active' | 'declined' | 'finished';
  challengerId: string;
  opponentId: string;
  challengerUsername: string | null;
  opponentUsername: string | null;
  challengerScore: number;
  opponentScore: number;
  endsAt: string | null;
  winnerId: string | null;
}

export interface PartyView {
  party: PartyInfo | null;
  members: PartyMemberEntry[];
  feed: FeedEventView[];
  duels: DuelEntry[];
  myUserId: string;
  myUsername: string | null;
}

export type PartyActionResult =
  | { ok: true; error: null; view: PartyView }
  | { ok: false; error: string; view: null };
