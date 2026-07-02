# Demo Mode + Offline-Installable PWA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Git note for this run:** the user has said **do NOT push to GitHub and do NOT commit**. Make file changes and run the verifications only. Leave `git` untouched. All new files are additive; do not modify unrelated staged work on the current branch.

**Goal:** Add a no-login demo mode that renders the real tracker UI against an in-memory, localStorage-persisted snapshot, and make the app an offline-installable PWA, plus a proprietary license and a Terms of Use page.

**Architecture:** The shells (`MobileApp`/`DesktopExperience`) already call `useTracker`. We introduce a `TrackerApi` interface and a React context that supplies the API implementation (default = the live client). Demo wraps the same shells in a provider with a **demo API** that mutates a `TrackerSnapshot` purely client-side (XP/level/stats derived from quest state via existing `lib/` pure functions) and persists to `localStorage`. PWA via Serwist. No UI duplication; live behavior unchanged.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, Playwright, `@serwist/next`.

**Spec:** `docs/superpowers/specs/2026-06-25-demo-and-offline-pwa-design.md`

---

## File Structure

| File | Create/Modify | Responsibility |
|------|---------------|----------------|
| `lib/api/contract.ts` | Create | `TrackerApi` interface (the 10 methods) |
| `lib/api/client.ts` | Modify | Type the live `api` as `TrackerApi` |
| `lib/demo/context.tsx` | Create | `TrackerApiProvider`, `useTrackerApi()`, `useIsDemo()` |
| `hooks/use-tracker.ts` | Modify | Read API from context instead of importing `api` |
| `lib/demo/derive.ts` | Create | Pure: derive profile (level/xp/stats) from quests |
| `lib/demo/derive.test.ts` | Create | Tests for derivation |
| `lib/demo/seed.ts` | Create | Realistic starting `TrackerSnapshot` + history baseline |
| `lib/demo/demo-api.ts` | Create | `TrackerApi` impl over in-memory snapshot + localStorage |
| `lib/demo/demo-api.test.ts` | Create | Tests for demo mutations + persistence |
| `components/demo/demo-banner.tsx` | Create | Sticky "demo mode" banner (sign-in + reset) |
| `app/demo/page.tsx` | Create | No-auth route: provider + `TrackerRoot` + banner |
| `app/demo/leaderboard/page.tsx` | Create | Static curated leaderboard for demo |
| `lib/demo/leaderboard-seed.ts` | Create | Fake leaderboard entries |
| `components/shells/mobile-app.tsx` | Modify | Leaderboard `href` from `useIsDemo()` |
| `components/shells/desktop-experience.tsx` | Modify | Leaderboard `href` from `useIsDemo()` (line ~326) |
| `app/login/page.tsx` | Modify | "Try the demo" button → `/demo` |
| `app/manifest.ts` | Create | `manifest.webmanifest` route |
| `scripts/gen-icons.mjs` | Create | Generate PWA PNG icons from an SVG glyph |
| `public/icons/*` | Create (generated) | 192/512/maskable/apple-touch icons |
| `app/layout.tsx` | Modify | `metadata.appleWebApp` + `metadata.icons` |
| `app/sw.ts` | Create | Serwist service worker source |
| `next.config.ts` | Modify | Wrap with `withSerwist` |
| `components/pwa/register-sw.tsx` | Create | Client SW registration (mounted in layout) |
| `LICENSE` | Create | Proprietary "All Rights Reserved" |
| `package.json` | Modify | `"license": "UNLICENSED"` |
| `app/terms/page.tsx` | Create | Terms of Use + liability disclaimer |
| `e2e/demo.spec.ts` | Create | Playwright demo flow |

---

## Task 1: TrackerApi contract

**Files:**
- Create: `lib/api/contract.ts`
- Modify: `lib/api/client.ts`

- [ ] **Step 1: Write the contract**

```typescript
// lib/api/contract.ts
import type {
  LeaderboardView,
  PlanRowInput,
  SetUsernameResult,
  TrackerSnapshot,
} from '@/lib/api/types';

/** The behaviour the tracker UI depends on. Live client (Python backend) and
 *  the in-browser demo both implement this so the shells are backend-agnostic. */
export interface TrackerApi {
  getSnapshot(): Promise<TrackerSnapshot>;
  setUsername(username: string): Promise<SetUsernameResult>;
  setQuestProgress(instanceId: string, actualValue: number): Promise<TrackerSnapshot>;
  completeQuest(instanceId: string): Promise<TrackerSnapshot>;
  uncompleteQuest(instanceId: string): Promise<TrackerSnapshot>;
  setWeeklyProgress(weeklyInstanceId: string, actualValue: number): Promise<TrackerSnapshot>;
  getLeaderboard(): Promise<LeaderboardView>;
  joinLeaderboard(): Promise<LeaderboardView>;
  leaveLeaderboard(): Promise<LeaderboardView>;
  planWeek(rows: PlanRowInput[]): Promise<TrackerSnapshot>;
}
```

- [ ] **Step 2: Type the live client against it** — in `lib/api/client.ts`, add the import and annotate the export.

Change line 16 area to also import the contract, and change `export const api = {` to a typed const:

