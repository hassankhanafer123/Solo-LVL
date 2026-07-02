'use client';
import { useEffect, useRef, useState } from 'react';
import { TrackerApiProvider } from '@/lib/demo/context';
import { createDemoApi } from '@/lib/demo/demo-api';
import { TrackerRoot } from '@/app/dashboard-client';
import { DemoBanner } from '@/components/demo/demo-banner';
import type { TrackerSnapshot } from '@/lib/tracker/types';

export default function DemoPage() {
  const apiRef = useRef(createDemoApi());
  const [snapshot, setSnapshot] = useState<TrackerSnapshot | null>(null);
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    apiRef.current.getSnapshot().then(setSnapshot);
  }, []);

  function handleReset() {
    setSnapshot(apiRef.current.reset());
    setResetKey((k) => k + 1);
  }

  if (!snapshot) return <div className="min-h-[100svh] bg-slate-950" />;

  return (
    <TrackerApiProvider api={apiRef.current} demo>
      <DemoBanner onReset={handleReset} />
      <TrackerRoot key={resetKey} snapshot={snapshot} />
    </TrackerApiProvider>
  );
}
