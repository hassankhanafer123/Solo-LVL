import { redirect } from 'next/navigation';
import { getLeaderboard } from '@/app/actions/tracker';
import { LeaderboardClient } from './leaderboard-client';

export default async function LeaderboardPage() {
  const view = await getLeaderboard();
  if (view.myUsername === null) {
    redirect('/welcome');
  }
  return <LeaderboardClient view={view} />;
}
