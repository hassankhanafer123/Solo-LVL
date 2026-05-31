# Task 1 — Master the Single-User Experience

**Date:** 2026-05-31
**Status:** Approved, ready for implementation planning
**Scope:** Single-user tracking, persistence, and cross-device experience. The social/competitive layer (friends, leaderboards, shared weekly challenges) is **Task 2 — deferred**.

## Problem

The codebase is two disconnected halves:

1. **Backend (built, unused):** A well-formed Supabase schema (`profile`, `quest_template`, `daily_log`, `quest_instance`, weekly-planning tables, `level_up_event`, `email_log`), RLS policies (`auth.uid() = user_id`), magic-link auth routes, and tested pure logic in `lib/` (`xp.ts`, `time.ts`, `quests.ts`, `plan.ts`).
2. **Frontend (the running app):** `app/page.tsx` — a 1428-line `"use client"` monolith that holds the entire UI in React state seeded from constants and persists only to `localStorage`. It never touches Supabase.

Result: the app does not truly persist, does not sync across devices, and `/` is not gated by auth. The goal of Task 1 is to join the halves so the app is a real, synced, single-user tracker that feels great on phone and laptop.

## Decisions (locked)

| Decision | Choice |
|---|---|
| Source of truth | **Supabase only.** No localStorage data store. Optimistic UI keeps an in-memory working copy that reconciles against the server. |
| Sync feel | **Server-of-truth + optimistic UI** — taps update instantly, write through to Supabase, roll back on error. |
| Access | **Login required.** Magic link = account (email → private sign-in link → that's the account). Re-enable the parked Next proxy. |
| Layout | **App-like on mobile, cinematic on desktop.** Mobile = fast tabbed dashboard, 3D disabled. Desktop = existing scroll-3D narrative. |
| Feature scope | **Core loop solid first:** sign in, plan week, complete daily + weekly quests, XP/level/streak — all server-backed and synced. Deferred fast-follows: penalty quests, level-up stat allocation, email reminders. |

## Architecture (Approach A — data layer + two view shells)

### 1. Data layer & sync

**Server actions** — `app/actions/tracker.ts`, all authenticated via the Supabase server client, all delegating math to the existing tested `lib/` functions. Mutations must be idempotent: retrying the same action, double-clicking, or completing from two devices must not double-award XP.

- `getTodaySnapshot()` — ensures today's `daily_log` and its `quest_instance` rows exist (lazily, via `buildInstancesFromTemplate` from the active week's templates); ensures the current `weekly_log` + `weekly_quest_instance` rows exist. Creation must use unique constraints/upserts so concurrent loads from phone + laptop cannot create duplicate instances. Returns `{ profile, dailyQuests, weeklyQuests, weekStart }`.
- `setQuestProgress(instanceId, actualValue)` — updates count/timer progress and recomputes the instance's potential `xp_awarded` via `computePartialXp`. This does **not** mutate `profile` XP; profile XP changes only when a quest transitions from incomplete → complete.
- `completeQuest(instanceId)` — idempotently transitions incomplete → complete, applies that instance's awarded XP to `profile`, records any `level_up_event`, and recomputes daily/weekly clear state + streak.
- `uncompleteQuest(instanceId)` — transitions complete → incomplete for task correction, but does **not** procedurally subtract XP in Task 1. If XP reversal becomes necessary, implement it as a separate tested recomputation path (`recomputeProfileFromAwardedInstances`) rather than subtracting level state by hand.
- `setWeeklyProgress(weeklyInstanceId, actualValue)` — weekly DIS equivalent.
- `planWeek(templateInputs)` — upserts the current week's `quest_template` rows (validated with `TemplateInputSchema`). Template edits affect future materialization only: already-created daily/weekly instances remain historical snapshots unless a future explicit "edit today's quest" feature is added.

**Client hook** — `useTracker(initialSnapshot)`:
- Seeded by the server component at `/` calling `getTodaySnapshot()`.
- Every mutation updates local state immediately, fires the matching server action, and on failure rolls back to the server's returned truth and shows a `sonner` toast.
- Holds no localStorage; in-memory only.

**Lazy instance creation:** daily/weekly rows are materialized on first load of a given day/week, not by a cron job. This keeps Task 1 free of scheduled infrastructure (the reason email reminders are deferred). Add database uniqueness where needed before implementing this:

- `quest_instance`: unique `(daily_log_id, template_id)` for template-backed rows.
- `weekly_quest_instance`: unique `(weekly_log_id, template_id)` for template-backed rows.
- Action code should tolerate conflict/no-op results and then re-read canonical rows.

### 2. View split

`app/page.tsx` becomes a thin **server component**: fetch the snapshot, render `<TrackerRoot snapshot={...} />` (client).

`<TrackerRoot>` picks a shell by viewport — CSS-driven with an SSR-safe `useMediaQuery` guard defaulting mobile-first to avoid hydration flash:

