// Static demo party — "Shadow Monarchs". Session-local mutations only.
import type { DuelEntry, FeedEventView, PartyMemberEntry, PartyView } from '@/lib/api/types';

const NOW = Date.now();
const iso = (minsAgo: number) => new Date(NOW - minsAgo * 60_000).toISOString();

export const DEMO_MY_USER_ID = 'demo-me';

const MEMBERS: PartyMemberEntry[] = [
  { userId: 'demo-me', username: 'you_the_hunter', level: 7, totalXp: 4210, weeklyXp: 320, duelWins: 2, isLeader: true },
  { userId: 'demo-jin', username: 'jinwoo', level: 9, totalXp: 6120, weeklyXp: 280, duelWins: 4, isLeader: false },
  { userId: 'demo-cha', username: 'cha_haein', level: 8, totalXp: 5480, weeklyXp: 250, duelWins: 3, isLeader: false },
];

const FEED: FeedEventView[] = [
  { id: 'f1', kind: 'quest_complete', username: 'jinwoo', payload: { name: 'Morning run', xp: 30 }, createdAt: iso(12) },
  { id: 'f2', kind: 'duel_started', username: 'you_the_hunter', payload: {}, createdAt: iso(60) },
  { id: 'f3', kind: 'level_up', username: 'cha_haein', payload: { toLevel: 8, title: 'Elite Hunter' }, createdAt: iso(200) },
  { id: 'f4', kind: 'member_joined', username: 'cha_haein', payload: {}, createdAt: iso(2000) },
];

const DUELS: DuelEntry[] = [
  {
    id: 'd1', status: 'active', challengerId: 'demo-me', opponentId: 'demo-jin',
    challengerUsername: 'you_the_hunter', opponentUsername: 'jinwoo',
    challengerScore: 320, opponentScore: 280,
    endsAt: new Date(NOW + 2 * 86_400_000).toISOString(), winnerId: null,
  },
];

export function buildDemoParty(): PartyView {
  return {
    party: { id: 'demo-party', name: 'Shadow Monarchs', code: 'DEMO42', combinedXp: 15810 },
    members: [...MEMBERS], feed: [...FEED], duels: [...DUELS],
    myUserId: DEMO_MY_USER_ID,
    myUsername: 'you_the_hunter',
  };
}
