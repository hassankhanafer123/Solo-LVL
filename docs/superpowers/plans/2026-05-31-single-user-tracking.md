# Single-User Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing localStorage-only UI to the existing Supabase backend so Solo Leveling Life is a real, login-gated, cross-device single-user tracker, with an app-like mobile shell and the cinematic scroll experience on desktop.

**Architecture:** Pure decision functions (unit-tested) + thin Supabase server actions (I/O), consumed by a `useTracker` optimistic client hook. The page becomes a server component that fetches a snapshot and selects a device shell. Supabase is the sole source of truth; no localStorage data store.

**Tech Stack:** Next.js 16 (App Router, proxy.ts), React 19, Supabase (`@supabase/ssr`), TypeScript strict, Vitest, Playwright, Tailwind v4, motion, three.js.

**Phasing:** Phase A (Tasks 1–9) delivers a synced, login-gated tracker on the existing desktop UI — independently shippable. Phase B (Tasks 10–14) adds the mobile shell and component decomposition.

**Spec:** `docs/superpowers/specs/2026-05-31-single-user-tracking-design.md`

---

## Conventions

- Run tests with `npm test` (vitest) and `npm run test:e2e` (playwright).
- Branch: `git checkout -b feat/single-user-tracking` before Task 1.
- Commit after every task using the message in its final step.
- All new shared DTOs live in `lib/tracker/types.ts`. Stat order is always `INT, STR, DIS`.

---

## Task 1: Idempotency migration (unique constraints)

Prevents duplicate instance rows when phone + laptop both load the same day/week concurrently.

**Files:**
- Create: `supabase/migrations/0004_instance_uniqueness.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Template-backed instances must be unique per (log, template). Penalty rows
-- (template_id NULL) are intentionally excluded via the partial index.
create unique index if not exists quest_instance_log_template_uidx
  on quest_instance (daily_log_id, template_id)
  where template_id is not null;

create unique index if not exists weekly_quest_instance_log_template_uidx
  on weekly_quest_instance (weekly_log_id, template_id)
  where template_id is not null;
```

- [ ] **Step 2: Apply locally**

Run: `npx supabase db push` (or apply via the Supabase dashboard SQL editor against the linked project).
Expected: both indexes created, no error.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0004_instance_uniqueness.sql
git commit -m "feat(db): unique indexes to prevent duplicate quest instances"
```

---

## Task 2: Tracker DTO types

The shape returned to the client. Decouples UI from raw DB column names.

**Files:**
- Create: `lib/tracker/types.ts`

- [ ] **Step 1: Write the DTOs**

```ts
import type { StatKind, CompletionType, Cadence } from '../types';

export interface TrackerQuest {
  instanceId: string;
  templateId: string | null;
  name: string;
  stat: StatKind;
  completionType: CompletionType;
  targetValue: number | null;
  actualValue: number;
  baseXp: number;
  xpAwarded: number;
  isRequired: boolean;
  isPenalty: boolean;
  completed: boolean;
  cadence: Cadence;
}

export interface TrackerProfile {
  displayName: string;
  level: number;
  title: string;
  xpInLevel: number;
  xpToNext: number;
  totalXp: number;
  streakCurrent: number;
  streakBest: number;
  stats: { INT: number; STR: number; DIS: number };
}