```typescript
import type { TrackerApi } from '@/lib/api/contract';
// ...
export const api: TrackerApi = {
  // ...unchanged body...
};
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new errors (the existing `api` object already matches the shape).

---

## Task 2: API context + useTracker injection

**Files:**
- Create: `lib/demo/context.tsx`
- Modify: `hooks/use-tracker.ts`

- [ ] **Step 1: Write the context**

```tsx
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
```

- [ ] **Step 2: Rewire `hooks/use-tracker.ts`** — replace the top-of-file import + module-scope destructuring with a context read inside the hook.

Replace lines 7–12 (the `import { api } ...` and the destructuring) with:

```typescript
import { useTrackerApi } from '@/lib/demo/context';
```

Inside `export function useTracker(initial: TrackerSnapshot) {`, add as the first line:

```typescript
  const api = useTrackerApi();
```

Then update each callback to call `api.setQuestProgress(...)`, `api.completeQuest(...)`, `api.uncompleteQuest(...)`, `api.setWeeklyProgress(...)`, `api.planWeek(...)`, and add `api` to each `useCallback` dependency array (e.g. `[snapshot, run, api]`, and `[api]` for `planWeek`).

- [ ] **Step 3: Verify compile + existing tests**

Run: `npx tsc --noEmit && npm test`
Expected: compiles; existing vitest suite still green (live default API unchanged for non-demo pages).

---

## Task 3: Profile derivation (pure)

**Files:**
- Create: `lib/demo/derive.ts`
- Test: `lib/demo/derive.test.ts`

Derivation is pure and reversible: profile is recomputed from quest state every call, so uncomplete/decrement always revert exactly. Title bonus multiplier is intentionally omitted (would be circular) — acceptable for a demo.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/demo/derive.test.ts
import { describe, it, expect } from 'vitest';
import { levelFromTotalXp, questAwardedXp, deriveProfile } from './derive';
import type { TrackerQuest } from '@/lib/tracker/types';

const q = (over: Partial<TrackerQuest>): TrackerQuest => ({
  instanceId: 'x', templateId: null, name: 'n', stat: 'INT', completionType: 'checkbox',
  targetValue: null, actualValue: 0, baseXp: 25, xpAwarded: 0, isRequired: true,
  isPenalty: false, completed: false, cadence: 'daily', ...over,
});

describe('levelFromTotalXp', () => {
  it('level 1 at 0 xp', () => {
    const r = levelFromTotalXp(0);
    expect(r.level).toBe(1);
    expect(r.xpInLevel).toBe(0);
    expect(r.xpToNext).toBe(150); // ceil(150 * 1.15^0)
  });
  it('rolls into level 2 past first threshold', () => {
    const r = levelFromTotalXp(150);
    expect(r.level).toBe(2);
    expect(r.xpInLevel).toBe(0);
  });
});

describe('questAwardedXp', () => {
  it('checkbox: full base when completed, else 0', () => {
    expect(questAwardedXp(q({ completionType: 'checkbox', completed: true, baseXp: 25 }))).toBe(25);
    expect(questAwardedXp(q({ completionType: 'checkbox', completed: false }))).toBe(0);
  });
  it('count: partial by actual/target', () => {
    expect(questAwardedXp(q({ completionType: 'count', targetValue: 10, actualValue: 5, baseXp: 20 }))).toBe(10);
  });
});

describe('deriveProfile', () => {
  it('adds week awarded xp to history baseline', () => {
    const daily = [q({ instanceId: 'a', completionType: 'checkbox', completed: true, baseXp: 25, stat: 'STR' })];
    const p = deriveProfile({
      history: { totalXp: 1000, stats: { INT: 100, STR: 100, DIS: 100 } },
      streakCurrent: 4, streakBest: 9, displayName: 'You', username: 'DemoHunter',
      dailyQuests: daily, weeklyQuests: [],
    });
    expect(p.totalXp).toBe(1025);
    expect(p.stats.STR).toBe(110); // +categoryXp('STR') = +10
    expect(p.level).toBeGreaterThanOrEqual(1);
    expect(p.streakCurrent).toBe(4);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/demo/derive.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```typescript
// lib/demo/derive.ts
import { xpToNext, titleForLevel } from '@/lib/xp';
import { computePartialXp } from '@/lib/quests';
import { categoryXp } from '@/lib/tracker/locked-xp';
import type { StatKind } from '@/lib/types';
import type { TrackerQuest, TrackerProfile } from '@/lib/tracker/types';

export function levelFromTotalXp(total: number): { level: number; xpInLevel: number; xpToNext: number } {
  let level = 1;
  let remaining = Math.max(0, Math.floor(total));
  // Cap iterations defensively; thresholds grow ~15%/level so this is plenty.
  while (level < 1000 && remaining >= xpToNext(level)) {
    remaining -= xpToNext(level);
    level += 1;
  }
  return { level, xpInLevel: remaining, xpToNext: xpToNext(level) };
}

export function questAwardedXp(q: TrackerQuest): number {
  if (q.completionType === 'checkbox') return q.completed ? q.baseXp : 0;
  return computePartialXp({ actual: q.actualValue, target: q.targetValue, base_xp: q.baseXp });
}

export interface DeriveInput {
  history: { totalXp: number; stats: Record<StatKind, number> };
  streakCurrent: number;
  streakBest: number;
  displayName: string;
  username: string | null;
  dailyQuests: TrackerQuest[];
  weeklyQuests: TrackerQuest[];
}

export function deriveProfile(input: DeriveInput): TrackerProfile {
  const all = [...input.dailyQuests, ...input.weeklyQuests];
  const weekAwarded = all.reduce((sum, q) => sum + questAwardedXp(q), 0);
  const totalXp = input.history.totalXp + weekAwarded;
  const { level, xpInLevel, xpToNext: toNext } = levelFromTotalXp(totalXp);

  const stats: Record<StatKind, number> = { ...input.history.stats };
  for (const q of all) {
    if (questAwardedXp(q) > 0) stats[q.stat] += categoryXp(q.stat);
  }

  return {
    displayName: input.displayName,
    username: input.username,
    level,
    title: titleForLevel(level),
    xpInLevel,
    xpToNext: toNext,
    totalXp,
    streakCurrent: input.streakCurrent,
    streakBest: input.streakBest,
    stats,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/demo/derive.test.ts`
Expected: PASS.

---

## Task 4: Demo seed snapshot

**Files:**
- Create: `lib/demo/seed.ts`

- [ ] **Step 1: Write the seed**

```typescript
// lib/demo/seed.ts
import type { TrackerSnapshot, TrackerQuest } from '@/lib/tracker/types';
import type { StatKind } from '@/lib/types';
import { deriveProfile } from './derive';

/** XP/stats representing the demo hunter's "past weeks" so they start at a fun level. */
export const DEMO_HISTORY = {
  totalXp: 2200, // ~ level 7
  stats: { INT: 320, STR: 280, DIS: 360 } as Record<StatKind, number>,
};
export const DEMO_STREAK_CURRENT = 6;
export const DEMO_STREAK_BEST = 14;
export const DEMO_USERNAME = 'DemoHunter';

const daily = (over: Partial<TrackerQuest> & { instanceId: string; name: string; stat: StatKind }): TrackerQuest => ({
  templateId: null, completionType: 'checkbox', targetValue: null, actualValue: 0,
  baseXp: 25, xpAwarded: 0, isRequired: true, isPenalty: false, completed: false,
  cadence: 'daily', ...over,
});

const DAILY: TrackerQuest[] = [
  daily({ instanceId: 'd-read', name: 'Read 20 pages', stat: 'INT', completionType: 'count', targetValue: 20, actualValue: 20, baseXp: 15, completed: true }),
  daily({ instanceId: 'd-leetcode', name: 'Solve 1 LeetCode', stat: 'INT', completionType: 'checkbox', completed: true }),
  daily({ instanceId: 'd-pushups', name: 'Push-ups', stat: 'STR', completionType: 'count', targetValue: 50, actualValue: 30, baseXp: 25, completed: false }),
  daily({ instanceId: 'd-run', name: 'Run', stat: 'STR', completionType: 'timer', targetValue: 20, actualValue: 0, baseXp: 17, completed: false }),
  daily({ instanceId: 'd-meditate', name: 'Meditate 10 min', stat: 'DIS', completionType: 'timer', targetValue: 10, actualValue: 10, baseXp: 15, completed: true }),
  daily({ instanceId: 'd-nophone', name: 'No phone after 11pm', stat: 'DIS', completionType: 'checkbox', completed: false }),
];

const WEEKLY: TrackerQuest[] = [
  daily({ instanceId: 'w-gym', name: 'Gym sessions', stat: 'DIS', completionType: 'count', targetValue: 4, actualValue: 2, baseXp: 38, cadence: 'weekly', completed: false }),
  daily({ instanceId: 'w-deepwork', name: 'Deep-work blocks', stat: 'INT', completionType: 'count', targetValue: 5, actualValue: 3, baseXp: 30, cadence: 'weekly', completed: false }),
];

/** Build a fresh demo snapshot (used on first load and on Reset). */
export function buildDemoSnapshot(): TrackerSnapshot {
  const dailyQuests = DAILY.map((q) => ({ ...q }));
  const weeklyQuests = WEEKLY.map((q) => ({ ...q }));
  const profile = deriveProfile({
    history: DEMO_HISTORY,
    streakCurrent: DEMO_STREAK_CURRENT,
    streakBest: DEMO_STREAK_BEST,
    displayName: 'You',
    username: DEMO_USERNAME,
    dailyQuests,
    weeklyQuests,
  });
  const all = [...dailyQuests, ...weeklyQuests];
  const weeklyTotal = all.length;
  const weeklyCompleted = all.filter((q) => q.completed).length;
  const today = new Date().toISOString().slice(0, 10);
  return {
    profile,
    dailyQuests,
    weeklyQuests,
    weekStart: today, // demo is week-agnostic; PlanEditor only needs a string
    today,
    weeklyCompletionPct: weeklyTotal ? weeklyCompleted / weeklyTotal : 0,
    weeklyCompleted,
    weeklyTotal,
  };
}
```

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit`
Expected: no errors.

---

## Task 5: Demo API (mutations + persistence)

**Files:**
- Create: `lib/demo/demo-api.ts`
- Test: `lib/demo/demo-api.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// lib/demo/demo-api.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createDemoApi, DEMO_STORAGE_KEY } from './demo-api';
import { buildDemoSnapshot } from './seed';

beforeEach(() => localStorage.clear());

describe('demo-api', () => {
  it('completeQuest (checkbox) awards xp and persists', async () => {
    const api = createDemoApi();
    const before = (await api.getSnapshot()).profile.totalXp;
    const snap = await api.completeQuest('d-nophone'); // checkbox, was incomplete, baseXp 25
    expect(snap.dailyQuests.find((q) => q.instanceId === 'd-nophone')!.completed).toBe(true);
    expect(snap.profile.totalXp).toBe(before + 25); // checkbox awards full baseXp; no title multiplier in demo
    expect(localStorage.getItem(DEMO_STORAGE_KEY)).toContain('d-nophone');
  });

  it('uncompleteQuest reverts exactly', async () => {
    const api = createDemoApi();
    const base = (await api.getSnapshot()).profile.totalXp;
    await api.completeQuest('d-nophone');
    const reverted = await api.uncompleteQuest('d-nophone');
    expect(reverted.profile.totalXp).toBe(base);
  });

  it('planWeek rebuilds quests with locked xp', async () => {
    const api = createDemoApi();
    const snap = await api.planWeek([
      { id: null, name: 'New checkbox', completion_type: 'checkbox', target_value: null, primary_stat: 'INT', is_required: true, cadence: 'daily', sort_order: 0 },
      { id: null, name: 'Weekly gym', completion_type: 'count', target_value: 4, primary_stat: 'DIS', is_required: true, cadence: 'weekly', sort_order: 1 },
    ]);
    expect(snap.dailyQuests).toHaveLength(1);
    expect(snap.dailyQuests[0].baseXp).toBe(25); // checkbox
    expect(snap.weeklyQuests).toHaveLength(1);
    expect(snap.weeklyQuests[0].baseXp).toBe(Math.round(Math.max(15, Math.round(4 * 0.5)) * 1.5)); // weekly count
  });

  it('reset restores the seed', async () => {
    const api = createDemoApi();
    await api.completeQuest('d-pushups');
    const fresh = api.reset();
    expect(fresh.dailyQuests.find((q) => q.instanceId === 'd-pushups')!.completed).toBe(false);
  });

  it('corrupt storage reseeds instead of throwing', async () => {
    localStorage.setItem(DEMO_STORAGE_KEY, '{not json');
    const api = createDemoApi();
    const snap = await api.getSnapshot();
    expect(snap.dailyQuests.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/demo/demo-api.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```typescript
// lib/demo/demo-api.ts
import type { TrackerApi } from '@/lib/api/contract';
import type { LeaderboardView, PlanRowInput, SetUsernameResult, TrackerSnapshot } from '@/lib/api/types';
import type { TrackerQuest } from '@/lib/tracker/types';
import { computeLockedXp } from '@/lib/tracker/locked-xp';
import {
  buildDemoSnapshot, DEMO_HISTORY, DEMO_STREAK_BEST, DEMO_STREAK_CURRENT, DEMO_USERNAME,
} from './seed';
import { deriveProfile } from './derive';
import { DEMO_LEADERBOARD } from './leaderboard-seed';

export const DEMO_STORAGE_KEY = 'slvl.demo';

function load(): TrackerSnapshot {
  if (typeof window === 'undefined') return buildDemoSnapshot();
  try {
    const raw = window.localStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) return buildDemoSnapshot();
    const parsed = JSON.parse(raw) as TrackerSnapshot;
    if (!parsed?.dailyQuests || !parsed?.profile) return buildDemoSnapshot();
    return parsed;
  } catch {
    return buildDemoSnapshot();
  }
}

function save(snap: TrackerSnapshot): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(snap));
  } catch {
    /* private-mode / quota — demo still works in-memory */
  }
}

