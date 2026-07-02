'use client';

// Browser API client for the Python (FastAPI) backend.
//
// Replaces the direct server-action imports the UI used to make. Every call
// attaches the current Supabase access token as a Bearer header so the API
// validates the user and RLS applies. Methods mirror the 10 server actions
// 1:1 and return the same shapes the components already consume.

import { createClient } from '@/lib/supabase/client';
import type { TrackerApi } from '@/lib/api/contract';
import type {
  LeaderboardView,
  PartyActionResult,
  PartyView,
  PlanRowInput,
  SetUsernameResult,
  TrackerSnapshot,
} from '@/lib/api/types';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

async function authHeaders(): Promise<HeadersInit> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not authenticated');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    throw new Error(`API ${init?.method ?? 'GET'} ${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api: TrackerApi = {
  getSnapshot: () => request<TrackerSnapshot>('/api/snapshot'),

  setUsername: (username: string) =>
    request<SetUsernameResult>('/api/username', {
      method: 'POST',
      body: JSON.stringify({ username }),
    }),

  setQuestProgress: (instanceId: string, actualValue: number) =>
    request<TrackerSnapshot>(`/api/quests/${instanceId}/progress`, {
      method: 'POST',
      body: JSON.stringify({ actualValue }),
    }),

  completeQuest: (instanceId: string) =>
    request<TrackerSnapshot>(`/api/quests/${instanceId}/complete`, { method: 'POST' }),

  uncompleteQuest: (instanceId: string) =>
    request<TrackerSnapshot>(`/api/quests/${instanceId}/uncomplete`, { method: 'POST' }),

  setWeeklyProgress: (weeklyInstanceId: string, actualValue: number) =>
    request<TrackerSnapshot>(`/api/weekly/${weeklyInstanceId}/progress`, {
      method: 'POST',
      body: JSON.stringify({ actualValue }),
    }),

  getLeaderboard: () => request<LeaderboardView>('/api/leaderboard'),

  joinLeaderboard: () =>
    request<LeaderboardView>('/api/leaderboard/join', { method: 'POST' }),

  leaveLeaderboard: () =>
    request<LeaderboardView>('/api/leaderboard/leave', { method: 'POST' }),

  planWeek: (rows: PlanRowInput[]) =>
    request<TrackerSnapshot>('/api/plan', {
      method: 'POST',
      body: JSON.stringify({ rows }),
    }),

  getParty: () => request<PartyView>('/api/party'),

  createParty: (name: string) =>
    request<PartyActionResult>('/api/party', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  joinParty: (code: string) =>
    request<PartyActionResult>('/api/party/join', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  leaveParty: () => request<PartyView>('/api/party/leave', { method: 'POST' }),

  challengeDuel: (opponentId: string) =>
    request<PartyActionResult>('/api/duels', {
      method: 'POST',
      body: JSON.stringify({ opponentId }),
    }),

  acceptDuel: (duelId: string) =>
    request<PartyView>(`/api/duels/${duelId}/accept`, { method: 'POST' }),

  declineDuel: (duelId: string) =>
    request<PartyView>(`/api/duels/${duelId}/decline`, { method: 'POST' }),
};