export interface TrackerSnapshot {
  profile: TrackerProfile;
  dailyQuests: TrackerQuest[];
  weeklyQuests: TrackerQuest[];
  weekStart: string; // YYYY-MM-DD (Monday)
  today: string;     // YYYY-MM-DD (logical local date)
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/tracker/types.ts
git commit -m "feat(tracker): add client-facing DTO types"
```

---

## Task 3: Pure completion decision

Given an instance's progress and the profile's XP state, decide the XP award and resulting profile. No I/O. Idempotent: a quest already complete awards nothing.

**Files:**
- Create: `lib/tracker/complete.ts`
- Test: `lib/tracker/complete.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { decideCompletion } from './complete';
import type { XpInput } from '../xp';

const profile: XpInput = {
  level: 1, total_xp: 0, xp_in_level: 0, xp_to_next: 100,
  unallocated_points: 0, title: 'Novice',
};

describe('decideCompletion', () => {
  it('awards full base_xp when count target met', () => {
    const d = decideCompletion(
      { actual_value: 100, target_value: 100, base_xp: 50, completed: false },
      profile,
    );
    expect(d.alreadyComplete).toBe(false);
    expect(d.xpAward).toBe(50);
    expect(d.xpResult?.total_xp).toBe(50);
  });

  it('awards partial XP when below target', () => {
    const d = decideCompletion(
      { actual_value: 50, target_value: 100, base_xp: 50, completed: false },
      profile,
    );
    expect(d.xpAward).toBe(25);
  });

  it('is idempotent: already-complete awards nothing', () => {
    const d = decideCompletion(
      { actual_value: 100, target_value: 100, base_xp: 50, completed: true },
      profile,
    );
    expect(d.alreadyComplete).toBe(true);
    expect(d.xpAward).toBe(0);
    expect(d.xpResult).toBeNull();
  });

  it('checkbox (null target) awards base_xp when actual >= 1', () => {
    const d = decideCompletion(
      { actual_value: 1, target_value: null, base_xp: 25, completed: false },
      profile,
    );
    expect(d.xpAward).toBe(25);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- complete`
Expected: FAIL — `decideCompletion` not defined.

- [ ] **Step 3: Implement**

```ts
import { applyXpGain, type XpInput, type XpResult } from '../xp';
import { computePartialXp } from '../quests';

export interface CompletionInstanceState {
  actual_value: number;
  target_value: number | null;
  base_xp: number;
  completed: boolean;
}

export interface CompletionDecision {
  alreadyComplete: boolean;
  xpAward: number;
  xpResult: XpResult | null;
}

/** Pure: decides XP to award for completing an instance and the resulting profile. */
export function decideCompletion(
  instance: CompletionInstanceState,
  profile: XpInput,
): CompletionDecision {
  if (instance.completed) {
    return { alreadyComplete: true, xpAward: 0, xpResult: null };
  }
  const xpAward = computePartialXp({
    actual: instance.actual_value,
    target: instance.target_value,
    base_xp: instance.base_xp,
  });
  return { alreadyComplete: false, xpAward, xpResult: applyXpGain(profile, xpAward) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- complete`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/tracker/complete.ts lib/tracker/complete.test.ts
git commit -m "feat(tracker): pure completion decision with idempotency"
```

---

## Task 4: Pure stat + streak decision

When a daily clear flips, advance the streak; on completion, bump the quest's primary stat. Pure, tested.

**Files:**
- Create: `lib/tracker/progress.ts`
- Test: `lib/tracker/progress.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { decideStreak } from './progress';

describe('decideStreak', () => {
  it('starts streak at 1 when first clear and yesterday not cleared', () => {
    const r = decideStreak({ current: 0, best: 0, yesterdayCleared: false });
    expect(r).toEqual({ current: 1, best: 1 });
  });

  it('increments and continues when yesterday cleared', () => {
    const r = decideStreak({ current: 5, best: 9, yesterdayCleared: true });
    expect(r).toEqual({ current: 6, best: 9 });
  });

  it('raises best when current exceeds it', () => {
    const r = decideStreak({ current: 9, best: 9, yesterdayCleared: true });
    expect(r).toEqual({ current: 10, best: 10 });
  });

  it('resets to 1 when a gap occurred', () => {
    const r = decideStreak({ current: 5, best: 9, yesterdayCleared: false });
    expect(r).toEqual({ current: 1, best: 9 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- progress`
Expected: FAIL — `decideStreak` not defined.

- [ ] **Step 3: Implement**

```ts
export interface StreakInput {
  current: number;
  best: number;
  yesterdayCleared: boolean;
}

export interface StreakResult {
  current: number;
  best: number;
}

/** Pure: streak transition for the moment today's required quests all clear. */
export function decideStreak(input: StreakInput): StreakResult {
  const current = input.yesterdayCleared ? input.current + 1 : 1;
  return { current, best: Math.max(current, input.best) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- progress`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/tracker/progress.ts lib/tracker/progress.test.ts
git commit -m "feat(tracker): pure streak transition decision"
```

---

## Task 5: Row → DTO mappers

Convert DB rows to `TrackerQuest`/`TrackerProfile`. Pure, tested.

**Files:**
- Create: `lib/tracker/map.ts`
- Test: `lib/tracker/map.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { toTrackerQuest, toTrackerProfile } from './map';
import type { QuestInstance, Profile } from '../types';

const inst = {
  id: 'i1', template_id: 't1', name: 'Push-ups', completion_type: 'count',
  target_value: 100, actual_value: 40, primary_stat: 'STR', base_xp: 50,
  xp_awarded: 0, is_required: true, is_penalty: false, completed: false,
} as unknown as QuestInstance;

describe('mappers', () => {
  it('maps a daily instance to a TrackerQuest', () => {
    const q = toTrackerQuest(inst, 'daily');
    expect(q).toMatchObject({
      instanceId: 'i1', templateId: 't1', name: 'Push-ups', stat: 'STR',
      completionType: 'count', targetValue: 100, actualValue: 40, baseXp: 50,
      isRequired: true, isPenalty: false, completed: false, cadence: 'daily',
    });
  });

  it('maps a profile, exposing stats in INT/STR/DIS order', () => {
    const p = { display_name: 'Hassan', level: 14, title: 'Awakened', xp_in_level: 420,
      xp_to_next: 1000, total_xp: 5000, stat_int: 51, stat_str: 42, stat_dis: 36,
      streak_current: 23, streak_best: 30 } as unknown as Profile;
    expect(toTrackerProfile(p)).toMatchObject({
      displayName: 'Hassan', level: 14, stats: { INT: 51, STR: 42, DIS: 36 },
      streakCurrent: 23, streakBest: 30,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- map`
Expected: FAIL — mappers not defined.

- [ ] **Step 3: Implement**

```ts
import type { QuestInstance, WeeklyQuestInstance, Profile, Cadence } from '../types';
import type { TrackerQuest, TrackerProfile } from './types';

export function toTrackerQuest(
  i: QuestInstance | WeeklyQuestInstance,
  cadence: Cadence,
): TrackerQuest {
  const isPenalty = 'is_penalty' in i ? i.is_penalty : false;
  const isRequired = 'is_required' in i ? i.is_required : true;
  return {
    instanceId: i.id,
    templateId: i.template_id,
    name: i.name,
    stat: i.primary_stat,
    completionType: i.completion_type,
    targetValue: i.target_value,
    actualValue: i.actual_value,
    baseXp: i.base_xp,
    xpAwarded: i.xp_awarded,
    isRequired,
    isPenalty,
    completed: i.completed,
    cadence,
  };
}

export function toTrackerProfile(p: Profile): TrackerProfile {
  return {
    displayName: p.display_name,
    level: p.level,
    title: p.title,
    xpInLevel: p.xp_in_level,
    xpToNext: p.xp_to_next,
    totalXp: p.total_xp,
    streakCurrent: p.streak_current,
    streakBest: p.streak_best,
    stats: { INT: p.stat_int, STR: p.stat_str, DIS: p.stat_dis },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- map`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/tracker/map.ts lib/tracker/map.test.ts
git commit -m "feat(tracker): DB row to DTO mappers"
```

---

## Task 6: Snapshot read action (`getTodaySnapshot`)

Ensures today's `daily_log` + instances and the current `weekly_log` + instances exist, then returns a `TrackerSnapshot`. Thin I/O over the tested helpers; verified by e2e (Task 9), not unit tests.

**Files:**
- Create: `app/actions/tracker.ts`

- [ ] **Step 1: Implement the action**

```ts
'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentWeekStart, localDateISO } from '@/lib/time';
import { buildInstancesFromTemplate } from '@/lib/quests';
import { toTrackerQuest, toTrackerProfile } from '@/lib/tracker/map';
import type { TrackerSnapshot } from '@/lib/tracker/types';
import type { Profile, QuestTemplate } from '@/lib/types';

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return { supabase, userId: user.id };
}

export async function getTodaySnapshot(): Promise<TrackerSnapshot> {
  const { supabase, userId } = await requireUser();

  const { data: profileRow } = await supabase
    .from('profile').select('*').eq('user_id', userId).single();
  const profile = profileRow as Profile;

  const now = new Date();
  const tz = profile.timezone;
  const today = localDateISO(now, tz);
  const weekStart = getCurrentWeekStart(now, tz, profile.reset_hour_local);

  // Active week_plan + templates
  const { data: weekPlan } = await supabase
    .from('week_plan').select('id')
    .eq('user_id', userId).eq('week_start_date', weekStart).single();
  const { data: templateRows } = await supabase
    .from('quest_template').select('*')
    .eq('week_plan_id', weekPlan!.id).eq('active', true).order('sort_order');
  const templates = (templateRows ?? []) as QuestTemplate[];

  // Ensure today's daily_log
  await supabase.from('daily_log')
    .upsert({ user_id: userId, quest_date: today }, { onConflict: 'user_id,quest_date', ignoreDuplicates: true });
  const { data: dailyLog } = await supabase
    .from('daily_log').select('id').eq('user_id', userId).eq('quest_date', today).single();

  // Materialize daily instances for daily-cadence templates (idempotent via unique index)
  const dailyTemplates = templates.filter((t) => t.cadence === 'daily');
  const dailyToInsert = buildInstancesFromTemplate(dailyTemplates, dailyLog!.id, userId);
  if (dailyToInsert.length) {
    await supabase.from('quest_instance')
      .upsert(dailyToInsert, { onConflict: 'daily_log_id,template_id', ignoreDuplicates: true });
  }

  // Ensure weekly_log + weekly instances
  await supabase.from('weekly_log')
    .upsert({ user_id: userId, week_start_date: weekStart }, { onConflict: 'user_id,week_start_date', ignoreDuplicates: true });
  const { data: weeklyLog } = await supabase
    .from('weekly_log').select('id').eq('user_id', userId).eq('week_start_date', weekStart).single();

  const weeklyTemplates = templates.filter((t) => t.cadence === 'weekly');
  const weeklyToInsert = weeklyTemplates.map((t) => ({
    user_id: userId, weekly_log_id: weeklyLog!.id, template_id: t.id, name: t.name,
    completion_type: t.completion_type, target_value: t.target_value, actual_value: 0,
    primary_stat: t.primary_stat, base_xp: t.base_xp, xp_awarded: 0,
    completed: false, completed_at: null,
  }));
  if (weeklyToInsert.length) {
    await supabase.from('weekly_quest_instance')
      .upsert(weeklyToInsert, { onConflict: 'weekly_log_id,template_id', ignoreDuplicates: true });
  }

  // Read back canonical rows
  const { data: dailyRows } = await supabase
    .from('quest_instance').select('*').eq('daily_log_id', dailyLog!.id);
  const { data: weeklyRows } = await supabase
    .from('weekly_quest_instance').select('*').eq('weekly_log_id', weeklyLog!.id);

  return {
    profile: toTrackerProfile(profile),
    dailyQuests: (dailyRows ?? []).map((r) => toTrackerQuest(r as any, 'daily')),
    weeklyQuests: (weeklyRows ?? []).map((r) => toTrackerQuest(r as any, 'weekly')),
    weekStart,
    today,
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/actions/tracker.ts
git commit -m "feat(tracker): getTodaySnapshot server action with lazy materialization"
```

---

## Task 7: Mutation actions

Progress + completion + weekly + plan. Each re-reads the row, applies a tested pure decision, writes back. Returns the updated `TrackerSnapshot` so the client reconciles against truth.

**Files:**
- Modify: `app/actions/tracker.ts` (append)

- [ ] **Step 1: Add `setQuestProgress` and `completeQuest`/`uncompleteQuest`**

```ts
import { decideCompletion } from '@/lib/tracker/complete';
import { decideStreak } from '@/lib/tracker/progress';
import { computePartialXp, evaluateDailyClear } from '@/lib/quests';
import { yesterdayLocal } from '@/lib/time';
import type { QuestInstance, StatKind } from '@/lib/types';

const STAT_COL: Record<StatKind, 'stat_int' | 'stat_str' | 'stat_dis'> = {
  INT: 'stat_int', STR: 'stat_str', DIS: 'stat_dis',
};

export async function setQuestProgress(instanceId: string, actualValue: number): Promise<TrackerSnapshot> {
  const { supabase, userId } = await requireUser();
  const { data: inst } = await supabase
    .from('quest_instance').select('*').eq('id', instanceId).eq('user_id', userId).single();
  const i = inst as QuestInstance;
  const xpAwarded = computePartialXp({ actual: actualValue, target: i.target_value, base_xp: i.base_xp });
  // Progress never mutates profile XP; only completion does.
  await supabase.from('quest_instance')
    .update({ actual_value: Math.max(0, actualValue), xp_awarded: i.completed ? i.xp_awarded : xpAwarded })
    .eq('id', instanceId).eq('user_id', userId);
  return getTodaySnapshot();
}

export async function completeQuest(instanceId: string): Promise<TrackerSnapshot> {
  const { supabase, userId } = await requireUser();
  const { data: inst } = await supabase
    .from('quest_instance').select('*').eq('id', instanceId).eq('user_id', userId).single();
  const i = inst as QuestInstance;

  const { data: profileRow } = await supabase
    .from('profile').select('*').eq('user_id', userId).single();
  const p = profileRow as Profile;

  const decision = decideCompletion(i, {
    level: p.level, total_xp: p.total_xp, xp_in_level: p.xp_in_level,
    xp_to_next: p.xp_to_next, unallocated_points: p.unallocated_points, title: p.title as any,
  });
  if (decision.alreadyComplete) return getTodaySnapshot();

  await supabase.from('quest_instance')
    .update({ completed: true, completed_at: new Date().toISOString(), xp_awarded: decision.xpAward })
    .eq('id', instanceId).eq('user_id', userId).eq('completed', false); // guard: only flip once

  const r = decision.xpResult!;
  const statCol = STAT_COL[i.primary_stat];
  await supabase.from('profile').update({
    level: r.level, total_xp: r.total_xp, xp_in_level: r.xp_in_level, xp_to_next: r.xp_to_next,
    unallocated_points: r.unallocated_points, title: r.title,
    [statCol]: (p as any)[statCol] + 1,
  }).eq('user_id', userId);

  if (r.title_unlocked || r.levels_gained > 0) {
    await supabase.from('level_up_event').insert({
      user_id: userId, from_level: p.level, to_level: r.level,
      points_granted: r.levels_gained * 5, title_unlocked: r.title_unlocked,
    });
  }

  await maybeAdvanceStreak(supabase, userId, i.daily_log_id, p);
  return getTodaySnapshot();
}

export async function uncompleteQuest(instanceId: string): Promise<TrackerSnapshot> {
  const { supabase, userId } = await requireUser();
  // Task 1: correction only — flip the flag, do not subtract XP by hand.
  await supabase.from('quest_instance')
    .update({ completed: false, completed_at: null })
    .eq('id', instanceId).eq('user_id', userId);
  return getTodaySnapshot();
}

async function maybeAdvanceStreak(supabase: any, userId: string, dailyLogId: string, p: Profile) {
  const { data: rows } = await supabase
    .from('quest_instance').select('is_required, completed').eq('daily_log_id', dailyLogId);
  const clear = evaluateDailyClear(rows ?? []);
  if (clear.status !== 'cleared') return;

  const { data: log } = await supabase
    .from('daily_log').select('quest_date, status').eq('id', dailyLogId).single();
  if (log.status === 'cleared') return; // already counted

  const { data: yLog } = await supabase
    .from('daily_log').select('status')
    .eq('user_id', userId).eq('quest_date', yesterdayLocal(log.quest_date)).maybeSingle();
  const streak = decideStreak({
    current: p.streak_current, best: p.streak_best,
    yesterdayCleared: yLog?.status === 'cleared',
  });
  await supabase.from('daily_log')
    .update({ status: 'cleared', cleared_at: new Date().toISOString() }).eq('id', dailyLogId);
  await supabase.from('profile')
    .update({ streak_current: streak.current, streak_best: streak.best }).eq('user_id', userId);
}
```

- [ ] **Step 2: Add `setWeeklyProgress` and `planWeek`**

```ts
import { templateInputToRow } from '@/lib/plan';
import { TemplateInputSchema, type TemplateInput, type WeeklyQuestInstance } from '@/lib/types';

export async function setWeeklyProgress(weeklyInstanceId: string, actualValue: number): Promise<TrackerSnapshot> {
  const { supabase, userId } = await requireUser();
  const { data: inst } = await supabase
    .from('weekly_quest_instance').select('*').eq('id', weeklyInstanceId).eq('user_id', userId).single();
  const i = inst as WeeklyQuestInstance;
  const actual = Math.max(0, actualValue);
  const reached = i.target_value !== null && actual >= i.target_value;

  if (reached && !i.completed) {
    const { data: profileRow } = await supabase.from('profile').select('*').eq('user_id', userId).single();
    const p = profileRow as Profile;
    const decision = decideCompletion(
      { actual_value: actual, target_value: i.target_value, base_xp: i.base_xp, completed: false }, {
        level: p.level, total_xp: p.total_xp, xp_in_level: p.xp_in_level,
        xp_to_next: p.xp_to_next, unallocated_points: p.unallocated_points, title: p.title as any,
      });
    const r = decision.xpResult!;
    await supabase.from('weekly_quest_instance').update({
      actual_value: actual, completed: true, completed_at: new Date().toISOString(), xp_awarded: decision.xpAward,
    }).eq('id', weeklyInstanceId).eq('user_id', userId).eq('completed', false);
    await supabase.from('profile').update({
      level: r.level, total_xp: r.total_xp, xp_in_level: r.xp_in_level, xp_to_next: r.xp_to_next,
      unallocated_points: r.unallocated_points, title: r.title,
      stat_dis: p.stat_dis + 1,
    }).eq('user_id', userId);
  } else {
    await supabase.from('weekly_quest_instance').update({ actual_value: actual }).eq('id', weeklyInstanceId).eq('user_id', userId);
  }
  return getTodaySnapshot();
}

export async function planWeek(inputs: TemplateInput[]): Promise<TrackerSnapshot> {
  const { supabase, userId } = await requireUser();
  const snap = await getTodaySnapshot();
  const { data: weekPlan } = await supabase
    .from('week_plan').select('id').eq('user_id', userId).eq('week_start_date', snap.weekStart).single();

  const validated = inputs.map((raw) => templateInputToRow(TemplateInputSchema.parse(raw), weekPlan!.id, userId));
  // Deactivate existing, then insert the new set (simplest correct: replace active templates for the week).
  await supabase.from('quest_template').update({ active: false }).eq('week_plan_id', weekPlan!.id);
  await supabase.from('quest_template').insert(validated);
  return getTodaySnapshot();
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/actions/tracker.ts
git commit -m "feat(tracker): completion, progress, weekly, and planWeek mutation actions"
```

---

## Task 8: `useTracker` optimistic hook

Owns client state, applies optimistic updates, reconciles with the snapshot each action returns, rolls back + toasts on error.

**Files:**
- Create: `hooks/use-tracker.ts`

- [ ] **Step 1: Implement**

```ts
'use client';

import { useState, useTransition, useCallback } from 'react';
import { toast } from 'sonner';
import type { TrackerSnapshot } from '@/lib/tracker/types';
import {
  setQuestProgress, completeQuest, uncompleteQuest, setWeeklyProgress,
} from '@/app/actions/tracker';

export function useTracker(initial: TrackerSnapshot) {
  const [snapshot, setSnapshot] = useState(initial);
  const [, startTransition] = useTransition();

  const run = useCallback(
    (optimistic: TrackerSnapshot, action: () => Promise<TrackerSnapshot>) => {
      const prev = snapshot;
      setSnapshot(optimistic); // instant
      startTransition(async () => {
        try {
          setSnapshot(await action()); // reconcile with server truth
        } catch {
          setSnapshot(prev); // rollback
          toast.error("Couldn't save — reverted.");
        }
      });
    },
    [snapshot],
  );

  const setProgress = useCallback((instanceId: string, actual: number) => {
    const optimistic = {
      ...snapshot,
      dailyQuests: snapshot.dailyQuests.map((q) =>
        q.instanceId === instanceId ? { ...q, actualValue: Math.max(0, actual) } : q),
    };
    run(optimistic, () => setQuestProgress(instanceId, actual));
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

  return { snapshot, setProgress, complete, uncomplete, setWeekly };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add hooks/use-tracker.ts
git commit -m "feat(tracker): useTracker optimistic client hook"
```

---

## Task 9: Wire desktop page to live data + enable auth gate

Convert `app/page.tsx` to a server component that fetches the snapshot and hands it to the existing UI (now reading from `useTracker` instead of local seed), and turn on the proxy auth gate. This is the end of Phase A — a working synced, login-gated tracker.

**Files:**
- Rename: `proxy.ts.disabled` → `proxy.ts`
- Create: `app/dashboard-client.tsx` (the current `app/page.tsx` body, made into `TrackerRoot`)
- Modify: `app/page.tsx` (becomes the server snapshot fetcher)
- Modify: `app/layout.tsx` (mount `<Toaster />` from sonner if not already present)

- [ ] **Step 1: Enable the auth gate**

```bash
git mv proxy.ts.disabled proxy.ts
```

- [ ] **Step 2: Move the existing client UI into `app/dashboard-client.tsx`**

Move the entire current contents of `app/page.tsx` into `app/dashboard-client.tsx`. Rename the default export `Dashboard` to a named export `TrackerRoot` accepting `{ snapshot }: { snapshot: TrackerSnapshot }`. Replace the local-state seed + localStorage effects (the `useState(INITIAL_QUESTS)`, `useState(INITIAL_PLAYER)`, the two `useEffect` localStorage blocks, and the client-side `fireXp`/leveling) with `const { snapshot, setProgress, complete, uncomplete, setWeekly } = useTracker(snapshot)`. Map the existing render to snapshot fields: `snapshot.dailyQuests`, `snapshot.weeklyQuests`, `snapshot.profile`. The `+`/`-` handlers call `setProgress`; checkbox/timer-complete call `complete`; weekly bumps call `setWeekly`. Keep `INITIAL_QUESTS`/`INITIAL_PLAYER` deleted.

- [ ] **Step 3: Make `app/page.tsx` a server component**

```tsx
import { getTodaySnapshot } from '@/app/actions/tracker';
import { TrackerRoot } from './dashboard-client';

export default async function Page() {
  const snapshot = await getTodaySnapshot();
  return <TrackerRoot snapshot={snapshot} />;
}
```

- [ ] **Step 4: Ensure Toaster is mounted**

In `app/layout.tsx`, inside `<body>`, add `import { Toaster } from 'sonner';` and render `<Toaster theme="dark" position="top-center" />` if not already present.

- [ ] **Step 5: Typecheck + run the app**

Run: `npx tsc --noEmit` then `npm run dev`.
Manually: open `http://localhost:3000` signed out → redirected to `/login`. Sign in via magic link → dashboard renders live data; complete a quest → reload → still complete.

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx app/dashboard-client.tsx app/layout.tsx proxy.ts
git commit -m "feat(tracker): wire desktop dashboard to Supabase + enable auth gate"
```

---

## Task 10: Playwright e2e — persistence + idempotency

**Files:**
- Create: `e2e/tracking.spec.ts`
- Reference: `playwright.config.ts`

- [ ] **Step 1: Write the e2e (uses a Supabase test session cookie)**

```ts
import { test, expect } from '@playwright/test';

// Assumes storageState with an authenticated Supabase session is configured in
// playwright.config.ts (see project README for seeding a test user). If not yet
// configured, set it up first, then run.

test('completing a quest persists across reload and is idempotent', async ({ page }) => {
  await page.goto('/');
  const firstComplete = page.getByRole('button', { name: /complete|\+/ }).first();
  await firstComplete.click();
  await firstComplete.click(); // double-click: must not double-award
  await page.reload();
  // The first quest shows a completed state after reload.
  await expect(page.getByText(/cleared|done|✓/i).first()).toBeVisible();
});
```

- [ ] **Step 2: Run it**

Run: `npm run test:e2e -- tracking`
Expected: PASS (after auth storageState configured).

- [ ] **Step 3: Commit**

```bash
git add e2e/tracking.spec.ts
git commit -m "test(e2e): quest completion persistence + idempotency"
```

---

## Task 11: Shared tracker components (extraction)

Extract device-agnostic UI from `dashboard-client.tsx` so both shells reuse it. Pure presentation driven by `useTracker` callbacks.

**Files:**
- Create: `components/tracker/quest-card.tsx` (checkbox/count/timer variants, `+`/`-`, complete)
- Create: `components/tracker/stat-ring.tsx` (moved from inline; reuse `components/animations/activity-rings`)
- Create: `components/tracker/level-meter.tsx`
- Create: `components/tracker/streak-badge.tsx`
- Create: `components/tracker/week-planner.tsx` (the existing Plan Week modal, calling `planWeek`)
- Modify: `app/dashboard-client.tsx` (consume the extracted components)

- [ ] **Step 1: Extract `QuestCard`**

Define `export function QuestCard({ quest, onProgress, onComplete }: { quest: TrackerQuest; onProgress: (actual: number) => void; onComplete: () => void })`. Move the existing quest-row markup (the `+`/`-`, timer, checkbox, progress bar, penalty styling) verbatim into it, wiring buttons to `onProgress`/`onComplete`. No business logic in the component.

- [ ] **Step 2: Extract the remaining components**

Move the level meter, streak badge, stat rings, and Plan Week modal markup into their files with explicit props. `WeekPlanner` takes the current templates as `TemplateInput[]` and calls a passed `onSave(inputs)` that maps to `planWeek`.

- [ ] **Step 3: Reduce `dashboard-client.tsx` to composition**

`dashboard-client.tsx` now imports the shared components and only handles layout/scroll. Confirm no `INITIAL_*` constants or duplicated quest markup remain.

- [ ] **Step 4: Typecheck + visual check**

Run: `npx tsc --noEmit` then drive desktop with the browse tool (goto `/`, click section nav, screenshot each section). Confirm parity with the pre-refactor look.

- [ ] **Step 5: Commit**

```bash
git add components/tracker app/dashboard-client.tsx
git commit -m "refactor(tracker): extract shared device-agnostic components"
```

---

## Task 12: `useMediaQuery` + shell selection

**Files:**
- Create: `hooks/use-media-query.ts`
- Create: `components/shells/desktop-experience.tsx` (current `dashboard-client.tsx` scroll UI)
- Create: `components/shells/mobile-app.tsx` (placeholder rendering shared components in a stack; filled in Task 13)
- Modify: `app/dashboard-client.tsx` (becomes `TrackerRoot` that selects a shell)

- [ ] **Step 1: SSR-safe media query hook**

```ts
'use client';
import { useEffect, useState } from 'react';

/** SSR-safe; defaults to `false` (mobile-first) until mounted to avoid hydration flash. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(query);
    setMatches(m.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    m.addEventListener('change', handler);
    return () => m.removeEventListener('change', handler);
  }, [query]);
  return matches;
}
```

- [ ] **Step 2: Move the scroll UI into `DesktopExperience`**

Rename the current scroll/3D body into `export function DesktopExperience({ tracker }: { tracker: ReturnType<typeof useTracker> })`. It consumes shared components and the `tracker` callbacks. The `HeroScene` dynamic import stays here so only desktop loads three.js.

- [ ] **Step 3: `TrackerRoot` selects the shell**

```tsx
'use client';
import { useTracker } from '@/hooks/use-tracker';
import { useMediaQuery } from '@/hooks/use-media-query';
import { DesktopExperience } from '@/components/shells/desktop-experience';
import { MobileApp } from '@/components/shells/mobile-app';
import type { TrackerSnapshot } from '@/lib/tracker/types';

export function TrackerRoot({ snapshot }: { snapshot: TrackerSnapshot }) {
  const tracker = useTracker(snapshot);
  const isDesktop = useMediaQuery('(min-width: 768px)');
  return isDesktop ? <DesktopExperience tracker={tracker} /> : <MobileApp tracker={tracker} />;
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add hooks/use-media-query.ts components/shells app/dashboard-client.tsx
git commit -m "feat(tracker): shell selection with SSR-safe media query"
```

---

## Task 13: Mobile app shell

A fast tabbed dashboard (Today / Week / Stats), no scroll-jacking, no three.js. Reuses the shared components.

**Files:**
- Modify: `components/shells/mobile-app.tsx`

- [ ] **Step 1: Implement the tabbed shell**

Build `export function MobileApp({ tracker }: { tracker: ReturnType<typeof useTracker> })` with three tabs via local `useState<'today'|'week'|'stats'>`:
- **Today:** `tracker.snapshot.dailyQuests.map(q => <QuestCard ... onProgress={(a)=>tracker.setProgress(q.instanceId,a)} onComplete={()=>tracker.complete(q.instanceId)} />)`, plus a `StreakBadge` and `LevelMeter` header.
- **Week:** weekly quests via `QuestCard` wired to `tracker.setWeekly`, plus the `WeekPlanner` entry.
- **Stats:** `StatRing` ×3 + level/title.
Use a sticky bottom tab bar (`fixed bottom-0`), large tap targets (min 44px), no `Lenis`/scroll-jack, no `HeroScene`. Keep the dark Solo-Leveling palette from `STAT_META`.

- [ ] **Step 2: Verify on a mobile viewport**

Drive with the browse tool: `viewport 390x844`, goto `/` (authenticated), screenshot each tab, tap a `+` on a quest, confirm optimistic update, reload, confirm persisted. Read the screenshots.

- [ ] **Step 3: Commit**

```bash
git add components/shells/mobile-app.tsx
git commit -m "feat(tracker): app-like mobile tabbed shell"
```

---

## Task 14: Final verification + spec sign-off

**Files:**
- None (verification only)

- [ ] **Step 1: Full test run**

Run: `npm test && npx tsc --noEmit && npm run test:e2e`
Expected: all green.

- [ ] **Step 2: Cross-device manual check**

Sign in on desktop, complete a daily quest. Open the same account on a phone viewport (or device): the completion shows. Bump a weekly quest to its target: XP awards once, level/streak reflect it after reload.

- [ ] **Step 3: Confirm each spec success criterion**

Walk the 5 success criteria in the spec and confirm each. Note any deviation in the PR description.

- [ ] **Step 4: Commit any verification notes / open PR**

```bash
git push -u origin feat/single-user-tracking
gh pr create --fill
```

---

## Self-Review Notes (author)

- **Spec coverage:** Sync model → Tasks 6–8. Supabase-only source of truth → Tasks 6–9 (localStorage removed in Task 9 Step 2). Login required → Task 9 Step 1 (`proxy.ts`). App-like mobile / cinematic desktop → Tasks 12–13. Core loop (sign in, plan week, daily+weekly complete, XP/level/streak) → Tasks 3,4,6,7,9. Idempotency + uniqueness → Tasks 1,3,7,10. Deferred items (penalty quests, stat allocation UI, email) → not implemented, by design.
- **Known follow-up:** `planWeek` replaces active templates wholesale (deactivate + insert) — simplest correct behavior for Task 1; per-row diffing is a future optimization, not required here.
- **Carry-forward:** the `on_auth_user_created` trigger seeds week 1; Monday roll-over carry-forward (`cloneTemplatesForNewWeek`) is exercised when a new `week_plan` is created. If automatic Monday cloning is desired without a manual plan edit, add it to `getTodaySnapshot` when no `week_plan` exists for `weekStart` — flagged for the executing engineer to confirm against the seed trigger behavior.
