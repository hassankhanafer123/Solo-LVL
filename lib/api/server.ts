// Server-side API client for the Python (FastAPI) backend.
// Server-only by construction: it imports `@/lib/supabase/server`, which uses
// next/headers and therefore cannot be pulled into a client component.
//
// Used by Server Components for the initial render. The Next server holds the
// Supabase session in cookies; we read the access token from it and forward it
// to the Python API as a Bearer header, so the API still validates the user and
// RLS applies. All game logic lives in Python — Next is just a thin proxy here.

import { createClient } from '@/lib/supabase/server';
import type { LeaderboardView, PartyView, TrackerSnapshot } from '@/lib/api/types';

// Server→server, so a private API_URL can override the public one if needed.
const BASE =
  process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

async function token(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function getJson<T>(path: string): Promise<T | null> {
  const t = await token();
  if (!t) return null;
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${t}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`API GET ${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/** Initial dashboard snapshot. Returns null when there is no session. */
export function getSnapshotServer(): Promise<TrackerSnapshot | null> {
  return getJson<TrackerSnapshot>('/api/snapshot');
}

/** Initial leaderboard view. Returns null when there is no session. */
export function getLeaderboardServer(): Promise<LeaderboardView | null> {
  return getJson<LeaderboardView>('/api/leaderboard');
}

/** Initial party view. Returns null when there is no session. */
export function getPartyServer(): Promise<PartyView | null> {
  return getJson<PartyView>('/api/party');
}
