# Solo Leveling Life — Design Spec

**Author:** Hassan Khanafer
**Date:** 2026-05-11
**Status:** Draft, pending review

---

## 1. Purpose

A personal gamified daily-discipline web app modeled on the Solo Leveling System. Hassan defines a daily quest template (workout reps, study time, etc.). Each morning the System instantiates today's quests, emails him the list, and locks a "Relax Gate" until all required quests are cleared. Completing quests grants XP and stat-specific gains; level-ups grant free stat points to allocate manually. Missed quests break streaks and trigger Penalty Quests the next day. A long-term Title progression mirrors Solo Leveling's job-change beats.

The goal is not a SaaS — it is a single-user productivity tool deployed cheaply, accessible from phone and desktop, with persistent server-side state so streaks and stats survive forever.

## 2. Constraints & Non-Goals

### Constraints
- Free hosting (Vercel + Supabase + Resend free tiers)
- Web-based, mobile-friendly via responsive design
- Installable as a PWA on iPhone home screen
- Auth required even though single-user (RLS-scoped from day one for future-proofing)
- Production-quality code: TypeScript strict, tested critical paths, deployable

### Non-Goals (explicit YAGNI)
- Multi-user social features (friends, leaderboards, shared quests)
- Native iOS / Android apps
- Push notifications (email covers the daily nudge)
- Real OS-level app blocking (impossible from a web app)
- AI-generated quests
- Real-time websockets / live updates

## 3. Core Mechanics

### 3.1 The Player
One profile per auth user. Hassan is the only player at launch.

### 3.2 Stats (5)
| Stat | Real-life mapping |
|---|---|
| **STR** | Workout / physical reps |
| **VIT** | Endurance — cardio, runs, long sessions |
| **AGI** | Speed — finishing daily quests early |
| **INT** | Study, reading, coding, learning |
| **PER** | Discipline — consistency, streak length |

All stats start at 10. Player Level is computed from total stat sum but tracked separately as a denormalized field for performance.

### 3.3 XP & Leveling
- Each quest is tagged with a **primary stat** and a **base XP** value.
- Completing a quest awards XP to a global pool **AND** a small direct stat boost (+1) to the tagged stat.
- XP threshold formula: `xp_to_next = ceil(100 * 1.4 ^ level)`.
- Hitting the threshold triggers a **Level Up** event: +5 free stat points granted, banked as `unallocated_points`.
- Allocation is manual via the Level Up modal; unallocated points persist across sessions.

### 3.4 Daily Quest Template
- Hassan defines a list of quest templates in Settings (e.g. "100 push-ups → STR, 50 XP").
- Each morning at the configured **reset hour** (default 4 AM local), today's quests are instantiated as `quest_instance` rows snapshotted from the template (name/target/xp frozen so later template edits don't retroactively alter history).

### 3.5 Quest Completion Types
- **Checkbox** — binary done/not done; full XP on completion.
- **Count** — target reps. Full XP and `+1` stat boost awarded immediately when `actual >= target`. If end-of-day reconciliation runs and `actual < target`, partial XP = `(actual / target) * base_xp` is awarded (no stat boost for partial).
- **Timer** — built-in start/stop; tracks elapsed real minutes; XP rules identical to count.

Each completed (target-met) quest awards `+1` to its `primary_stat`. Partial completions at reconciliation award XP only, not the stat boost.

### 3.6 The Relax Gate
- Dashboard banner reflects whether all **required** quests are cleared.
- LOCKED: shows count of remaining required quests.
- CLEARED: shows `cleared_at` timestamp + delta vs yesterday's clear time.
- Optional quests don't gate clearing but still award XP.

### 3.7 Streak & Penalty Zone
- Streak = consecutive days where all required quests cleared.
- Missing a day → streak resets, `daily_log.status = 'missed'`.
- Next day's quest list auto-includes one **Penalty Quest**: a non-skippable +50%-target variant of a randomly selected required quest. The penalty quest itself counts as required and blocks the Relax Gate until cleared.
- Only one penalty quest is queued at a time; consecutive misses don't stack.

### 3.8 Titles (long-term hooks)
| Level | Title | Effect |
|---|---|---|
| 1 | (none) | — |
| 10 | Awakened | +5% XP gain |
| 25 | Elite Hunter | +5% XP gain (stacks → +10%) |
| 50 | Necromancer | +5% XP gain (stacks → +15%) |
| 100 | Shadow Monarch | +5% XP gain (stacks → +20%) |

