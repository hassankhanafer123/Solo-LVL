import { redirect } from 'next/navigation';
import { getPartyServer } from '@/lib/api/server';
import { PartyClient } from './party-client';

export default async function PartyPage() {
  const view = await getPartyServer();
  if (!view) {
    redirect('/login');
  }
  return <PartyClient view={view} />;
}