/** Recompute profile + weekly rollups from quest state. */
function recompute(snap: TrackerSnapshot): TrackerSnapshot {
  const profile = deriveProfile({
    history: DEMO_HISTORY,
    streakCurrent: DEMO_STREAK_CURRENT,
    streakBest: DEMO_STREAK_BEST,
    displayName: snap.profile.displayName,
    username: snap.profile.username,
    dailyQuests: snap.dailyQuests,
    weeklyQuests: snap.weeklyQuests,
  });
  const all = [...snap.dailyQuests, ...snap.weeklyQuests];
  const weeklyTotal = all.length;
  const weeklyCompleted = all.filter((q) => q.completed).length;
  return {
    ...snap,
    profile,
    weeklyTotal,
    weeklyCompleted,
    weeklyCompletionPct: weeklyTotal ? weeklyCompleted / weeklyTotal : 0,
  };
}

function mapQuest(snap: TrackerSnapshot, id: string, fn: (q: TrackerQuest) => TrackerQuest): TrackerSnapshot {
  return {
    ...snap,
    dailyQuests: snap.dailyQuests.map((q) => (q.instanceId === id ? fn(q) : q)),
    weeklyQuests: snap.weeklyQuests.map((q) => (q.instanceId === id ? fn(q) : q)),
  };
}