Pure flair + small mechanical reward to keep the long-game alive.

## 4. Email Notification

Every morning at the configured **email send hour** (default 7 AM local), an email is delivered via Resend to **hassan.khanafer100@gmail.com**.

Email contents:
- Subject: `⚔️ Daily Quest — Wed May 11 — Lv 14 (🔥 23-day streak)`
- Body:
  - Today's quest list with reps/targets, primary stat, XP value
  - Current Player Level + XP bar to next level
  - Streak counter
  - Penalty Quest warning banner at top if active
  - Single "Open Dashboard" button → `APP_URL`
- Informational only — no inline completion (avoids signed-URL complexity).
- Configurable: email enabled toggle, target address, send hour.
- Deduped by unique `(user_id, quest_date)` in `email_log`.

## 5. Data Model

Six tables, all scoped by `user_id = auth.uid()` via Row-Level Security. The implementation plan will produce versioned SQL migrations matching these definitions.

### `profile` (one row per auth user)
`user_id` (uuid, PK, FK → auth.users), `display_name` (text), `level` (int, default 1), `total_xp` (bigint, default 0), `xp_in_level` (int, default 0), `xp_to_next` (int), `stat_str` `stat_vit` `stat_agi` `stat_int` `stat_per` (int, each default 10), `unallocated_points` (int, default 0), `title` (text, default 'Novice'), `streak_current` (int, default 0), `streak_best` (int, default 0), `reset_hour_local` (int, default 4), `email_target` (text), `email_enabled` (bool, default true), `email_send_hour_local` (int, default 7), `timezone` (text, default 'America/New_York'), `created_at` `updated_at` (timestamptz).

### `quest_template`
`id` (uuid, PK), `user_id` (uuid, FK), `name` (text), `completion_type` (enum: `checkbox` | `count` | `timer`), `target_value` (int, nullable), `primary_stat` (enum: STR | VIT | AGI | INT | PER), `base_xp` (int), `is_required` (bool), `sort_order` (int), `active` (bool, default true).

### `daily_log` (one row per user per day)
`id` (uuid, PK), `user_id` (uuid), `quest_date` (date), `status` (enum: `pending` | `cleared` | `missed`), `cleared_at` (timestamptz, nullable), `has_penalty_quest` (bool, default false), `created_at` (timestamptz). Unique constraint on `(user_id, quest_date)`.

### `quest_instance`
`id` (uuid, PK), `user_id` (uuid), `daily_log_id` (uuid, FK), `template_id` (uuid, FK, nullable — null for penalty quests), `name` (text, snapshot), `completion_type` (enum), `target_value` (int), `actual_value` (int, default 0), `primary_stat` (enum), `base_xp` (int), `xp_awarded` (int, default 0), `is_required` (bool), `is_penalty` (bool, default false), `completed` (bool, default false), `completed_at` (timestamptz, nullable), `timer_started_at` (timestamptz, nullable).

### `level_up_event`
`id` (uuid, PK), `user_id` (uuid), `from_level` `to_level` (int), `points_granted` (int), `allocation` (jsonb, e.g. `{"str": 2, "int": 3}`), `title_unlocked` (text, nullable), `created_at` (timestamptz).

### `email_log`
`id` (uuid, PK), `user_id` (uuid), `quest_date` (date), `sent_at` (timestamptz), `status` (enum: `sent` | `failed`), `error` (text, nullable). Unique constraint on `(user_id, quest_date)` to dedupe cron retries.

## 6. Screens

| Route | Purpose |
|---|---|
| `/login` | Supabase magic-link auth |
| `/` (Dashboard) | Relax Gate, today's quest list, XP bar, streak — 90% of usage |
| `/character` | Stats sheet, title progression, 30-day completion heatmap |
| `/history` | Calendar of past `daily_log` entries with drill-down |
| `/settings` | Template editor, schedule (reset hour, email send hour, timezone), email config |

Modal: **Level Up** — auto-opens on level threshold crossing; reopens on next login if `unallocated_points > 0`.

## 7. Scheduled Jobs

- **Hourly Vercel Cron → `/api/cron/tick`** — checks each user's local time:
  - If local hour == `reset_hour_local` AND no `daily_log` exists for today → instantiate today's quests (including penalty quest if yesterday missed).
  - If local hour == `email_send_hour_local` AND no `email_log` row exists for today → send daily quest email.
  - If local hour == end-of-day (`reset_hour_local - 1`) → reconcile: award partial XP for count/timer quests, mark `daily_log` as cleared or missed, update streak.
