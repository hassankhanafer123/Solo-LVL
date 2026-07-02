// lib/demo/context.tsx
'use client';
import { createContext, useContext } from 'react';
import { api as liveApi } from '@/lib/api/client';
import type { TrackerApi } from '@/lib/api/contract';

interface TrackerContextValue {
  api: TrackerApi;
  demo: boolean;
}

const TrackerApiContext = createContext<TrackerContextValue>({ api: liveApi, demo: false });

export function TrackerApiProvider({
  api,
  demo = false,
  children,
}: {
  api: TrackerApi;
  demo?: boolean;
  children: React.ReactNode;
}) {
  return (
    <TrackerApiContext.Provider value={{ api, demo }}>{children}</TrackerApiContext.Provider>
  );
}

export function useTrackerApi(): TrackerApi {
  return useContext(TrackerApiContext).api;
}

export function useIsDemo(): boolean {
  return useContext(TrackerApiContext).demo;
}
