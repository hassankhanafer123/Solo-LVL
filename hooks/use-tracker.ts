'use client';

import { useState, useTransition, useCallback } from 'react';
import { toast } from 'sonner';
import type { TrackerSnapshot } from '@/lib/tracker/types';
import type { PlanRowInput } from '@/lib/tracker/plan-reconcile';
import { useTrackerApi } from '@/lib/demo/context';

export function useTracker(initial: TrackerSnapshot) {
  const api = useTrackerApi();
  const [snapshot, setSnapshot] = useState(initial);
  const [, startTransition] = useTransition();

  const run = useCallback(
    (optimistic: TrackerSnapshot, action: () => Promise<TrackerSnapshot>) => {
      const prev = snapshot;
      setSnapshot(optimistic);
      startTransition(async () => {
        try {
          setSnapshot(await action());
        } catch {
          setSnapshot(prev);
          toast.error("Couldn't save — reverted.");
        }
      });
    },
    [snapshot],
  );

  const setProgress = useCallback((instanceId: string, actual: number) => {
    const a = Math.max(0, actual);
    const optimistic = {
      ...snapshot,
      dailyQuests: snapshot.dailyQuests.map((q) =>
        q.instanceId === instanceId
          ? { ...q, actualValue: a, completed: q.targetValue != null ? a >= q.targetValue : q.completed }
          : q),
    };
    run(optimistic, () => api.setQuestProgress(instanceId, a));
  }, [snapshot, run, api]);

  const complete = useCallback((instanceId: string) => {
    const optimistic = {
      ...snapshot,
      dailyQuests: snapshot.dailyQuests.map((q) =>
        q.instanceId === instanceId ? { ...q, completed: true } : q),
    };
    run(optimistic, () => api.completeQuest(instanceId));
  }, [snapshot, run, api]);

  const uncomplete = useCallback((instanceId: string) => {
    const optimistic = {
      ...snapshot,
      dailyQuests: snapshot.dailyQuests.map((q) =>
        q.instanceId === instanceId ? { ...q, completed: false } : q),
    };
    run(optimistic, () => api.uncompleteQuest(instanceId));
  }, [snapshot, run, api]);

  const setWeekly = useCallback((weeklyInstanceId: string, actual: number) => {
    const optimistic = {
      ...snapshot,
      weeklyQuests: snapshot.weeklyQuests.map((q) =>
        q.instanceId === weeklyInstanceId ? { ...q, actualValue: Math.max(0, actual) } : q),
    };
    run(optimistic, () => api.setWeeklyProgress(weeklyInstanceId, actual));
  }, [snapshot, run, api]);

  const planWeek = useCallback((rows: PlanRowInput[]) => {
    startTransition(async () => {
      try { setSnapshot(await api.planWeek(rows)); }
      catch { toast.error("Couldn't save your plan — try again."); }
    });
  }, [api]);

  return { snapshot, setProgress, complete, uncomplete, setWeekly, planWeek };
}
