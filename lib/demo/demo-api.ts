import type { TrackerApi } from '@/lib/api/contract';
import type {
  LeaderboardView, PartyActionResult, PartyView, PlanRowInput, SetUsernameResult, TrackerSnapshot,
} from '@/lib/api/types';
import type { TrackerQuest } from '@/lib/tracker/types';
import { computeLockedXp } from '@/lib/tracker/locked-xp';
import {
  buildDemoSnapshot, DEMO_HISTORY, DEMO_STREAK_BEST, DEMO_STREAK_CURRENT,
} from './seed';
import { deriveProfile } from './derive';
import { DEMO_LEADERBOARD } from './leaderboard-seed';
import { buildDemoParty } from './party-seed';

export const DEMO_STORAGE_KEY = 'slvl.demo';

function load(): TrackerSnapshot {
  if (typeof window === 'undefined') return buildDemoSnapshot();
  try {
    const raw = window.localStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) return buildDemoSnapshot();
    const parsed = JSON.parse(raw) as TrackerSnapshot;
    if (!parsed?.dailyQuests || !parsed?.profile) return buildDemoSnapshot();
    return parsed;
  } catch {
    return buildDemoSnapshot();
  }
}

function save(snap: TrackerSnapshot): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(snap));
  } catch {
    /* private-mode / quota — demo still works in-memory */
  }
}

function recompute(snap: TrackerSnapshot): TrackerSnapshot {
  const profile = deriveProfile({
    history: DEMO_HISTORY,
    streakCurrent: DEMO_STREAK_CURRENT,
    streakBest: DEMO_STREAK_BEST,
    displayName: snap.profile.displayName,
    username: snap.profile.username,
    dailyQuests: snap.dailyQuests,
    weeklyQuests: snap.weeklyQuests,
  });
  const all = [...snap.dailyQuests, ...snap.weeklyQuests];
  const weeklyTotal = all.length;
  const weeklyCompleted = all.filter((q) => q.completed).length;
  return {
    ...snap,
    profile,
    weeklyTotal,
    weeklyCompleted,
    weeklyCompletionPct: weeklyTotal ? weeklyCompleted / weeklyTotal : 0,
  };
}

function mapQuest(snap: TrackerSnapshot, id: string, fn: (q: TrackerQuest) => TrackerQuest): TrackerSnapshot {
  return {
    ...snap,
    dailyQuests: snap.dailyQuests.map((q) => (q.instanceId === id ? fn(q) : q)),
    weeklyQuests: snap.weeklyQuests.map((q) => (q.instanceId === id ? fn(q) : q)),
  };
}

export interface DemoApi extends TrackerApi {
  reset(): TrackerSnapshot;
}

export function createDemoApi(): DemoApi {
  let snap = load();
  let demoParty: PartyView = buildDemoParty();

  const commit = (next: TrackerSnapshot): TrackerSnapshot => {
    snap = recompute(next);
    save(snap);
    return snap;
  };

  return {
    getSnapshot: async () => snap,
    setUsername: async (username: string): Promise<SetUsernameResult> => {
      snap = recompute({ ...snap, profile: { ...snap.profile, username, displayName: username } });
      save(snap);
      return { ok: true };
    },
    setQuestProgress: async (id, actual) =>
      commit(mapQuest(snap, id, (q) => ({
        ...q,
        actualValue: Math.max(0, actual),
        completed: q.targetValue != null ? Math.max(0, actual) >= q.targetValue : q.completed,
      }))),
    completeQuest: async (id) => commit(mapQuest(snap, id, (q) => ({ ...q, completed: true }))),
    uncompleteQuest: async (id) => commit(mapQuest(snap, id, (q) => ({ ...q, completed: false }))),
    setWeeklyProgress: async (id, actual) =>
      commit(mapQuest(snap, id, (q) => ({
        ...q,
        actualValue: Math.max(0, actual),
        completed: q.targetValue != null ? Math.max(0, actual) >= q.targetValue : q.completed,
      }))),
    getLeaderboard: async (): Promise<LeaderboardView> => DEMO_LEADERBOARD,
    joinLeaderboard: async (): Promise<LeaderboardView> => DEMO_LEADERBOARD,
    leaveLeaderboard: async (): Promise<LeaderboardView> => ({ ...DEMO_LEADERBOARD, optedIn: false }),
    planWeek: async (rows: PlanRowInput[]) => {
      const toQuest = (r: PlanRowInput): TrackerQuest => {
        const prev = [...snap.dailyQuests, ...snap.weeklyQuests].find((q) => q.instanceId === r.id);
        return {
          instanceId: r.id ?? `demo-${r.sort_order}-${Math.random().toString(36).slice(2, 8)}`,
          templateId: null,
          name: r.name,
          stat: r.primary_stat,
          completionType: r.completion_type,
          targetValue: r.target_value,
          actualValue: prev?.actualValue ?? 0,
          baseXp: computeLockedXp({ completion_type: r.completion_type, target_value: r.target_value, cadence: r.cadence }),
          xpAwarded: 0,
          isRequired: r.is_required,
          isPenalty: false,
          completed: prev?.completed ?? false,
          cadence: r.cadence,
        };
      };
      const quests = rows.map(toQuest);
      return commit({
        ...snap,
        dailyQuests: quests.filter((q) => q.cadence === 'daily'),
        weeklyQuests: quests.filter((q) => q.cadence === 'weekly'),
      });
    },
    reset: () => {
      snap = buildDemoSnapshot();
      save(snap);
      return snap;
    },

    getParty: async () => demoParty,

    createParty: async (name: string): Promise<PartyActionResult> => {
      demoParty = { ...buildDemoParty(), party: { ...buildDemoParty().party!, name } };
      return { ok: true as const, error: null, view: demoParty };
    },

    joinParty: async (): Promise<PartyActionResult> => ({ ok: true as const, error: null, view: demoParty }),

    leaveParty: async () => {
      demoParty = { party: null, members: [], feed: [], duels: [], myUserId: 'demo-me', myUsername: 'you_the_hunter' };
      return demoParty;
    },

    challengeDuel: async (opponentId: string): Promise<PartyActionResult> => {
      const opp = demoParty.members.find((m) => m.userId === opponentId);
      const duel = {
        id: `d-${Date.now()}`, status: 'pending' as const,
        challengerId: 'demo-me', opponentId,
        challengerUsername: 'you_the_hunter', opponentUsername: opp?.username ?? null,
        challengerScore: 0, opponentScore: 0, endsAt: null, winnerId: null,
      };
      demoParty = { ...demoParty, duels: [duel, ...demoParty.duels] };
      return { ok: true as const, error: null, view: demoParty };
    },

    acceptDuel: async () => demoParty,
    declineDuel: async (duelId: string) => {
      demoParty = { ...demoParty, duels: demoParty.duels.filter((d) => d.id !== duelId) };
      return demoParty;
    },
  };
}
