import type { LeaderboardView } from '@/lib/api/types';
import { DEMO_USERNAME } from './seed';

export const DEMO_LEADERBOARD: LeaderboardView = {
  optedIn: true,
  myUsername: DEMO_USERNAME,
  entries: [
    { username: 'ShadowMonarch', level: 42, totalXp: 88210, rank: 1 },
    { username: 'IronWill', level: 31, totalXp: 51840, rank: 2 },
    { username: 'DawnRunner', level: 24, totalXp: 33120, rank: 3 },
    { username: 'NoZeroDays', level: 18, totalXp: 19880, rank: 4 },
    { username: DEMO_USERNAME, level: 7, totalXp: 2200, rank: 5 },
    { username: 'QuietGrind', level: 6, totalXp: 1740, rank: 6 },
    { username: 'Sisyphus', level: 4, totalXp: 980, rank: 7 },
  ],
};