- **Shared domain components** (device-agnostic, driven by `useTracker`): `QuestCard` (checkbox / count / timer variants), `StatRing`, `WeekPlanner`, `StreakBadge`, `LevelMeter`.
- **`<DesktopExperience>`** — the existing Lenis scroll-3D narrative (hero → INT → STR → DIS → summary), refactored to consume the shared components instead of local seed state.
- **`<MobileApp>`** — stacked/tabbed dashboard (Today / Week / Stats), no scroll-jacking, three.js scene disabled with a static hero fallback for fast taps and battery. The Three/Lenis desktop experience should be dynamically loaded so mobile does not download or initialize the 3D stack.

The 1428-line monolith is decomposed in the process; no business logic remains in the view.

### 3. Auth gating

- Re-enable the parked Next proxy (`proxy.ts.disabled` → `proxy.ts`): unauthenticated requests to `/` redirect to `/login`; `/login` and `/auth/*` stay public. Do not rename this to `middleware.ts` if the app is on Next 16.
- The existing `signInWithOtp` flow and the `on_auth_user_created` trigger already handle "email = account, auto-seed 8 starter quests."
- Verify the `/auth/callback` route round-trips a session cookie via the SSR client.

### 4. Migration, testing, verification

- **localStorage retirement:** old `slvl.plan.*` keys were demo data, not records — discarded silently. No import path.
- **Tests:**
  - `lib/` unit coverage already exists; keep it.
  - Add action-level tests (mocked Supabase) for XP application, idempotent completion, level-up, and streak transitions.
  - One Playwright e2e: sign in → complete a quest → reload → still complete (proves persistence).
  - One concurrency/idempotency check: complete the same quest twice or from two clients → quest remains complete and XP is awarded once.
- **Verification:** drive both viewports with the browse tool — mobile tap-to-complete is optimistic and survives reload; desktop scroll narrative still renders the live data.

## Component / module boundaries

| Unit | Purpose | Depends on |
|---|---|---|
| `app/actions/tracker.ts` | All mutations + snapshot read | `lib/supabase/server`, `lib/quests`, `lib/xp`, `lib/plan`, `lib/time` |
| `hooks/use-tracker.ts` | Optimistic client state + rollback | server actions, `sonner` |
| `components/tracker/*` | Shared device-agnostic UI | `use-tracker` |
| `components/shells/desktop-experience.tsx` | Scroll-3D narrative shell | shared components, `components/scene/*` |
| `components/shells/mobile-app.tsx` | Tabbed dashboard shell | shared components |
| `app/page.tsx` | Server snapshot fetch + shell selection | actions, `TrackerRoot` |
| `proxy.ts` | Auth gate + Supabase session refresh | `lib/supabase/proxy` |

## Out of scope (Task 2 and later)

- Friends, social graph, leaderboards, shared weekly challenges/competition.
- Penalty make-up quests, level-up stat-point allocation UI, Resend morning email + its scheduled job.
- These are explicitly deferred; the data layer built here is the seam Task 2 plugs into.

## Success criteria

1. Sign in on laptop, complete quests; open on phone, same account shows the same synced state.
2. Mobile is a fast tabbed dashboard with no scroll-jacking; taps feel instant (optimistic) and survive reload.
3. Desktop retains the scroll-3D narrative, now rendering live Supabase data.
4. XP, level, and streak update correctly and persist (covered by action tests + e2e).
5. `/` redirects to `/login` when signed out.

## Progression v2 (supersedes the XP-threshold + streak leveling above)

Decided 2026-05-31 after the initial build. This replaces target-scaled XP, partial-XP-on-completion, the ×1.4 XP curve, and streak-based progression.

**Category model:**
- Categories map to cadence automatically: **INT = daily, STR = daily, DIS = weekly.** The editor has no manual cadence toggle — picking a category sets it.
- **Minimum frame (the floor):** 1 INT (daily) + 1 STR (daily) + 2 DIS (weekly) = 4 tasks. The editor enforces these minimums; users add unlimited tasks above them in any category.

**XP (hard-locked, fixed per category):**
- Completing a task awards a fixed amount by category: **INT 10, STR 10, DIS 20.** Not scaled by target or completion type. Partial progress awards nothing — XP is granted only when a task is completed.
- Each category stat (INT/STR/DIS) is the running total of XP earned in that category.

**Leveling (weekly, completion-based):**
- Weekly completion % = completed ÷ total over the week's pool = **all daily task-instances across the 7 days (INT + STR) + the weekly DIS tasks.**
- At the end of a week, if completion ≥ **85%**, the user gains **+1 level**. Evaluated when the next week's plan is created (the carry-forward hook in `getTodaySnapshot`).
- The level meter's points-to-next grows **×1.15 per level** (`xp_to_next(L) = round(BASE × 1.15^(L-1))`, BASE ≈ 150 so one ~85% week on the minimum frame ≈ one level). XP accumulated during the week fills the meter; the 85% gate is what banks the level.
- `lib/xp.ts` growth factor changes 1.4 → 1.15. `completeQuest` accumulates XP into stats + meter but no longer triggers level-up directly; level-up moves to the weekly evaluation.

**Snapshot additions:** `TrackerProfile`/`TrackerSnapshot` gain the current week's completion % (and counts) so the UI can show progress toward the 85% level gate.
6. Completing the same quest twice, from one tab or two devices, does not double-award XP.
