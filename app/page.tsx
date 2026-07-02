import { redirect } from 'next/navigation';
import { getSnapshotServer } from '@/lib/api/server';
import { TrackerRoot } from './dashboard-client';

export default async function Page() {
  const snapshot = await getSnapshotServer();
  if (!snapshot) {
    redirect('/login');
  }
  if (!snapshot.profile.username) {
    redirect('/welcome');
  }
  return <TrackerRoot snapshot={snapshot} />;
}
