'use client';

import { useState, useTransition, useCallback } from 'react';
import { toast } from 'sonner';
import type { TrackerSnapshot } from '@/lib/tracker/types';
import type { PlanRowInput } from '@/lib/tracker/plan-reconcile';
import {
  setQuestProgress, completeQuest, uncompleteQuest, setWeeklyProgress,
  planWeek as planWeekAction,
} from '@/app/actions/tracker';

export function useTracker(initial: TrackerSnapshot) {
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
    run(optimistic, () => setQuestProgress(instanceId, a));
  }, [snapshot, run]);

  const complete = useCallback((instanceId: string) => {
    const optimistic = {
      ...snapshot,
      dailyQuests: snapshot.dailyQuests.map((q) =>
        q.instanceId === instanceId ? { ...q, completed: true } : q),
    };
    run(optimistic, () => completeQuest(instanceId));
  }, [snapshot, run]);

  const uncomplete = useCallback((instanceId: string) => {
    const optimistic = {
      ...snapshot,
      dailyQuests: snapshot.dailyQuests.map((q) =>
        q.instanceId === instanceId ? { ...q, completed: false } : q),
    };
    run(optimistic, () => uncompleteQuest(instanceId));
  }, [snapshot, run]);

  const setWeekly = useCallback((weeklyInstanceId: string, actual: number) => {
    const optimistic = {
      ...snapshot,
      weeklyQuests: snapshot.weeklyQuests.map((q) =>
        q.instanceId === weeklyInstanceId ? { ...q, actualValue: Math.max(0, actual) } : q),
    };
    run(optimistic, () => setWeeklyProgress(weeklyInstanceId, actual));
  }, [snapshot, run]);

  const planWeek = useCallback((rows: PlanRowInput[]) => {
    startTransition(async () => {
      try { setSnapshot(await planWeekAction(rows)); }
      catch { toast.error("Couldn't save your plan — try again."); }
    });
  }, []);

  return { snapshot, setProgress, complete, uncomplete, setWeekly, planWeek };
}
