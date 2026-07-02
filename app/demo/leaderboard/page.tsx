'use client';
import { useRef } from 'react';
import { LeaderboardClient } from '@/app/leaderboard/leaderboard-client';
import { DEMO_LEADERBOARD } from '@/lib/demo/leaderboard-seed';
import { TrackerApiProvider } from '@/lib/demo/context';
import { createDemoApi } from '@/lib/demo/demo-api';

export default function DemoLeaderboardPage() {
  const apiRef = useRef(createDemoApi());

  return (
    <TrackerApiProvider api={apiRef.current} demo>
      <LeaderboardClient view={DEMO_LEADERBOARD} />
    </TrackerApiProvider>
  );
}
