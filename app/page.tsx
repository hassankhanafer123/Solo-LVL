import { redirect } from 'next/navigation';
import { getTodaySnapshot } from '@/app/actions/tracker';
import { TrackerRoot } from './dashboard-client';

export default async function Page() {
  const snapshot = await getTodaySnapshot();
  if (!snapshot.profile.username) {
    redirect('/welcome');
  }
  return <TrackerRoot snapshot={snapshot} />;
}