- Cron requests authenticated via `CRON_SECRET` header.
- Idempotent — safe to run multiple times.

## 8. Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router, RSC, Server Actions) |
| Language | TypeScript strict mode |
| Styling | Tailwind CSS v4 |
| UI components | shadcn/ui |
| Database | Supabase Postgres |
| Auth | Supabase Auth (email magic link) |
| Email | Resend + React Email templates |
| Cron | Vercel Cron Jobs |
| Hosting | Vercel (auto-deploy from GitHub) |
| Mobile | PWA via `manifest.json` + service worker |
| Testing | Vitest (unit) + Playwright (one happy-path E2E) |

## 9. Repo Layout

```
solo-leveling-life/
├── app/
│   ├── (auth)/login/page.tsx
│   ├── page.tsx                 ← Dashboard
│   ├── character/page.tsx
│   ├── history/page.tsx
│   ├── settings/page.tsx
│   ├── api/cron/tick/route.ts
│   └── actions/
│       ├── completeQuest.ts
│       ├── allocatePoints.ts
│       └── updateTemplate.ts
├── lib/
│   ├── supabase/                ← client + server helpers
│   ├── xp.ts                    ← XP math, level thresholds, title unlocks
│   ├── quests.ts                ← instantiation, penalty logic, reconciliation
│   └── email/
│       ├── send.ts              ← Resend wrapper
│       └── DailyQuestEmail.tsx
├── supabase/
│   ├── migrations/
│   └── seed.sql
├── public/
│   ├── manifest.json
│   └── icons/
├── components/
├── .env.local.example
├── next.config.ts
└── package.json
```

## 10. Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
CRON_SECRET=
APP_URL=
```

## 11. Implementation Plan Directives

The implementation plan (writing-plans skill) MUST:

- Use the **`ui-ux-pro-max`** plugin/skill for all UI/UX design and component decisions (visual style, spacing, color, typography, layout). The aesthetic target is a Solo Leveling-inspired dark UI — deep blacks, electric blue/purple highlights for level-up and Monarch moments, monospace numerals for stats.
- Use **`fullstack-dev-skills:nextjs-developer`** for Next.js 15 App Router patterns (Server Components, Server Actions, route handlers).
- Use **`fullstack-dev-skills:fastapi-expert`** *only if* the implementation diverges to a Python backend (it should not — Next.js Server Actions are the API layer).
- Use **`fullstack-dev-skills:typescript-pro`** for type system patterns (branded types for IDs, exhaustive enums, zod schemas at boundaries).
- Use **`fullstack-dev-skills:postgres-pro`** or **`fullstack-dev-skills:database-optimizer`** for the Supabase schema, indexes, and RLS policies.
- Use **`fullstack-dev-skills:secure-code-guardian`** for the cron endpoint auth, input validation, and CSRF on Server Actions.
- Use **`fullstack-dev-skills:fullstack-guardian`** for end-to-end auth boundary verification.
- Use **`superpowers:test-driven-development`** for the XP math and penalty logic — these are the only places where a bug would silently corrupt stats.
- Use **`fullstack-dev-skills:code-reviewer`** for a self-review pass before claiming done.
- Use **`superpowers:verification-before-completion`** before declaring any phase complete.

## 12. Acceptance Criteria

- App deploys to a Vercel URL with zero runtime errors.
- Login works via magic link to `hassan.khanafer100@gmail.com`.
- A daily quest template can be created, edited, and saved.
- The hourly cron tick correctly:
  - Instantiates today's quests at the local reset hour
  - Sends the daily email at the local email send hour (received in inbox)
  - Reconciles missed quests at end of day and queues a penalty quest
- Completing all required quests flips the Relax Gate to CLEARED and records `cleared_at`.
- Hitting a level threshold opens the Level Up modal and persists allocated points.
- The PWA installs to iPhone home screen and launches full-screen.
- Critical math (`lib/xp.ts`, `lib/quests.ts`) has unit tests passing.
- One Playwright happy-path test passes (login → complete a quest → see XP gain).
- All Supabase queries pass RLS verification (a second `auth.uid()` cannot read row data).

## 13. Open Questions

None at design time. Sender-domain choice for Resend (use Resend's onboarding subdomain vs verifying a custom domain) is deferred to implementation — the onboarding subdomain is fine for personal use.