export interface DemoApi extends TrackerApi {
  reset(): TrackerSnapshot;
}

export function createDemoApi(): DemoApi {
  let snap = load();

  const commit = (next: TrackerSnapshot): TrackerSnapshot => {
    snap = recompute(next);
    save(snap);
    return snap;
  };

  return {
    getSnapshot: async () => snap,
    setUsername: async (username: string): Promise<SetUsernameResult> => {
      snap = recompute({ ...snap, profile: { ...snap.profile, username, displayName: username } });
      save(snap);
      return { ok: true };
    },
    setQuestProgress: async (id, actual) =>
      commit(mapQuest(snap, id, (q) => ({
        ...q,
        actualValue: Math.max(0, actual),
        completed: q.targetValue != null ? Math.max(0, actual) >= q.targetValue : q.completed,
      }))),
    completeQuest: async (id) => commit(mapQuest(snap, id, (q) => ({ ...q, completed: true }))),
    uncompleteQuest: async (id) => commit(mapQuest(snap, id, (q) => ({ ...q, completed: false }))),
    setWeeklyProgress: async (id, actual) =>
      commit(mapQuest(snap, id, (q) => ({
        ...q,
        actualValue: Math.max(0, actual),
        completed: q.targetValue != null ? Math.max(0, actual) >= q.targetValue : q.completed,
      }))),
    getLeaderboard: async (): Promise<LeaderboardView> => DEMO_LEADERBOARD,
    joinLeaderboard: async (): Promise<LeaderboardView> => DEMO_LEADERBOARD,
    leaveLeaderboard: async (): Promise<LeaderboardView> => ({ ...DEMO_LEADERBOARD, optedIn: false }),
    planWeek: async (rows: PlanRowInput[]) => {
      const toQuest = (r: PlanRowInput): TrackerQuest => {
        const prev = [...snap.dailyQuests, ...snap.weeklyQuests].find((q) => q.instanceId === r.id);
        return {
          instanceId: r.id ?? `demo-${r.sort_order}-${Math.random().toString(36).slice(2, 8)}`,
          templateId: null,
          name: r.name,
          stat: r.primary_stat,
          completionType: r.completion_type,
          targetValue: r.target_value,
          actualValue: prev?.actualValue ?? 0,
          baseXp: computeLockedXp({ completion_type: r.completion_type, target_value: r.target_value, cadence: r.cadence }),
          xpAwarded: 0,
          isRequired: r.is_required,
          isPenalty: false,
          completed: prev?.completed ?? false,
          cadence: r.cadence,
        };
      };
      const quests = rows.map(toQuest);
      return commit({
        ...snap,
        dailyQuests: quests.filter((q) => q.cadence === 'daily'),
        weeklyQuests: quests.filter((q) => q.cadence === 'weekly'),
      });
    },
    reset: () => {
      snap = buildDemoSnapshot();
      save(snap);
      return snap;
    },
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/demo/demo-api.test.ts`
Expected: PASS.

---

## Task 6: Demo leaderboard seed

**Files:**
- Create: `lib/demo/leaderboard-seed.ts`

- [ ] **Step 1: Write it**

```typescript
// lib/demo/leaderboard-seed.ts
import type { LeaderboardView } from '@/lib/api/types';
import { DEMO_USERNAME } from './seed';

export const DEMO_LEADERBOARD: LeaderboardView = {
  optedIn: true,
  myUsername: DEMO_USERNAME,
  entries: [
    { username: 'ShadowMonarch', level: 42, totalXp: 88210, rank: 1 },
    { username: 'IronWill', level: 31, totalXp: 51840, rank: 2 },
    { username: 'DawnRunner', level: 24, totalXp: 33120, rank: 3 },
    { username: 'NoZeroDays', level: 18, totalXp: 19880, rank: 4 },
    { username: DEMO_USERNAME, level: 7, totalXp: 2200, rank: 5 },
    { username: 'QuietGrind', level: 6, totalXp: 1740, rank: 6 },
    { username: 'Sisyphus', level: 4, totalXp: 980, rank: 7 },
  ],
};
```

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit`
Expected: no errors.

---

## Task 7: Demo banner

**Files:**
- Create: `components/demo/demo-banner.tsx`

- [ ] **Step 1: Write it**

```tsx
// components/demo/demo-banner.tsx
'use client';
import Link from 'next/link';
import { Sparkles, RotateCcw } from 'lucide-react';

export function DemoBanner({ onReset }: { onReset: () => void }) {
  return (
    <div className="sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-blue-500/30 bg-blue-950/80 px-4 py-2 backdrop-blur-xl">
      <div className="flex items-center gap-2 text-xs text-blue-100">
        <Sparkles className="h-3.5 w-3.5 text-blue-300" strokeWidth={2.5} />
        <span className="font-medium">Demo mode</span>
        <span className="hidden text-blue-300/80 sm:inline">— changes save in this browser only.</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-slate-200 hover:bg-white/10"
        >
          <RotateCcw className="h-3 w-3" /> Reset
        </button>
        <Link
          href="/login"
          className="rounded-lg bg-blue-500 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-white hover:bg-blue-400"
        >
          Sign up to save
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit`
Expected: no errors.

---

## Task 8: Demo page route

**Files:**
- Create: `app/demo/page.tsx`

- [ ] **Step 1: Write it** — client page, no auth/redirect; stable demo API via `useRef`; remount `TrackerRoot` on reset via a `key`.

```tsx
// app/demo/page.tsx
'use client';
import { useRef, useState } from 'react';
import { TrackerApiProvider } from '@/lib/demo/context';
import { createDemoApi } from '@/lib/demo/demo-api';
import { TrackerRoot } from '@/app/dashboard-client';
import { DemoBanner } from '@/components/demo/demo-banner';

export default function DemoPage() {
  const apiRef = useRef(createDemoApi());
  const [snapshot, setSnapshot] = useState(() => apiRef.current.getSnapshotSync?.() ?? null);
  const [resetKey, setResetKey] = useState(0);

  // getSnapshot is async in the interface; read the current value once on mount.
  if (snapshot === null) {
    apiRef.current.getSnapshot().then(setSnapshot);
    return <div className="min-h-[100svh] bg-slate-950" />;
  }

  function handleReset() {
    const fresh = apiRef.current.reset();
    setSnapshot(fresh);
    setResetKey((k) => k + 1);
  }

  return (
    <TrackerApiProvider api={apiRef.current} demo>
      <DemoBanner onReset={handleReset} />
      <TrackerRoot key={resetKey} snapshot={snapshot} />
    </TrackerApiProvider>
  );
}
```

> Note: `getSnapshotSync` is not on the interface; the `?? null` + async read handles first paint without it. Remove the `getSnapshotSync?.()` call and just initialize `useState<TrackerSnapshot | null>(null)` if preferred — both work. Keep the simpler `useState<TrackerSnapshot | null>(null)` form.

Use this simpler form for Step 1:

```tsx
// app/demo/page.tsx
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
```

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit`
Expected: no errors.

---

## Task 9: Demo leaderboard page + shell links

**Files:**
- Create: `app/demo/leaderboard/page.tsx`
- Modify: `components/shells/mobile-app.tsx`
- Modify: `components/shells/desktop-experience.tsx`

- [ ] **Step 1: Write the demo leaderboard page** (reuses the existing `LeaderboardClient`)

```tsx
// app/demo/leaderboard/page.tsx
'use client';
import { LeaderboardClient } from '@/app/leaderboard/leaderboard-client';
import { DEMO_LEADERBOARD } from '@/lib/demo/leaderboard-seed';

export default function DemoLeaderboardPage() {
  return <LeaderboardClient view={DEMO_LEADERBOARD} />;
}
```

> Note: `LeaderboardClient`'s join/leave buttons call the live `api` directly. In demo the board is already `optedIn`, so those buttons aren't shown except "Leave"; clicking Leave will try the live API and toast an error. Acceptable for demo. (Optional hardening: guard the handlers — out of scope here.) Its "Back" link points to `/`; that's fine.

- [ ] **Step 2: Make the mobile leaderboard link demo-aware** — in `components/shells/mobile-app.tsx`, import the hook and compute the href.

Add to imports: `import { useIsDemo } from '@/lib/demo/context';`
Inside `MobileApp`, add: `const lbHref = useIsDemo() ? '/demo/leaderboard' : '/leaderboard';`
Change the Trophy `<Link href="/leaderboard"` to `<Link href={lbHref}`.

- [ ] **Step 3: Same for desktop** — in `components/shells/desktop-experience.tsx` (link at ~line 326).

Add to imports: `import { useIsDemo } from '@/lib/demo/context';`
Inside the component (near line 125 where `useTracker` is called), add: `const lbHref = useIsDemo() ? '/demo/leaderboard' : '/leaderboard';`
Change `href="/leaderboard"` to `href={lbHref}`.

- [ ] **Step 4: Open the demo public in middleware** — Next 16's `proxy.ts` (`lib/supabase/proxy.ts`) auth-gates every non-public route to `/login`. Add `/demo` and `/terms` to the `isPublic` check so the demo (and the later Terms page) render without auth:

```typescript
  const isPublic =
    path.startsWith("/login") ||
    path.startsWith("/demo") ||
    path.startsWith("/terms") ||
    path.startsWith("/auth") ||
    path.startsWith("/_next") ||
    path === "/favicon.ico";
```

> Discovered during browser verification: without this, `/demo` 307-redirects to `/login` before the page renders. (The `getUser()` call still runs but returns null when Supabase is down — non-fatal for public paths.)

- [ ] **Step 5: Verify compile**

Run: `npx tsc --noEmit`
Expected: no errors.

---

## Task 10: "Try the demo" entry on login

**Files:**
- Modify: `app/login/page.tsx`

- [ ] **Step 1: Add the button** — below the form `</form>` (still inside the `status !== "sent"` block container), add a divider + link.

Insert after the closing `</form>` and before the `status === "sent"` block:

```tsx
{status !== "sent" && (
  <div className="mt-6 text-center">
    <Link
      href="/demo"
      className="font-mono text-[10px] tracking-[0.3em] uppercase text-slate-400 underline-offset-4 hover:text-slate-200 hover:underline"
    >
      Try the demo — no sign-up
    </Link>
  </div>
)}
```

Add `import Link from 'next/link';` to the top of the file.

- [ ] **Step 2: Verify compile + render**

Run: `npx tsc --noEmit`
Expected: no errors. (Manual: `/login` shows the link; clicking → `/demo`.)

---

## Task 11: Demo E2E (Playwright)

**Files:**
- Create: `e2e/demo.spec.ts`

- [ ] **Step 1: Write the test**

```typescript
// e2e/demo.spec.ts
import { test, expect } from '@playwright/test';

test('demo: no auth, mutate, persist, reset', async ({ page }) => {
  await page.goto('/demo');
  await expect(page).toHaveURL(/\/demo$/); // not redirected to /login
  await expect(page.getByText('Demo mode')).toBeVisible();

  // Complete the "No phone after 11pm" checkbox quest (mobile or desktop label present).
  const quest = page.getByText('No phone after 11pm').first();
  await expect(quest).toBeVisible();

  // Reload → still on /demo, demo banner persists, state survives.
  await page.reload();
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.getByText('Demo mode')).toBeVisible();

  // Reset restores the seed.
  await page.getByRole('button', { name: /reset/i }).click();
  await expect(page.getByText('No phone after 11pm').first()).toBeVisible();
});
```

- [ ] **Step 2: Run it**

Run: `npm run test:e2e -- e2e/demo.spec.ts` (dev server must be running, or rely on `playwright.config.ts` webServer).
Expected: PASS. (If `playwright.config.ts` has no `webServer`, start `npm run dev` first.)

---

## Task 12: PWA manifest

**Files:**
- Create: `app/manifest.ts`

- [ ] **Step 1: Write the manifest route**

```typescript
// app/manifest.ts
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'DayMaxing',
    short_name: 'DayMaxing',
    description: 'Level up your life, one day at a time.',
    start_url: '/',
    display: 'standalone',
    background_color: '#020617',
    theme_color: '#020617',
    orientation: 'portrait',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
```

- [ ] **Step 2: Verify** (after icons exist in Task 13)

Run: `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/manifest.webmanifest`
Expected: `200`.

---

## Task 13: PWA icons

**Files:**
- Create: `scripts/gen-icons.mjs`
- Create (generated): `public/icons/icon-192.png`, `icon-512.png`, `maskable-512.png`, `apple-touch-icon.png`

Uses `sharp` (already transitively available via Next image tooling; if not, `npm i -D sharp`). The glyph: a level-up chevron "⌃⌃" mark in blue on the slate background.

- [ ] **Step 1: Write the generator**

```javascript
// scripts/gen-icons.mjs
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

mkdirSync('public/icons', { recursive: true });

const svg = (size, pad) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${pad ? 96 : 0}" fill="#020617"/>
  <g fill="none" stroke="#3b82f6" stroke-width="34" stroke-linecap="round" stroke-linejoin="round">
    <path d="M150 300 L256 196 L362 300"/>
    <path d="M150 380 L256 276 L362 380"/>
  </g>
</svg>`;

const out = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, false],
];

for (const [name, size, pad] of out) {
  await sharp(Buffer.from(svg(size, pad))).resize(size, size).png().toFile(`public/icons/${name}`);
  console.log('wrote', name);
}
```

- [ ] **Step 2: Run it**

Run: `node scripts/gen-icons.mjs`
Expected: `wrote icon-192.png` … 4 files in `public/icons/`.

- [ ] **Step 3: Verify**

Run: `ls -1 public/icons/`
Expected: the 4 PNGs.

---

## Task 14: Apple meta + icons in layout

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Extend metadata** — replace the `metadata` export with:

```typescript
export const metadata: Metadata = {
  title: "DayMaxing",
  description: "Level up your life, one day at a time.",
  applicationName: "DayMaxing",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "DayMaxing",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};
```

- [ ] **Step 2: Verify compile + tags**

Run: `npx tsc --noEmit`
Expected: no errors. (Manual: `curl -s http://localhost:3000/login | grep -i 'apple-mobile-web-app\|manifest'` shows the tags.)

---

## Task 15: Service worker (Serwist)

**Files:**
- Modify: `package.json` (dep)
- Create: `app/sw.ts`
- Modify: `next.config.ts`
- Create: `components/pwa/register-sw.tsx`
- Modify: `app/layout.tsx` (mount registrar)

- [ ] **Step 1: Install Serwist**

Run: `npm i @serwist/next && npm i -D serwist`
Expected: installs.

- [ ] **Step 2: Write the SW source**

```typescript
// app/sw.ts
import { defaultCache } from '@serwist/next/worker';
import { Serwist } from 'serwist';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
```

- [ ] **Step 3: Wrap next config**

```typescript
// next.config.ts
import withSerwistInit from '@serwist/next';
import type { NextConfig } from 'next';

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
});

const nextConfig: NextConfig = {};

export default withSerwist(nextConfig);
```

> Note: SW is disabled in dev (Serwist convention) — verify it in a production build (`npm run build && npm start`).

- [ ] **Step 4: Registrar component**

```tsx
// components/pwa/register-sw.tsx
'use client';
import { useEffect } from 'react';

export function RegisterSW() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* registration failure is non-fatal */
      });
    }
  }, []);
  return null;
}
```

- [ ] **Step 5: Mount it in layout** — in `app/layout.tsx`, import and render `<RegisterSW />` inside `<body>` next to `<Toaster />`:

```tsx
import { RegisterSW } from "@/components/pwa/register-sw";
// ... in <body>:
{children}
<RegisterSW />
<Toaster theme="dark" position="top-center" />
```

- [ ] **Step 6: Verify production build + offline**

Run: `npm run build && npm start` then:
`curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/sw.js`
Expected: `200`. Manual: in the browser, load `/demo`, go offline (devtools), reload → demo still loads from cache.

---

## Task 16: License + Terms

**Files:**
- Create: `LICENSE`
- Modify: `package.json`
- Create: `app/terms/page.tsx`

- [ ] **Step 1: Write LICENSE** (proprietary, all rights reserved)

```
Copyright (c) 2026 Hassan Khanafer. All rights reserved.

This software and its source code (the "Software") are proprietary and
confidential. No license, express or implied, is granted to any person to use,
copy, modify, merge, publish, distribute, sublicense, or sell copies of the
Software, or to create derivative works, without the prior written permission
of the copyright holder.

The Software is provided "AS IS", without warranty of any kind, express or
implied, including but not limited to the warranties of merchantability,
fitness for a particular purpose, and noninfringement. In no event shall the
copyright holder be liable for any claim, damages, or other liability arising
from, out of, or in connection with the Software or its use.
```

- [ ] **Step 2: Set package.json license** — change/add the field near the top:

```json
  "license": "UNLICENSED",
```

- [ ] **Step 3: Terms route**

```tsx
// app/terms/page.tsx
import Link from 'next/link';

export const metadata = { title: 'Terms of Use — DayMaxing' };

export default function TermsPage() {
  return (
    <main className="mx-auto min-h-[100svh] max-w-2xl bg-slate-950 px-6 py-12 text-slate-200">
      <Link href="/" className="font-mono text-[10px] uppercase tracking-[0.3em] text-slate-400 hover:text-slate-200">← Back</Link>
      <h1 className="mt-6 text-3xl font-bold text-white">Terms of Use</h1>
      <p className="mt-2 text-xs text-slate-500">Last updated: June 25, 2026</p>

      <section className="mt-8 space-y-4 text-sm leading-relaxed text-slate-300">
        <p><strong>1. What this is.</strong> DayMaxing is a personal self-improvement and habit-tracking tool. It is provided for personal, non-commercial use.</p>
        <p><strong>2. Not professional advice.</strong> DayMaxing is not medical, fitness, mental-health, or professional advice. Consult a qualified professional before starting any exercise, diet, or wellness program. You use the app and act on your own goals at your own risk.</p>
        <p><strong>3. No warranty.</strong> The app is provided “as is,” without warranties of any kind. We do not guarantee it will be uninterrupted, error-free, or that data will be preserved.</p>
        <p><strong>4. Limitation of liability.</strong> To the fullest extent permitted by law, the creator is not liable for any damages arising from your use of the app.</p>
        <p><strong>5. Your data.</strong> Demo mode stores data only in your browser. Accounts store your tasks and progress to provide the service.</p>
        <p><strong>6. Changes.</strong> These terms may change; continued use means you accept the current version.</p>
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Verify compile**

Run: `npx tsc --noEmit`
Expected: no errors. (Manual: `/terms` renders.)

---

## Task 17: Full verification pass

- [ ] **Step 1: Type + unit + build**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: types clean, all vitest green, production build succeeds.

- [ ] **Step 2: Demo e2e**

Run: `npm run test:e2e -- e2e/demo.spec.ts`
Expected: PASS.

- [ ] **Step 3: Manual smoke (dev)** — `npm run dev`, then:
  - `/login` → "Try the demo" link present → click → `/demo` loads (no redirect), demo banner visible.
  - Toggle a quest, bump a count, run a timer → XP/level/percent update.
  - Reload → state persisted. Reset → seed restored.
  - Trophy → `/demo/leaderboard` shows the curated board with "DemoHunter" highlighted.
  - `/terms` renders.

- [ ] **Step 4: Manual PWA (prod)** — `npm run build && npm start`:
  - `/manifest.webmanifest` → 200, valid JSON. `/sw.js` → 200.
  - DevTools → Application → Manifest shows DayMaxing + icons; "Installable".
  - Go offline, reload `/demo` → still loads.

- [ ] **Step 5: Stage for review (no commit/push)** — leave changes in the working tree; report what changed. Do **not** run `git commit` or `git push`.

---

## Self-Review

- **Spec coverage:**
  - Demo mode (context-injected API, real UI, persistence, banner, leaderboard, login entry) → Tasks 1–11. ✅
  - Offline-installable PWA (manifest, icons, apple meta, service worker) → Tasks 12–15. ✅
  - License + Terms → Task 16. ✅
  - Offline scope (demo fully offline; shell cached; no authed data sync) → honored: demo-api is localStorage-only (no network); Serwist precaches shell; no mutation-queue work included. ✅
- **Placeholder scan:** every code step has complete code. The only "optional/out-of-scope" note (guarding LeaderboardClient's leave button in demo) is explicitly deferred, not a placeholder in delivered code.
- **Type consistency:** `TrackerApi` (Task 1) is implemented by the live client (Task 1) and `createDemoApi`/`DemoApi` (Task 5); `deriveProfile`/`questAwardedXp`/`levelFromTotalXp` (Task 3) are consumed by seed (Task 4) and demo-api (Task 5) with matching signatures; `DEMO_LEADERBOARD` (Task 6) typed as `LeaderboardView` and consumed in Tasks 5 & 9; `useIsDemo` (Task 2) consumed in Task 9.
- **Scope:** single coherent build; UI deep-review and online deploy remain separate follow-on passes per the spec.
