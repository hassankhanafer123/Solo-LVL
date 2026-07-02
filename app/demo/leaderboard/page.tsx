'use client';
import { LeaderboardClient } from '@/app/leaderboard/leaderboard-client';
import { DEMO_LEADERBOARD } from '@/lib/demo/leaderboard-seed';

export default function DemoLeaderboardPage() {
  return <LeaderboardClient view={DEMO_LEADERBOARD} />;
}
