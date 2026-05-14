# Solo Leveling Life

A personal gamified daily-discipline tracker inspired by *Solo Leveling*. Track three stats — **Intelligence**, **Strength**, **Discipline** — by clearing daily quests you plan one week at a time. Hit your weekly DIS targets, build streaks, level up.

## What it does

- **Plan a week, not a day** — Set your daily tasks on Monday. Each week's plan carries forward from the last; edit anytime.
- **Per-day scheduling** — Tag each quest with the days it should run (e.g. Run only on M/W/F).
- **Three stats** — INT (study/read), STR (push-ups, sit-ups, run), DIS (meditate, no phone after 11pm).
- **Weekly DIS goals** — Discipline quests run on a weekly cadence with cumulative progress + day-of-week dots. XP awards when the week's target is hit.
- **Locked XP** — Quest XP is auto-computed from cadence × completion type × target × penalty. No gaming it.
- **3D character per stat** — Mixamo-rigged figure shifts pose as you scroll: idle → thinking (INT) → push-ups (STR) → meditation (DIS).
- **Streak tracking + penalty quests** — Miss a day, get a 50% harder make-up quest the next day.

## Tech stack

- Next.js 16 (App Router, Turbopack) + React 19
- TypeScript strict mode, Tailwind CSS v4
- `motion` for scroll-driven animations
- `three.js` + `@react-three/fiber` + `@react-three/drei` for the 3D character
- Vitest (unit) + Playwright (e2e)
- Supabase (Postgres + Auth + RLS) — migrations ready in `supabase/migrations/`
- Resend (planned) — daily morning quest email

## Getting started

```
npm install
npm run dev
```

Open http://localhost:3000.

## Run tests

```
npm test          # vitest unit tests
npm run e2e       # playwright e2e
```

## Project layout

```
app/             Next.js app router pages
  page.tsx       Single-page scroll dashboard (hero → INT → STR → DIS → summary)
components/
  scene/         3D scene (HeroScene + Mixamo Mannequin)
  animations/   Activity rings, count-ups
  ui/            shadcn primitives
lib/
  xp.ts          Pure XP / leveling math (tested)
  time.ts        Timezone-aware day/week boundaries (tested)
  quests.ts      Quest generation + clearing logic (tested)
  plan.ts        Per-week plan carry-forward (tested)
  types.ts       Shared types + zod schemas
public/models/   Mixamo FBX rigs (idle, thinking, push-up, sitting)
supabase/
  migrations/    0001 schema, 0002 RLS, 0003 weekly planning + auto-seed
```

## Storage model

Right now the app persists plan + progress to `localStorage`. Supabase is not yet wired up — the migration files are ready for when auth lands. Keys used:

- `slvl.lastSeenWeek` — last week the user visited (for new-week banner trigger)
- `slvl.plan.<YYYY-MM-DD>` — the plan + progress for that Monday-week

When Supabase is wired, this same shape moves server-side: `week_plan` table owns the week, `quest_template` rows belong to one plan, `quest_instance` / `weekly_quest_instance` track per-day / per-week progress.

## Deploy

Recommended: connect this repo to Vercel. No env vars required for the local-storage version. When Supabase wires up, add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel project settings.
