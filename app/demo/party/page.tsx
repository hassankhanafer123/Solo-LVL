'use client';
import { useRef } from 'react';
import { PartyClient } from '@/app/party/party-client';
import { buildDemoParty } from '@/lib/demo/party-seed';
import { TrackerApiProvider } from '@/lib/demo/context';
import { createDemoApi } from '@/lib/demo/demo-api';

export default function DemoPartyPage() {
  const apiRef = useRef(createDemoApi());

  return (
    <TrackerApiProvider api={apiRef.current} demo>
      <PartyClient view={buildDemoParty()} />
    </TrackerApiProvider>
  );
}
