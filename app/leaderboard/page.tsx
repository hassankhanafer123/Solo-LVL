import { redirect } from 'next/navigation';
import { getLeaderboardServer } from '@/lib/api/server';
import { LeaderboardClient } from './leaderboard-client';

export default async function LeaderboardPage() {
  const view = await getLeaderboardServer();
  if (!view) {
    redirect('/login');
  }
  if (view.myUsername === null) {
    redirect('/welcome');
  }
  return <LeaderboardClient view={view} />;
}
