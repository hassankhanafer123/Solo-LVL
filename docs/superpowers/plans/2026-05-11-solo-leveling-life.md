# Solo Leveling Life Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personal gamified daily-discipline web app that emails Hassan his daily quests every morning, gates a "Relax" status until quests are cleared, awards XP with stat-allocation level-ups, and tracks streaks with Penalty Quests — deployed free on Vercel + Supabase + Resend.

**Architecture:** Next.js 15 App Router monorepo. Postgres schema in Supabase (RLS-scoped to `auth.uid()`). Server Actions handle all mutations (no separate API). One hourly Vercel cron tick reconciles per-user local time for quest instantiation, email send, and end-of-day reconciliation. UI built with Tailwind v4 + shadcn/ui in a Solo Leveling dark aesthetic. PWA-installable on iPhone.

**Tech Stack:** Next.js 15, React 19, TypeScript (strict), Tailwind CSS v4, shadcn/ui, Supabase (Postgres + Auth), Resend (email), Vitest (unit), Playwright (E2E), Vercel (host + cron), pnpm.

**Required skills/plugins:**
- `ui-ux-pro-max` for all UI/UX style decisions (color, typography, spacing, layout, component aesthetic)
- `fullstack-dev-skills:nextjs-developer` for Next.js 15 App Router patterns
- `fullstack-dev-skills:typescript-pro` for type-system patterns
- `fullstack-dev-skills:postgres-pro` for schema + RLS + indexes
- `fullstack-dev-skills:secure-code-guardian` for cron auth, CSRF, input validation
- `fullstack-dev-skills:fullstack-guardian` for end-to-end auth verification
- `superpowers:test-driven-development` for `lib/xp.ts` and `lib/quests.ts`
- `superpowers:verification-before-completion` before any "done" claim
- `fullstack-dev-skills:code-reviewer` for a final review pass

---

## File Structure

```
solo-leveling-life/
├── app/
│   ├── (auth)/
│   │   └── login/
│   │       └── page.tsx                  # Magic-link login form
│   ├── layout.tsx                         # Root layout + PWA <head>
│   ├── globals.css                        # Tailwind base + theme tokens
│   ├── page.tsx                           # Dashboard (RSC)
│   ├── character/page.tsx                 # Stats + heatmap (RSC)
│   ├── history/page.tsx                   # Calendar (RSC)
│   ├── settings/
│   │   ├── page.tsx                       # Tab shell
│   │   ├── template/page.tsx              # Template editor
│   │   └── schedule/page.tsx              # Reset hour, email config
│   ├── api/
│   │   ├── cron/tick/route.ts             # Hourly cron entrypoint
│   │   └── auth/callback/route.ts         # Supabase magic-link callback
│   └── actions/
│       ├── completeQuest.ts               # Server Action
│       ├── updateQuestProgress.ts         # Server Action (count/timer)
│       ├── allocatePoints.ts              # Server Action
│       ├── updateTemplate.ts              # Server Action
│       └── updateSettings.ts              # Server Action
├── components/
│   ├── ui/                                # shadcn primitives
│   ├── dashboard/
│   │   ├── RelaxGate.tsx
│   │   ├── QuestList.tsx
│   │   ├── QuestRow.tsx
│   │   ├── CountQuestControl.tsx
│   │   ├── TimerQuestControl.tsx
│   │   └── PlayerHeader.tsx
│   ├── character/
│   │   ├── StatSheet.tsx
│   │   ├── TitleProgress.tsx
│   │   └── Heatmap.tsx
│   ├── settings/
│   │   ├── TemplateEditor.tsx
│   │   └── ScheduleForm.tsx
│   ├── modals/
│   │   └── LevelUpModal.tsx
│   └── history/
│       └── HistoryCalendar.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts                      # Browser client
│   │   ├── server.ts                      # Server component client
│   │   └── service.ts                     # Service-role client (cron only)
│   ├── xp.ts                              # Pure XP/level math
│   ├── xp.test.ts
│   ├── quests.ts                          # Quest instantiation, penalty, reconciliation
│   ├── quests.test.ts
│   ├── time.ts                            # Timezone-aware date helpers
│   ├── time.test.ts
│   ├── types.ts                           # Shared TS types + zod schemas
│   └── email/
│       ├── send.ts                        # Resend wrapper
│       └── DailyQuestEmail.tsx            # React Email template
├── supabase/
│   ├── migrations/
│   │   ├── 0001_init.sql                  # Tables + enums + indexes
│   │   └── 0002_rls.sql                   # RLS policies
│   └── seed.sql                           # Default quest template
├── e2e/
│   └── happy-path.spec.ts                 # Playwright E2E
├── public/
│   ├── manifest.json                      # PWA manifest
│   ├── sw.js                              # Minimal service worker
│   └── icons/                             # PWA icons (multiple sizes)
├── docs/
│   └── superpowers/
│       ├── specs/2026-05-11-solo-leveling-life-design.md
│       └── plans/2026-05-11-solo-leveling-life.md
├── .env.local.example
├── .env.local                              # gitignored
├── .gitignore
├── next.config.ts
├── vercel.json                             # Cron config
├── tailwind.config.ts
├── tsconfig.json
├── vitest.config.ts
├── playwright.config.ts
├── package.json
└── README.md
```

---

## Task 1: Project Scaffolding & Tooling

**Files:**
- Create: entire project skeleton via `create-next-app`
- Create: `.env.local.example`, `.gitignore`, `README.md`, `vitest.config.ts`
- Modify: `package.json`, `tsconfig.json`

- [ ] **Step 1: Scaffold Next.js 15 into the existing directory**

The directory already contains `docs/` and a git repo. Scaffold into a temp subdir then move files up.

```bash
cd "/Users/hassankhanafer/Desktop/Hassans Brain/Projects/Solo Leveling Life"
pnpm dlx create-next-app@latest .scaffold --typescript --tailwind --app --eslint --src-dir=false --import-alias "@/*" --use-pnpm --no-turbo --yes
# Move scaffold contents up
shopt -s dotglob
mv .scaffold/* .
mv .scaffold/.[!.]* . 2>/dev/null || true
rmdir .scaffold
```

Expected: `package.json`, `app/`, `tsconfig.json`, etc. now in project root alongside `docs/`.

- [ ] **Step 2: Install runtime dependencies**

```bash
pnpm add @supabase/supabase-js @supabase/ssr resend react-email @react-email/components zod date-fns date-fns-tz
pnpm add -D @types/node vitest @vitest/ui @testing-library/react @testing-library/jest-dom jsdom @playwright/test
```

- [ ] **Step 3: Install shadcn/ui**

```bash
pnpm dlx shadcn@latest init -d
# Choose: New York style, Zinc base color, CSS variables yes
pnpm dlx shadcn@latest add button card input label dialog toast badge progress separator tabs
```

Expected: `components/ui/*.tsx` files created.

- [ ] **Step 4: Configure TypeScript strict mode**

Modify `tsconfig.json` `compilerOptions`:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true
  }
}
```

- [ ] **Step 5: Create `.env.local.example`**

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
CRON_SECRET=generate-with-openssl-rand-hex-32
APP_URL=http://localhost:3000
```

- [ ] **Step 6: Configure Vitest**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './') },
  },
});
```

Create `vitest.setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

Add to `package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:e2e": "playwright test"
```

- [ ] **Step 7: Configure Playwright**

```bash
pnpm dlx playwright install --with-deps chromium
```

Create `playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

- [ ] **Step 8: Verify build works**

```bash
pnpm build
```

Expected: build succeeds with zero errors.

- [ ] **Step 9: Commit**

```bash
git add .
git commit -m "chore: scaffold Next.js 15 + Tailwind + shadcn + Vitest + Playwright"
```

---

## Task 2: Supabase Schema & RLS Migrations

**Files:**
- Create: `supabase/migrations/0001_init.sql`
- Create: `supabase/migrations/0002_rls.sql`
- Create: `supabase/seed.sql`
- Create: `lib/types.ts`

**Required skill:** `fullstack-dev-skills:postgres-pro` for indexes and RLS.

- [ ] **Step 1: Create `supabase/migrations/0001_init.sql`**

```sql
-- Enums
create type completion_type as enum ('checkbox', 'count', 'timer');
create type stat_kind as enum ('STR', 'VIT', 'AGI', 'INT', 'PER');
create type daily_status as enum ('pending', 'cleared', 'missed');
create type email_status as enum ('sent', 'failed');

-- profile
create table profile (
  user_id uuid primary key references auth.users on delete cascade,
  display_name text not null default 'Hunter',
  level int not null default 1,
  total_xp bigint not null default 0,
  xp_in_level int not null default 0,
  xp_to_next int not null default 100,
  stat_str int not null default 10,
  stat_vit int not null default 10,
  stat_agi int not null default 10,
  stat_int int not null default 10,
  stat_per int not null default 10,
  unallocated_points int not null default 0,
  title text not null default 'Novice',
  streak_current int not null default 0,
  streak_best int not null default 0,
  reset_hour_local int not null default 4 check (reset_hour_local between 0 and 23),
  email_target text,
  email_enabled boolean not null default true,
  email_send_hour_local int not null default 7 check (email_send_hour_local between 0 and 23),
  timezone text not null default 'America/New_York',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- quest_template
create table quest_template (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  completion_type completion_type not null,
  target_value int,
  primary_stat stat_kind not null,
  base_xp int not null check (base_xp >= 0),
  is_required boolean not null default true,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index quest_template_user_active_idx on quest_template(user_id, active, sort_order);

-- daily_log
create table daily_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  quest_date date not null,
  status daily_status not null default 'pending',
  cleared_at timestamptz,
  has_penalty_quest boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, quest_date)
);
create index daily_log_user_date_idx on daily_log(user_id, quest_date desc);

-- quest_instance
create table quest_instance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  daily_log_id uuid not null references daily_log on delete cascade,
  template_id uuid references quest_template on delete set null,
  name text not null,
  completion_type completion_type not null,
  target_value int,
  actual_value int not null default 0,
  primary_stat stat_kind not null,
  base_xp int not null,
  xp_awarded int not null default 0,
  is_required boolean not null default true,
  is_penalty boolean not null default false,
  completed boolean not null default false,
  completed_at timestamptz,
  timer_started_at timestamptz,
  created_at timestamptz not null default now()
);
create index quest_instance_daily_log_idx on quest_instance(daily_log_id);
create index quest_instance_user_completed_idx on quest_instance(user_id, completed);

-- level_up_event
create table level_up_event (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  from_level int not null,
  to_level int not null,
  points_granted int not null,
  allocation jsonb,
  title_unlocked text,
  created_at timestamptz not null default now()
);
create index level_up_event_user_idx on level_up_event(user_id, created_at desc);

-- email_log
create table email_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  quest_date date not null,
  sent_at timestamptz not null default now(),
  status email_status not null,
  error text,
  unique (user_id, quest_date)
);

-- updated_at trigger for profile
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger profile_updated_at before update on profile
  for each row execute function set_updated_at();
```

- [ ] **Step 2: Create `supabase/migrations/0002_rls.sql`**

```sql
alter table profile enable row level security;
alter table quest_template enable row level security;
alter table daily_log enable row level security;
alter table quest_instance enable row level security;
alter table level_up_event enable row level security;
alter table email_log enable row level security;

-- profile policies
create policy "profile_self_select" on profile for select using (auth.uid() = user_id);
create policy "profile_self_insert" on profile for insert with check (auth.uid() = user_id);
create policy "profile_self_update" on profile for update using (auth.uid() = user_id);

-- quest_template policies
create policy "quest_template_self_all" on quest_template for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- daily_log policies
create policy "daily_log_self_all" on daily_log for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- quest_instance policies
create policy "quest_instance_self_all" on quest_instance for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- level_up_event policies (read-only from client)
create policy "level_up_event_self_select" on level_up_event for select using (auth.uid() = user_id);
create policy "level_up_event_self_insert" on level_up_event for insert with check (auth.uid() = user_id);

-- email_log: clients cannot write; readable for debugging
create policy "email_log_self_select" on email_log for select using (auth.uid() = user_id);
```

- [ ] **Step 3: Create `supabase/seed.sql` (Hassan's starter template)**

```sql
-- Run AFTER first login when profile row exists. This is a reference seed; the
-- app also has a one-click "load defaults" button on the template editor.
-- Replace :user_id with your actual uuid.
insert into quest_template (user_id, name, completion_type, target_value, primary_stat, base_xp, sort_order)
values
  (:user_id, 'Push-ups', 'count', 100, 'STR', 50, 1),
  (:user_id, 'Sit-ups', 'count', 100, 'STR', 50, 2),
  (:user_id, 'Squats', 'count', 100, 'STR', 50, 3),
  (:user_id, 'Run', 'count', 5, 'VIT', 75, 4),
  (:user_id, 'Study', 'timer', 90, 'INT', 75, 5),
  (:user_id, 'Read', 'timer', 30, 'INT', 25, 6);
```

- [ ] **Step 4: Create `lib/types.ts` with TS types matching the schema**

```ts
import { z } from 'zod';

export const STATS = ['STR', 'VIT', 'AGI', 'INT', 'PER'] as const;
export type StatKind = (typeof STATS)[number];

export const COMPLETION_TYPES = ['checkbox', 'count', 'timer'] as const;
export type CompletionType = (typeof COMPLETION_TYPES)[number];

export const DAILY_STATUSES = ['pending', 'cleared', 'missed'] as const;
export type DailyStatus = (typeof DAILY_STATUSES)[number];

export interface Profile {
  user_id: string;
  display_name: string;
  level: number;
  total_xp: number;
  xp_in_level: number;
  xp_to_next: number;
  stat_str: number;
  stat_vit: number;
  stat_agi: number;
  stat_int: number;
  stat_per: number;
  unallocated_points: number;
  title: string;
  streak_current: number;
  streak_best: number;
  reset_hour_local: number;
  email_target: string | null;
  email_enabled: boolean;
  email_send_hour_local: number;
  timezone: string;
}

export interface QuestTemplate {
  id: string;
  user_id: string;
  name: string;
  completion_type: CompletionType;
  target_value: number | null;
  primary_stat: StatKind;
  base_xp: number;
  is_required: boolean;
  sort_order: number;
  active: boolean;
}

export interface QuestInstance {
  id: string;
  user_id: string;
  daily_log_id: string;
  template_id: string | null;
  name: string;
  completion_type: CompletionType;
  target_value: number | null;
  actual_value: number;
  primary_stat: StatKind;
  base_xp: number;
  xp_awarded: number;
  is_required: boolean;
  is_penalty: boolean;
  completed: boolean;
  completed_at: string | null;
  timer_started_at: string | null;
}

export interface DailyLog {
  id: string;
  user_id: string;
  quest_date: string;
  status: DailyStatus;
  cleared_at: string | null;
  has_penalty_quest: boolean;
}

export const AllocationSchema = z.object({
  str: z.number().int().min(0),
  vit: z.number().int().min(0),
  agi: z.number().int().min(0),
  int: z.number().int().min(0),
  per: z.number().int().min(0),
});
export type Allocation = z.infer<typeof AllocationSchema>;

export const TemplateInputSchema = z.object({
  name: z.string().min(1).max(80),
  completion_type: z.enum(COMPLETION_TYPES),
  target_value: z.number().int().positive().nullable(),
  primary_stat: z.enum(STATS),
  base_xp: z.number().int().min(0).max(1000),
  is_required: z.boolean(),
  sort_order: z.number().int().min(0),
});
export type TemplateInput = z.infer<typeof TemplateInputSchema>;
```

- [ ] **Step 5: Apply migrations**

User must run manually (Supabase CLI or dashboard):

```bash
# Option A: Supabase CLI
supabase db push

# Option B: Dashboard SQL editor — paste 0001_init.sql then 0002_rls.sql
```

- [ ] **Step 6: Commit**

```bash
git add supabase/ lib/types.ts
git commit -m "feat(db): initial schema, RLS policies, and TS types"
```

---

## Task 3: XP Math Module (TDD)

**Files:**
- Create: `lib/xp.ts`
- Test: `lib/xp.test.ts`

**Required skill:** `superpowers:test-driven-development`. This is where a bug silently corrupts your stats forever — TDD is mandatory.

- [ ] **Step 1: Write failing tests for level threshold**

Create `lib/xp.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  xpToNext,
  applyXpGain,
  titleForLevel,
  TITLE_BONUS,
} from './xp';

describe('xpToNext', () => {
  it('returns 100 at level 1', () => {
    expect(xpToNext(1)).toBe(100);
  });
  it('scales by 1.4x per level', () => {
    expect(xpToNext(2)).toBe(Math.ceil(100 * 1.4));
    expect(xpToNext(3)).toBe(Math.ceil(100 * 1.4 ** 2));
    expect(xpToNext(10)).toBe(Math.ceil(100 * 1.4 ** 9));
  });
});

describe('titleForLevel', () => {
  it('returns Novice below level 10', () => {
    expect(titleForLevel(1)).toBe('Novice');
    expect(titleForLevel(9)).toBe('Novice');
  });
  it('returns Awakened at 10, Elite Hunter at 25, Necromancer at 50, Shadow Monarch at 100', () => {
    expect(titleForLevel(10)).toBe('Awakened');
    expect(titleForLevel(24)).toBe('Awakened');
    expect(titleForLevel(25)).toBe('Elite Hunter');
    expect(titleForLevel(49)).toBe('Elite Hunter');
    expect(titleForLevel(50)).toBe('Necromancer');
    expect(titleForLevel(99)).toBe('Necromancer');
    expect(titleForLevel(100)).toBe('Shadow Monarch');
    expect(titleForLevel(150)).toBe('Shadow Monarch');
  });
});

describe('TITLE_BONUS', () => {
  it('is +5% per title tier, cumulative', () => {
    expect(TITLE_BONUS.Novice).toBe(1.0);
    expect(TITLE_BONUS.Awakened).toBe(1.05);
    expect(TITLE_BONUS['Elite Hunter']).toBe(1.10);
    expect(TITLE_BONUS.Necromancer).toBe(1.15);
    expect(TITLE_BONUS['Shadow Monarch']).toBe(1.20);
  });
});

describe('applyXpGain', () => {
  const baseProfile = {
    level: 1,
    total_xp: 0,
    xp_in_level: 0,
    xp_to_next: 100,
    unallocated_points: 0,
    title: 'Novice' as const,
  };

  it('adds XP within the same level', () => {
    const r = applyXpGain(baseProfile, 30);
    expect(r.level).toBe(1);
    expect(r.xp_in_level).toBe(30);
    expect(r.total_xp).toBe(30);
    expect(r.unallocated_points).toBe(0);
    expect(r.levels_gained).toBe(0);
  });

  it('levels up exactly once when crossing threshold', () => {
    const r = applyXpGain(baseProfile, 100);
    expect(r.level).toBe(2);
    expect(r.xp_in_level).toBe(0);
    expect(r.xp_to_next).toBe(Math.ceil(100 * 1.4));
    expect(r.unallocated_points).toBe(5);
    expect(r.levels_gained).toBe(1);
  });

  it('levels up multiple times in one gain', () => {
    const r = applyXpGain(baseProfile, 1000);
    expect(r.level).toBeGreaterThan(2);
    expect(r.unallocated_points).toBe(r.levels_gained * 5);
    expect(r.total_xp).toBe(1000);
  });

  it('applies title bonus to incoming XP', () => {
    const monarch = { ...baseProfile, level: 100, title: 'Shadow Monarch' as const, xp_to_next: 1_000_000 };
    const r = applyXpGain(monarch, 100);
    expect(r.total_xp).toBe(120); // +20%
    expect(r.xp_in_level).toBe(120);
  });

  it('unlocks new title on level-up', () => {
    const near10 = { ...baseProfile, level: 9, xp_in_level: 0, xp_to_next: xpToNext(9), title: 'Novice' as const };
    const r = applyXpGain(near10, 999_999);
    expect(r.title).toBe('Awakened');
    expect(r.title_unlocked).toBe('Awakened');
  });

  it('rejects negative XP', () => {
    expect(() => applyXpGain(baseProfile, -10)).toThrow();
  });

  it('treats zero XP as no-op', () => {
    const r = applyXpGain(baseProfile, 0);
    expect(r).toMatchObject({ level: 1, xp_in_level: 0, levels_gained: 0 });
  });
});
```

- [ ] **Step 2: Run tests — verify all fail**

```bash
pnpm test lib/xp.test.ts
```

Expected: all tests FAIL with module-not-found.

- [ ] **Step 3: Implement `lib/xp.ts`**

```ts
export type Title = 'Novice' | 'Awakened' | 'Elite Hunter' | 'Necromancer' | 'Shadow Monarch';

export const TITLE_BONUS: Record<Title, number> = {
  Novice: 1.0,
  Awakened: 1.05,
  'Elite Hunter': 1.10,
  Necromancer: 1.15,
  'Shadow Monarch': 1.20,
};

const TITLE_THRESHOLDS: ReadonlyArray<[number, Title]> = [
  [100, 'Shadow Monarch'],
  [50, 'Necromancer'],
  [25, 'Elite Hunter'],
  [10, 'Awakened'],
  [1, 'Novice'],
];

export function xpToNext(level: number): number {
  if (level < 1) throw new Error('level must be >= 1');
  return Math.ceil(100 * Math.pow(1.4, level - 1));
}

export function titleForLevel(level: number): Title {
  for (const [threshold, title] of TITLE_THRESHOLDS) {
    if (level >= threshold) return title;
  }
  return 'Novice';
}

export interface XpInput {
  level: number;
  total_xp: number;
  xp_in_level: number;
  xp_to_next: number;
  unallocated_points: number;
  title: Title;
}

export interface XpResult extends XpInput {
  levels_gained: number;
  title_unlocked: Title | null;
}

export function applyXpGain(profile: XpInput, rawXp: number): XpResult {
  if (rawXp < 0) throw new Error('rawXp must be >= 0');
  if (rawXp === 0) {
    return { ...profile, levels_gained: 0, title_unlocked: null };
  }

  const bonus = TITLE_BONUS[profile.title];
  const xp = Math.floor(rawXp * bonus);

  let level = profile.level;
  let xpInLevel = profile.xp_in_level + xp;
  let threshold = profile.xp_to_next;
  let pointsGained = 0;
  let levelsGained = 0;
  const startTitle = profile.title;

  while (xpInLevel >= threshold) {
    xpInLevel -= threshold;
    level += 1;
    levelsGained += 1;
    pointsGained += 5;
    threshold = xpToNext(level);
  }

  const newTitle = titleForLevel(level);
  const titleUnlocked = newTitle !== startTitle ? newTitle : null;

  return {
    level,
    total_xp: profile.total_xp + xp,
    xp_in_level: xpInLevel,
    xp_to_next: threshold,
    unallocated_points: profile.unallocated_points + pointsGained,
    title: newTitle,
    levels_gained: levelsGained,
    title_unlocked: titleUnlocked,
  };
}
```

- [ ] **Step 4: Run tests — verify all pass**

```bash
pnpm test lib/xp.test.ts
```

Expected: 11/11 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/xp.ts lib/xp.test.ts
git commit -m "feat(xp): pure-function XP/level/title math with full TDD coverage"
```

---

## Task 4: Time & Date Helpers (TDD)

**Files:**
- Create: `lib/time.ts`
- Test: `lib/time.test.ts`

Cron logic depends on per-user local hour. We need timezone-correct helpers.

- [ ] **Step 1: Write failing tests**

Create `lib/time.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { localHour, localDateISO, isSameLocalDate, yesterdayLocal } from './time';

describe('localHour', () => {
  it('returns hour in given timezone', () => {
    // 2026-05-11 17:30 UTC = 13:30 EDT
    const d = new Date('2026-05-11T17:30:00Z');
    expect(localHour(d, 'America/New_York')).toBe(13);
  });
  it('handles UTC tz', () => {
    const d = new Date('2026-05-11T17:30:00Z');
    expect(localHour(d, 'UTC')).toBe(17);
  });
});

describe('localDateISO', () => {
  it('returns YYYY-MM-DD in local tz', () => {
    const d = new Date('2026-05-11T03:00:00Z'); // 23:00 prev day in NYC
    expect(localDateISO(d, 'America/New_York')).toBe('2026-05-10');
  });
});

describe('yesterdayLocal', () => {
  it('returns previous local date', () => {
    expect(yesterdayLocal('2026-05-11')).toBe('2026-05-10');
    expect(yesterdayLocal('2026-01-01')).toBe('2025-12-31');
  });
});

describe('isSameLocalDate', () => {
  it('true when same date in given tz', () => {
    const a = new Date('2026-05-11T10:00:00Z');
    const b = new Date('2026-05-11T22:00:00Z');
    expect(isSameLocalDate(a, b, 'America/New_York')).toBe(true);
  });
  it('false across local-date boundary', () => {
    const a = new Date('2026-05-11T03:00:00Z'); // May 10 in NYC
    const b = new Date('2026-05-11T13:00:00Z'); // May 11 in NYC
    expect(isSameLocalDate(a, b, 'America/New_York')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
pnpm test lib/time.test.ts
```

- [ ] **Step 3: Implement `lib/time.ts`**

```ts
import { formatInTimeZone } from 'date-fns-tz';
import { subDays, parseISO } from 'date-fns';

export function localHour(d: Date, tz: string): number {
  return Number(formatInTimeZone(d, tz, 'H'));
}

export function localDateISO(d: Date, tz: string): string {
  return formatInTimeZone(d, tz, 'yyyy-MM-dd');
}

export function isSameLocalDate(a: Date, b: Date, tz: string): boolean {
  return localDateISO(a, tz) === localDateISO(b, tz);
}

export function yesterdayLocal(isoDate: string): string {
  const d = parseISO(isoDate + 'T12:00:00Z'); // noon to avoid DST edge
  return formatInTimeZone(subDays(d, 1), 'UTC', 'yyyy-MM-dd');
}
```

- [ ] **Step 4: Run tests — verify all pass**

```bash
pnpm test lib/time.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/time.ts lib/time.test.ts
git commit -m "feat(time): timezone-aware local date/hour helpers with tests"
```

---

## Task 5: Quest Logic Module (TDD)

**Files:**
- Create: `lib/quests.ts`
- Test: `lib/quests.test.ts`

**Required skill:** `superpowers:test-driven-development`. This contains penalty selection, partial-XP reconciliation, and required-quest gating — bugs here corrupt streaks.

- [ ] **Step 1: Write failing tests**

Create `lib/quests.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  buildInstancesFromTemplate,
  computePartialXp,
  pickPenaltyTarget,
  evaluateDailyClear,
  buildPenaltyInstance,
} from './quests';
import type { QuestTemplate, QuestInstance } from './types';

const tmpl = (over: Partial<QuestTemplate> = {}): QuestTemplate => ({
  id: 't1',
  user_id: 'u1',
  name: 'Push-ups',
  completion_type: 'count',
  target_value: 100,
  primary_stat: 'STR',
  base_xp: 50,
  is_required: true,
  sort_order: 1,
  active: true,
  ...over,
});

const inst = (over: Partial<QuestInstance> = {}): QuestInstance => ({
  id: 'i1',
  user_id: 'u1',
  daily_log_id: 'd1',
  template_id: 't1',
  name: 'Push-ups',
  completion_type: 'count',
  target_value: 100,
  actual_value: 0,
  primary_stat: 'STR',
  base_xp: 50,
  xp_awarded: 0,
  is_required: true,
  is_penalty: false,
  completed: false,
  completed_at: null,
  timer_started_at: null,
  ...over,
});

describe('buildInstancesFromTemplate', () => {
  it('snapshots template fields onto instance', () => {
    const t = tmpl();
    const out = buildInstancesFromTemplate([t], 'd1', 'u1');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      user_id: 'u1',
      daily_log_id: 'd1',
      template_id: 't1',
      name: 'Push-ups',
      target_value: 100,
      base_xp: 50,
      is_required: true,
      is_penalty: false,
      completed: false,
      actual_value: 0,
    });
  });
  it('skips inactive templates', () => {
    const out = buildInstancesFromTemplate([tmpl({ active: false })], 'd1', 'u1');
    expect(out).toHaveLength(0);
  });
  it('preserves sort order', () => {
    const out = buildInstancesFromTemplate(
      [tmpl({ id: 'a', sort_order: 2 }), tmpl({ id: 'b', sort_order: 1 })],
      'd1',
      'u1'
    );
    expect(out[0].template_id).toBe('b');
    expect(out[1].template_id).toBe('a');
  });
});

describe('computePartialXp', () => {
  it('returns full xp when actual >= target', () => {
    expect(computePartialXp({ actual: 100, target: 100, base_xp: 50 })).toBe(50);
    expect(computePartialXp({ actual: 120, target: 100, base_xp: 50 })).toBe(50);
  });
  it('returns proportional xp when actual < target', () => {
    expect(computePartialXp({ actual: 50, target: 100, base_xp: 50 })).toBe(25);
    expect(computePartialXp({ actual: 33, target: 100, base_xp: 50 })).toBe(16); // floor
  });
  it('returns 0 when actual is 0', () => {
    expect(computePartialXp({ actual: 0, target: 100, base_xp: 50 })).toBe(0);
  });
  it('handles checkbox (target null) — full xp if actual >= 1', () => {
    expect(computePartialXp({ actual: 1, target: null, base_xp: 25 })).toBe(25);
    expect(computePartialXp({ actual: 0, target: null, base_xp: 25 })).toBe(0);
  });
});

describe('pickPenaltyTarget', () => {
  it('chooses among required, non-penalty templates', () => {
    const ts = [
      tmpl({ id: 'a', is_required: true }),
      tmpl({ id: 'b', is_required: false }),
      tmpl({ id: 'c', is_required: true }),
    ];
    const picked = pickPenaltyTarget(ts, () => 0);
    expect(['a', 'c']).toContain(picked!.id);
  });
  it('returns null if no required templates', () => {
    expect(pickPenaltyTarget([tmpl({ is_required: false })], () => 0)).toBeNull();
  });
  it('uses rng to pick deterministically', () => {
    const ts = [tmpl({ id: 'a' }), tmpl({ id: 'b' }), tmpl({ id: 'c' })];
    expect(pickPenaltyTarget(ts, () => 0)!.id).toBe('a');
    expect(pickPenaltyTarget(ts, () => 0.5)!.id).toBe('b');
    expect(pickPenaltyTarget(ts, () => 0.99)!.id).toBe('c');
  });
});

describe('buildPenaltyInstance', () => {
  it('multiplies target by 1.5 for count/timer', () => {
    const p = buildPenaltyInstance(tmpl({ target_value: 100 }), 'd1', 'u1');
    expect(p.target_value).toBe(150);
    expect(p.is_penalty).toBe(true);
    expect(p.is_required).toBe(true);
    expect(p.template_id).toBeNull(); // not linked to original template
    expect(p.name).toBe('Push-ups (Penalty +50%)');
  });
  it('keeps target null for checkbox', () => {
    const p = buildPenaltyInstance(
      tmpl({ completion_type: 'checkbox', target_value: null }),
      'd1',
      'u1'
    );
    expect(p.target_value).toBeNull();
  });
});

describe('evaluateDailyClear', () => {
  it('returns cleared when all required quests done', () => {
    const r = evaluateDailyClear([
      inst({ is_required: true, completed: true }),
      inst({ is_required: false, completed: false }),
    ]);
    expect(r.status).toBe('cleared');
    expect(r.required_remaining).toBe(0);
  });
  it('returns pending when some required incomplete', () => {
    const r = evaluateDailyClear([
      inst({ is_required: true, completed: true }),
      inst({ is_required: true, completed: false }),
    ]);
    expect(r.status).toBe('pending');
    expect(r.required_remaining).toBe(1);
  });
  it('handles empty list as cleared (vacuously)', () => {
    const r = evaluateDailyClear([]);
    expect(r.status).toBe('cleared');
    expect(r.required_remaining).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
pnpm test lib/quests.test.ts
```

- [ ] **Step 3: Implement `lib/quests.ts`**

```ts
import type { QuestTemplate, QuestInstance } from './types';

export function buildInstancesFromTemplate(
  templates: ReadonlyArray<QuestTemplate>,
  dailyLogId: string,
  userId: string
): Omit<QuestInstance, 'id'>[] {
  return templates
    .filter((t) => t.active)
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((t) => ({
      user_id: userId,
      daily_log_id: dailyLogId,
      template_id: t.id,
      name: t.name,
      completion_type: t.completion_type,
      target_value: t.target_value,
      actual_value: 0,
      primary_stat: t.primary_stat,
      base_xp: t.base_xp,
      xp_awarded: 0,
      is_required: t.is_required,
      is_penalty: false,
      completed: false,
      completed_at: null,
      timer_started_at: null,
    }));
}

export function computePartialXp(args: {
  actual: number;
  target: number | null;
  base_xp: number;
}): number {
  const { actual, target, base_xp } = args;
  if (target === null) return actual >= 1 ? base_xp : 0;
  if (actual >= target) return base_xp;
  if (actual <= 0) return 0;
  return Math.floor((actual / target) * base_xp);
}

export function pickPenaltyTarget(
  templates: ReadonlyArray<QuestTemplate>,
  rng: () => number = Math.random
): QuestTemplate | null {
  const candidates = templates.filter((t) => t.active && t.is_required);
  if (candidates.length === 0) return null;
  const idx = Math.floor(rng() * candidates.length);
  return candidates[Math.min(idx, candidates.length - 1)] ?? null;
}

export function buildPenaltyInstance(
  source: QuestTemplate,
  dailyLogId: string,
  userId: string
): Omit<QuestInstance, 'id'> {
  const newTarget = source.target_value === null ? null : Math.ceil(source.target_value * 1.5);
  return {
    user_id: userId,
    daily_log_id: dailyLogId,
    template_id: null,
    name: `${source.name} (Penalty +50%)`,
    completion_type: source.completion_type,
    target_value: newTarget,
    actual_value: 0,
    primary_stat: source.primary_stat,
    base_xp: Math.ceil(source.base_xp * 1.5),
    xp_awarded: 0,
    is_required: true,
    is_penalty: true,
    completed: false,
    completed_at: null,
    timer_started_at: null,
  };
}

export interface DailyClearResult {
  status: 'cleared' | 'pending';
  required_remaining: number;
}

export function evaluateDailyClear(
  instances: ReadonlyArray<Pick<QuestInstance, 'is_required' | 'completed'>>
): DailyClearResult {
  const required = instances.filter((i) => i.is_required);
  const remaining = required.filter((i) => !i.completed).length;
  return {
    status: remaining === 0 ? 'cleared' : 'pending',
    required_remaining: remaining,
  };
}
```

- [ ] **Step 4: Run tests — verify all pass**

```bash
pnpm test lib/quests.test.ts
```

Expected: 14/14 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/quests.ts lib/quests.test.ts
git commit -m "feat(quests): instantiation, partial XP, penalty selection, daily clear eval"
```

---

## Task 6: Supabase Client Helpers

**Files:**
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/server.ts`
- Create: `lib/supabase/service.ts`
- Create: `middleware.ts`

**Required skill:** `fullstack-dev-skills:nextjs-developer` for App Router + `@supabase/ssr` patterns.

- [ ] **Step 1: Create browser client (`lib/supabase/client.ts`)**

```ts
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 2: Create server client (`lib/supabase/server.ts`)**

```ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            /* called from server component — fine */
          }
        },
      },
    }
  );
}
```

- [ ] **Step 3: Create service-role client (`lib/supabase/service.ts`)**

```ts
import { createClient } from '@supabase/supabase-js';

/** Server-only. Bypasses RLS. Used exclusively by the cron tick. */
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
```

- [ ] **Step 4: Create middleware for session refresh (`middleware.ts`)**

```ts
import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();

  const isPublic = request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/api/auth') ||
    request.nextUrl.pathname.startsWith('/api/cron');

  if (!user && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  if (user && request.nextUrl.pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url));
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js).*)'],
};
```

- [ ] **Step 5: Commit**

```bash
git add lib/supabase middleware.ts
git commit -m "feat(supabase): browser/server/service clients + auth middleware"
```

---

## Task 7: Login Page & Auth Callback

**Files:**
- Create: `app/(auth)/login/page.tsx`
- Create: `app/api/auth/callback/route.ts`

**Required skill:** `ui-ux-pro-max` for the login screen aesthetic — Solo Leveling dark, electric blue accents, monospace headline.

- [ ] **Step 1: Create login page (`app/(auth)/login/page.tsx`)**

```tsx
'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/api/auth/callback` },
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-mono tracking-tight text-blue-400">SYSTEM</h1>
          <p className="text-zinc-400 text-sm">Sign in, Hunter.</p>
        </div>
        {sent ? (
          <p className="text-center text-emerald-400">Check your email for the magic link.</p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="bg-zinc-900 border-zinc-800"
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-500">
              {loading ? 'Sending…' : 'Send magic link'}
            </Button>
            {error && <p className="text-red-400 text-sm">{error}</p>}
          </form>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Create auth callback (`app/api/auth/callback/route.ts`)**

```ts
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL('/', url.origin));
}
```

- [ ] **Step 3: Manual test**

```bash
pnpm dev
# Visit http://localhost:3000/login
# Enter your email, check inbox, click magic link
# Should redirect to / (dashboard — will 500 until Task 8)
```

- [ ] **Step 4: Commit**

```bash
git add app/\(auth\) app/api/auth
git commit -m "feat(auth): magic-link login page + callback handler"
```

---

## Task 8: Profile Bootstrap & Dashboard Skeleton

**Files:**
- Create: `app/page.tsx`
- Create: `lib/profile.ts`
- Create: `components/dashboard/PlayerHeader.tsx`
- Create: `components/dashboard/RelaxGate.tsx`

- [ ] **Step 1: Create profile bootstrap helper (`lib/profile.ts`)**

```ts
import { createClient } from '@/lib/supabase/server';
import type { Profile } from './types';

export async function getOrCreateProfile(): Promise<Profile> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not authenticated');

  const { data: existing } = await supabase
    .from('profile')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();
  if (existing) return existing as Profile;

  const { data: created, error } = await supabase
    .from('profile')
    .insert({
      user_id: user.id,
      display_name: user.email?.split('@')[0] ?? 'Hunter',
      email_target: user.email ?? null,
    })
    .select()
    .single();
  if (error || !created) throw error ?? new Error('failed to create profile');
  return created as Profile;
}
```

- [ ] **Step 2: Create `PlayerHeader.tsx`**

```tsx
import type { Profile } from '@/lib/types';

export function PlayerHeader({ profile }: { profile: Profile }) {
  const pct = Math.min(100, (profile.xp_in_level / profile.xp_to_next) * 100);
  return (
    <header className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-mono">{profile.display_name}</h1>
        <span className="text-sm text-blue-400 font-mono">
          Lv {profile.level} · {profile.title}
        </span>
      </div>
      <div className="space-y-1">
        <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-zinc-500 font-mono">
          <span>{profile.xp_in_level} / {profile.xp_to_next} XP</span>
          <span>🔥 {profile.streak_current}-day streak</span>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Create `RelaxGate.tsx`**

```tsx
export function RelaxGate({
  remaining,
  clearedAt,
}: {
  remaining: number;
  clearedAt: string | null;
}) {
  if (remaining === 0) {
    return (
      <div className="border border-emerald-500/40 bg-emerald-950/40 rounded-lg p-4 text-center">
        <div className="text-emerald-400 font-mono text-lg">CLEARED</div>
        <div className="text-emerald-200/80 text-sm mt-1">You may rest, Hunter.</div>
        {clearedAt && (
          <div className="text-emerald-300/60 text-xs mt-2 font-mono">
            Completed at {new Date(clearedAt).toLocaleTimeString()}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="border border-red-500/40 bg-red-950/40 rounded-lg p-4 text-center">
      <div className="text-red-400 font-mono text-lg">LOCKED</div>
      <div className="text-red-200/80 text-sm mt-1">
        {remaining} quest{remaining === 1 ? '' : 's'} remaining. Train, Hunter.
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create dashboard page (`app/page.tsx`)**

```tsx
import { getOrCreateProfile } from '@/lib/profile';
import { createClient } from '@/lib/supabase/server';
import { localDateISO } from '@/lib/time';
import { evaluateDailyClear } from '@/lib/quests';
import { PlayerHeader } from '@/components/dashboard/PlayerHeader';
import { RelaxGate } from '@/components/dashboard/RelaxGate';
import { QuestList } from '@/components/dashboard/QuestList';
import type { QuestInstance, DailyLog } from '@/lib/types';

export default async function Dashboard() {
  const profile = await getOrCreateProfile();
  const supabase = await createClient();
  const today = localDateISO(new Date(), profile.timezone);

  const { data: log } = await supabase
    .from('daily_log')
    .select('*')
    .eq('user_id', profile.user_id)
    .eq('quest_date', today)
    .maybeSingle();

  const instances: QuestInstance[] = log
    ? (await supabase
        .from('quest_instance')
        .select('*')
        .eq('daily_log_id', (log as DailyLog).id)
        .order('id', { ascending: true })).data ?? []
    : [];

  const { required_remaining } = evaluateDailyClear(instances);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 px-4 py-6 max-w-2xl mx-auto space-y-6">
      <PlayerHeader profile={profile} />
      <RelaxGate remaining={required_remaining} clearedAt={(log as DailyLog | null)?.cleared_at ?? null} />
      <section className="space-y-2">
        <h2 className="text-sm font-mono text-zinc-400">
          TODAY · {new Date(today + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
        </h2>
        {instances.length === 0 ? (
          <p className="text-zinc-500 text-sm">No quests yet today. The System will assign them at your reset hour.</p>
        ) : (
          <QuestList instances={instances} />
        )}
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Create `QuestList.tsx` stub (real components in Task 9)**

```tsx
import type { QuestInstance } from '@/lib/types';
import { QuestRow } from './QuestRow';

export function QuestList({ instances }: { instances: QuestInstance[] }) {
  return (
    <ul className="space-y-2">
      {instances.map((i) => (
        <li key={i.id}>
          <QuestRow instance={i} />
        </li>
      ))}
    </ul>
  );
}
```

Create `QuestRow.tsx` placeholder (filled in Task 9):

```tsx
import type { QuestInstance } from '@/lib/types';

export function QuestRow({ instance }: { instance: QuestInstance }) {
  return (
    <div className="border border-zinc-800 rounded p-3 flex items-center justify-between">
      <span>{instance.name}</span>
      <span className="text-xs text-zinc-500 font-mono">{instance.base_xp} XP</span>
    </div>
  );
}
```

- [ ] **Step 6: Manual smoke test**

```bash
pnpm dev
# Log in → land on dashboard → see your name, Lv 1, empty quest list
```

- [ ] **Step 7: Commit**

```bash
git add app/page.tsx lib/profile.ts components/dashboard
git commit -m "feat(dashboard): profile bootstrap + Relax Gate + player header skeleton"
```

---

## Task 9: Quest Completion (Checkbox) — Server Action + UI

**Files:**
- Create: `app/actions/completeQuest.ts`
- Modify: `components/dashboard/QuestRow.tsx`

- [ ] **Step 1: Create server action (`app/actions/completeQuest.ts`)**

```ts
'use server';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { applyXpGain, type Title } from '@/lib/xp';
import { computePartialXp, evaluateDailyClear } from '@/lib/quests';
import type { QuestInstance, Profile } from '@/lib/types';
import { z } from 'zod';

const CompleteSchema = z.object({
  instanceId: z.string().uuid(),
  actualValue: z.number().int().min(0).optional(),
});

export async function completeQuest(input: z.infer<typeof CompleteSchema>) {
  const { instanceId, actualValue } = CompleteSchema.parse(input);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not authenticated');

  const { data: instance } = await supabase
    .from('quest_instance')
    .select('*')
    .eq('id', instanceId)
    .eq('user_id', user.id)
    .single();
  if (!instance) throw new Error('quest not found');
  const inst = instance as QuestInstance;
  if (inst.completed) return { ok: true, alreadyCompleted: true };

  const actual = actualValue ?? (inst.target_value ?? 1);
  const xpAwarded = computePartialXp({
    actual,
    target: inst.target_value,
    base_xp: inst.base_xp,
  });
  const metsTarget = inst.target_value === null ? actual >= 1 : actual >= inst.target_value;

  // Update instance
  await supabase
    .from('quest_instance')
    .update({
      actual_value: actual,
      xp_awarded: xpAwarded,
      completed: metsTarget,
      completed_at: metsTarget ? new Date().toISOString() : null,
      timer_started_at: null,
    })
    .eq('id', instanceId);

  // Apply XP + stat boost to profile
  const { data: profileRow } = await supabase
    .from('profile')
    .select('*')
    .eq('user_id', user.id)
    .single();
  const profile = profileRow as Profile;

  const statColMap: Record<string, keyof Profile> = {
    STR: 'stat_str', VIT: 'stat_vit', AGI: 'stat_agi', INT: 'stat_int', PER: 'stat_per',
  };
  const statBoost = metsTarget ? 1 : 0;
  const statCol = statColMap[inst.primary_stat] as 'stat_str' | 'stat_vit' | 'stat_agi' | 'stat_int' | 'stat_per';

  const xpResult = applyXpGain(
    {
      level: profile.level,
      total_xp: profile.total_xp,
      xp_in_level: profile.xp_in_level,
      xp_to_next: profile.xp_to_next,
      unallocated_points: profile.unallocated_points,
      title: profile.title as Title,
    },
    xpAwarded
  );

  await supabase
    .from('profile')
    .update({
      level: xpResult.level,
      total_xp: xpResult.total_xp,
      xp_in_level: xpResult.xp_in_level,
      xp_to_next: xpResult.xp_to_next,
      unallocated_points: xpResult.unallocated_points,
      title: xpResult.title,
      [statCol]: profile[statCol] + statBoost,
    })
    .eq('user_id', user.id);

  if (xpResult.levels_gained > 0) {
    await supabase.from('level_up_event').insert({
      user_id: user.id,
      from_level: profile.level,
      to_level: xpResult.level,
      points_granted: xpResult.levels_gained * 5,
      title_unlocked: xpResult.title_unlocked,
    });
  }

  // Recompute daily clear
  const { data: siblings } = await supabase
    .from('quest_instance')
    .select('is_required, completed')
    .eq('daily_log_id', inst.daily_log_id);
  const { status } = evaluateDailyClear((siblings ?? []) as Array<Pick<QuestInstance, 'is_required' | 'completed'>>);
  if (status === 'cleared') {
    await supabase
      .from('daily_log')
      .update({ status: 'cleared', cleared_at: new Date().toISOString() })
      .eq('id', inst.daily_log_id)
      .is('cleared_at', null);
  }

  revalidatePath('/');
  return { ok: true, xpAwarded, leveledUp: xpResult.levels_gained > 0 };
}
```

- [ ] **Step 2: Replace `QuestRow.tsx` with interactive client component**

```tsx
'use client';
import { useState, useTransition } from 'react';
import { completeQuest } from '@/app/actions/completeQuest';
import type { QuestInstance } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { CountQuestControl } from './CountQuestControl';
import { TimerQuestControl } from './TimerQuestControl';

export function QuestRow({ instance }: { instance: QuestInstance }) {
  const [pending, start] = useTransition();
  const [optimistic, setOptimistic] = useState(instance.completed);

  function onCheckbox() {
    setOptimistic(true);
    start(async () => {
      await completeQuest({ instanceId: instance.id });
    });
  }

  return (
    <div
      className={`border rounded-lg p-3 ${
        optimistic ? 'border-emerald-700/40 bg-emerald-950/20' : 'border-zinc-800 bg-zinc-900/40'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            {instance.is_penalty && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-500/20 text-red-300">PENALTY</span>
            )}
            <span className={`${optimistic ? 'line-through text-zinc-500' : 'text-zinc-100'}`}>
              {instance.name}
            </span>
          </div>
          <div className="text-xs text-zinc-500 mt-1 font-mono">
            {instance.primary_stat} · {instance.base_xp} XP
          </div>
        </div>
        {instance.completion_type === 'checkbox' && (
          <Button
            onClick={onCheckbox}
            disabled={pending || optimistic}
            size="sm"
            className="bg-blue-600 hover:bg-blue-500"
          >
            {optimistic ? '✓' : 'Done'}
          </Button>
        )}
        {instance.completion_type === 'count' && <CountQuestControl instance={instance} />}
        {instance.completion_type === 'timer' && <TimerQuestControl instance={instance} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Manual test**

In Supabase dashboard, insert a `daily_log` row + a checkbox `quest_instance` for your user. Refresh dashboard. Click Done. Verify:
- `quest_instance.completed = true`, `xp_awarded > 0`
- `profile.total_xp` increased
- `profile.stat_str` (or relevant) incremented by 1

- [ ] **Step 4: Commit**

```bash
git add app/actions/completeQuest.ts components/dashboard/QuestRow.tsx
git commit -m "feat(quest): checkbox completion server action with XP + stat boost"
```

---

## Task 10: Count & Timer Quest Controls

**Files:**
- Create: `app/actions/updateQuestProgress.ts`
- Create: `components/dashboard/CountQuestControl.tsx`
- Create: `components/dashboard/TimerQuestControl.tsx`

- [ ] **Step 1: Create `updateQuestProgress` server action**

```ts
'use server';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { completeQuest } from './completeQuest';

const ProgressSchema = z.object({
  instanceId: z.string().uuid(),
  actualValue: z.number().int().min(0),
});

export async function updateQuestProgress(input: z.infer<typeof ProgressSchema>) {
  const { instanceId, actualValue } = ProgressSchema.parse(input);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not authenticated');

  const { data: inst } = await supabase
    .from('quest_instance')
    .select('target_value, completed')
    .eq('id', instanceId)
    .eq('user_id', user.id)
    .single();
  if (!inst || inst.completed) return { ok: false };

  if (inst.target_value !== null && actualValue >= inst.target_value) {
    // hit target → finalize via completeQuest
    return completeQuest({ instanceId, actualValue });
  }

  await supabase
    .from('quest_instance')
    .update({ actual_value: actualValue })
    .eq('id', instanceId);
  revalidatePath('/');
  return { ok: true };
}

const TimerSchema = z.object({
  instanceId: z.string().uuid(),
  action: z.enum(['start', 'stop']),
});

export async function toggleTimer(input: z.infer<typeof TimerSchema>) {
  const { instanceId, action } = TimerSchema.parse(input);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not authenticated');

  const { data: inst } = await supabase
    .from('quest_instance')
    .select('actual_value, target_value, timer_started_at, completed')
    .eq('id', instanceId)
    .eq('user_id', user.id)
    .single();
  if (!inst || inst.completed) return { ok: false };

  if (action === 'start') {
    await supabase
      .from('quest_instance')
      .update({ timer_started_at: new Date().toISOString() })
      .eq('id', instanceId);
  } else {
    if (!inst.timer_started_at) return { ok: false };
    const elapsedMin = Math.floor((Date.now() - new Date(inst.timer_started_at).getTime()) / 60000);
    const newActual = (inst.actual_value ?? 0) + elapsedMin;
    if (inst.target_value !== null && newActual >= inst.target_value) {
      await supabase
        .from('quest_instance')
        .update({ timer_started_at: null, actual_value: newActual })
        .eq('id', instanceId);
      return completeQuest({ instanceId, actualValue: newActual });
    }
    await supabase
      .from('quest_instance')
      .update({ timer_started_at: null, actual_value: newActual })
      .eq('id', instanceId);
  }
  revalidatePath('/');
  return { ok: true };
}
```

- [ ] **Step 2: Create `CountQuestControl.tsx`**

```tsx
'use client';
import { useState, useTransition } from 'react';
import { updateQuestProgress } from '@/app/actions/updateQuestProgress';
import { completeQuest } from '@/app/actions/completeQuest';
import type { QuestInstance } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function CountQuestControl({ instance }: { instance: QuestInstance }) {
  const [value, setValue] = useState(instance.actual_value);
  const [pending, start] = useTransition();

  function commit(newValue: number) {
    setValue(newValue);
    start(async () => {
      if (instance.target_value !== null && newValue >= instance.target_value) {
        await completeQuest({ instanceId: instance.id, actualValue: newValue });
      } else {
        await updateQuestProgress({ instanceId: instance.id, actualValue: newValue });
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        min={0}
        value={value}
        onChange={(e) => setValue(Math.max(0, parseInt(e.target.value || '0', 10)))}
        onBlur={() => commit(value)}
        className="w-20 bg-zinc-900 border-zinc-800 text-right font-mono"
        disabled={pending || instance.completed}
      />
      <span className="text-zinc-500 font-mono text-sm">/ {instance.target_value}</span>
    </div>
  );
}
```

- [ ] **Step 3: Create `TimerQuestControl.tsx`**

```tsx
'use client';
import { useState, useEffect, useTransition } from 'react';
import { toggleTimer } from '@/app/actions/updateQuestProgress';
import type { QuestInstance } from '@/lib/types';
import { Button } from '@/components/ui/button';

function formatMmSs(min: number, sec: number) {
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function TimerQuestControl({ instance }: { instance: QuestInstance }) {
  const [pending, start] = useTransition();
  const [now, setNow] = useState(Date.now());
  const running = !!instance.timer_started_at;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  const liveSec = running
    ? Math.floor((now - new Date(instance.timer_started_at!).getTime()) / 1000)
    : 0;
  const totalSec = instance.actual_value * 60 + liveSec;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;

  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-sm tabular-nums text-zinc-300">
        {formatMmSs(min, sec)} / {instance.target_value}:00
      </span>
      <Button
        size="sm"
        onClick={() => start(async () => { await toggleTimer({ instanceId: instance.id, action: running ? 'stop' : 'start' }); })}
        disabled={pending || instance.completed}
        className={running ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500'}
      >
        {running ? '■' : '▶'}
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add app/actions/updateQuestProgress.ts components/dashboard/CountQuestControl.tsx components/dashboard/TimerQuestControl.tsx
git commit -m "feat(quest): count + timer quest controls with server actions"
```

---

## Task 11: Level Up Modal & Allocate Points Action

**Files:**
- Create: `app/actions/allocatePoints.ts`
- Create: `components/modals/LevelUpModal.tsx`
- Modify: `app/page.tsx` to mount modal when `unallocated_points > 0`

- [ ] **Step 1: Create `allocatePoints` server action**

```ts
'use server';
import { createClient } from '@/lib/supabase/server';
import { AllocationSchema } from '@/lib/types';
import { revalidatePath } from 'next/cache';

export async function allocatePoints(allocation: unknown) {
  const a = AllocationSchema.parse(allocation);
  const total = a.str + a.vit + a.agi + a.int + a.per;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not authenticated');

  const { data: profile } = await supabase
    .from('profile')
    .select('*')
    .eq('user_id', user.id)
    .single();
  if (!profile) throw new Error('profile missing');
  if (total > profile.unallocated_points) throw new Error('over-allocation');

  await supabase
    .from('profile')
    .update({
      stat_str: profile.stat_str + a.str,
      stat_vit: profile.stat_vit + a.vit,
      stat_agi: profile.stat_agi + a.agi,
      stat_int: profile.stat_int + a.int,
      stat_per: profile.stat_per + a.per,
      unallocated_points: profile.unallocated_points - total,
    })
    .eq('user_id', user.id);

  // Update most recent level_up_event with allocation
  const { data: latest } = await supabase
    .from('level_up_event')
    .select('id')
    .eq('user_id', user.id)
    .is('allocation', null)
    .order('created_at', { ascending: false })
    .limit(1);
  if (latest && latest[0]) {
    await supabase.from('level_up_event').update({ allocation: a }).eq('id', latest[0].id);
  }

  revalidatePath('/');
  return { ok: true };
}
```

- [ ] **Step 2: Create `LevelUpModal.tsx`**

```tsx
'use client';
import { useState, useTransition } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { allocatePoints } from '@/app/actions/allocatePoints';
import type { Profile } from '@/lib/types';

const STATS = ['str', 'vit', 'agi', 'int', 'per'] as const;
type StatKey = (typeof STATS)[number];

export function LevelUpModal({ profile }: { profile: Profile }) {
  const total = profile.unallocated_points;
  const [alloc, setAlloc] = useState<Record<StatKey, number>>({
    str: 0, vit: 0, agi: 0, int: 0, per: 0,
  });
  const [pending, start] = useTransition();
  const used = Object.values(alloc).reduce((s, n) => s + n, 0);
  const remaining = total - used;

  function bump(k: StatKey, delta: number) {
    setAlloc((prev) => {
      const next = Math.max(0, prev[k] + delta);
      if (next > prev[k] && remaining === 0) return prev;
      return { ...prev, [k]: next };
    });
  }

  function confirm() {
    start(async () => {
      await allocatePoints(alloc);
    });
  }

  return (
    <Dialog open={total > 0}>
      <DialogContent className="bg-zinc-950 border-blue-500/40 text-zinc-100">
        <DialogHeader>
          <DialogTitle className="text-center text-blue-400 font-mono text-xl">⚡ LEVEL UP ⚡</DialogTitle>
        </DialogHeader>
        <div className="text-center text-zinc-300 mb-2 font-mono">Lv {profile.level} · {profile.title}</div>
        <div className="space-y-3 font-mono">
          {STATS.map((k) => {
            const current = profile[`stat_${k}` as const];
            return (
              <div key={k} className="flex items-center justify-between gap-3 border border-zinc-800 rounded p-2">
                <span className="uppercase text-zinc-400 w-12">{k}</span>
                <span className="text-zinc-300 tabular-nums w-12 text-right">{current} → {current + alloc[k]}</span>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => bump(k, -1)} disabled={alloc[k] === 0}>−</Button>
                  <Button size="sm" variant="outline" onClick={() => bump(k, 1)} disabled={remaining === 0}>+</Button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="text-center mt-2 text-sm text-zinc-400 font-mono">
          Points remaining: <span className="text-blue-400">{remaining}</span>
        </div>
        <Button
          onClick={confirm}
          disabled={pending || remaining !== 0}
          className="w-full bg-blue-600 hover:bg-blue-500 mt-2"
        >
          Confirm Allocation
        </Button>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Mount in dashboard**

Modify `app/page.tsx` — add at bottom of the `<main>`:

```tsx
import { LevelUpModal } from '@/components/modals/LevelUpModal';
// ...
{profile.unallocated_points > 0 && <LevelUpModal profile={profile} />}
```

- [ ] **Step 4: Manual test**

In Supabase, set your profile `unallocated_points = 5`. Refresh dashboard. Modal pops. Allocate 5 points. Confirm. Stats update; modal closes.

- [ ] **Step 5: Commit**

```bash
git add app/actions/allocatePoints.ts components/modals/LevelUpModal.tsx app/page.tsx
git commit -m "feat(level-up): allocation modal + server action"
```

---

## Task 12: Character Page (Stats + Heatmap)

**Files:**
- Create: `app/character/page.tsx`
- Create: `components/character/StatSheet.tsx`
- Create: `components/character/TitleProgress.tsx`
- Create: `components/character/Heatmap.tsx`

**Required skill:** `ui-ux-pro-max` — make the stat sheet feel like a Solo Leveling status screen.

- [ ] **Step 1: Create `StatSheet.tsx`**

```tsx
import type { Profile } from '@/lib/types';

export function StatSheet({ profile }: { profile: Profile }) {
  const stats: Array<[string, number]> = [
    ['STR', profile.stat_str],
    ['VIT', profile.stat_vit],
    ['AGI', profile.stat_agi],
    ['INT', profile.stat_int],
    ['PER', profile.stat_per],
  ];
  const max = Math.max(...stats.map(([, v]) => v), 50);
  return (
    <section className="border border-zinc-800 rounded-lg p-4 space-y-3 font-mono">
      <h2 className="text-zinc-400 text-sm">STATS</h2>
      {stats.map(([k, v]) => (
        <div key={k} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-zinc-300">{k}</span>
            <span className="text-blue-400 tabular-nums">{v}</span>
          </div>
          <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div className="h-full bg-blue-500" style={{ width: `${(v / max) * 100}%` }} />
          </div>
        </div>
      ))}
      {profile.unallocated_points > 0 && (
        <div className="pt-2 text-sm text-blue-400">
          {profile.unallocated_points} unallocated point{profile.unallocated_points === 1 ? '' : 's'} →
          <a href="/" className="underline ml-1">allocate</a>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Create `TitleProgress.tsx`**

```tsx
const TITLES = [
  { lv: 1, name: 'Novice', bonus: '+0%' },
  { lv: 10, name: 'Awakened', bonus: '+5%' },
  { lv: 25, name: 'Elite Hunter', bonus: '+10%' },
  { lv: 50, name: 'Necromancer', bonus: '+15%' },
  { lv: 100, name: 'Shadow Monarch', bonus: '+20%' },
];

export function TitleProgress({ level }: { level: number }) {
  return (
    <section className="border border-zinc-800 rounded-lg p-4 space-y-2 font-mono">
      <h2 className="text-zinc-400 text-sm mb-2">TITLES</h2>
      {TITLES.map((t) => {
        const unlocked = level >= t.lv;
        return (
          <div key={t.name} className={`flex justify-between text-sm ${unlocked ? 'text-blue-400' : 'text-zinc-600'}`}>
            <span>Lv {t.lv} · {t.name}</span>
            <span>{t.bonus}</span>
          </div>
        );
      })}
    </section>
  );
}
```

- [ ] **Step 3: Create `Heatmap.tsx`**

```tsx
import type { DailyLog } from '@/lib/types';

export function Heatmap({ days }: { days: DailyLog[] }) {
  const last30: { date: string; status: 'cleared' | 'missed' | 'none' }[] = [];
  const map = new Map(days.map((d) => [d.quest_date, d.status]));
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const status = map.get(iso);
    last30.push({
      date: iso,
      status: status === 'cleared' ? 'cleared' : status === 'missed' ? 'missed' : 'none',
    });
  }
  return (
    <section className="border border-zinc-800 rounded-lg p-4">
      <h2 className="text-zinc-400 text-sm mb-3 font-mono">LAST 30 DAYS</h2>
      <div className="grid grid-cols-10 gap-1">
        {last30.map((d) => (
          <div
            key={d.date}
            title={d.date}
            className={`aspect-square rounded ${
              d.status === 'cleared' ? 'bg-emerald-500' :
              d.status === 'missed' ? 'bg-red-700/60' :
              'bg-zinc-800'
            }`}
          />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Create `app/character/page.tsx`**

```tsx
import { getOrCreateProfile } from '@/lib/profile';
import { createClient } from '@/lib/supabase/server';
import { StatSheet } from '@/components/character/StatSheet';
import { TitleProgress } from '@/components/character/TitleProgress';
import { Heatmap } from '@/components/character/Heatmap';
import type { DailyLog } from '@/lib/types';

export default async function CharacterPage() {
  const profile = await getOrCreateProfile();
  const supabase = await createClient();
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const { data: days } = await supabase
    .from('daily_log')
    .select('*')
    .eq('user_id', profile.user_id)
    .gte('quest_date', since.toISOString().slice(0, 10));

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 px-4 py-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-mono">{profile.display_name}</h1>
      <p className="text-blue-400 font-mono text-sm">Lv {profile.level} · {profile.title}</p>
      <StatSheet profile={profile} />
      <TitleProgress level={profile.level} />
      <Heatmap days={(days ?? []) as DailyLog[]} />
    </main>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add app/character components/character
git commit -m "feat(character): stat sheet, title progress, 30-day heatmap"
```

---

## Task 13: Settings — Template Editor

**Files:**
- Create: `app/settings/page.tsx`
- Create: `app/settings/template/page.tsx`
- Create: `app/actions/updateTemplate.ts`
- Create: `components/settings/TemplateEditor.tsx`

- [ ] **Step 1: Create `updateTemplate.ts`**

```ts
'use server';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { TemplateInputSchema } from '@/lib/types';
import { z } from 'zod';

export async function createTemplate(input: unknown) {
  const data = TemplateInputSchema.parse(input);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not authenticated');
  await supabase.from('quest_template').insert({ ...data, user_id: user.id });
  revalidatePath('/settings/template');
  return { ok: true };
}

export async function updateTemplate(id: string, input: unknown) {
  const data = TemplateInputSchema.parse(input);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not authenticated');
  await supabase.from('quest_template').update(data).eq('id', id).eq('user_id', user.id);
  revalidatePath('/settings/template');
  return { ok: true };
}

export async function deleteTemplate(id: string) {
  z.string().uuid().parse(id);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not authenticated');
  await supabase.from('quest_template').update({ active: false }).eq('id', id).eq('user_id', user.id);
  revalidatePath('/settings/template');
  return { ok: true };
}

export async function seedDefaults() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not authenticated');
  const defaults = [
    { name: 'Push-ups', completion_type: 'count' as const, target_value: 100, primary_stat: 'STR' as const, base_xp: 50, is_required: true, sort_order: 1 },
    { name: 'Sit-ups', completion_type: 'count' as const, target_value: 100, primary_stat: 'STR' as const, base_xp: 50, is_required: true, sort_order: 2 },
    { name: 'Squats', completion_type: 'count' as const, target_value: 100, primary_stat: 'STR' as const, base_xp: 50, is_required: true, sort_order: 3 },
    { name: 'Run (km)', completion_type: 'count' as const, target_value: 5, primary_stat: 'VIT' as const, base_xp: 75, is_required: true, sort_order: 4 },
    { name: 'Study', completion_type: 'timer' as const, target_value: 90, primary_stat: 'INT' as const, base_xp: 75, is_required: true, sort_order: 5 },
    { name: 'Read', completion_type: 'timer' as const, target_value: 30, primary_stat: 'INT' as const, base_xp: 25, is_required: false, sort_order: 6 },
  ];
  await supabase.from('quest_template').insert(defaults.map((d) => ({ ...d, user_id: user.id })));
  revalidatePath('/settings/template');
  return { ok: true };
}
```

- [ ] **Step 2: Create `TemplateEditor.tsx`**

```tsx
'use client';
import { useState, useTransition } from 'react';
import type { QuestTemplate, StatKind, CompletionType } from '@/lib/types';
import { createTemplate, updateTemplate, deleteTemplate, seedDefaults } from '@/app/actions/updateTemplate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function TemplateEditor({ initial }: { initial: QuestTemplate[] }) {
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4">
      {initial.length === 0 && (
        <Button onClick={() => start(async () => { await seedDefaults(); })} disabled={pending}>
          Load Hassan's defaults (workout + study + read)
        </Button>
      )}
      <ul className="space-y-2">
        {initial.map((t) => (
          <li key={t.id} className="border border-zinc-800 rounded p-3 flex items-center justify-between">
            <div>
              <div className="font-mono">{t.name}</div>
              <div className="text-xs text-zinc-500 font-mono">
                {t.completion_type} · target {t.target_value ?? '—'} · {t.primary_stat} · {t.base_xp} XP · {t.is_required ? 'required' : 'optional'}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => start(async () => { await deleteTemplate(t.id); })}
              disabled={pending}
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>
      <NewTemplateForm />
    </div>
  );
}

function NewTemplateForm() {
  const [pending, start] = useTransition();
  const [form, setForm] = useState({
    name: '',
    completion_type: 'count' as CompletionType,
    target_value: 100,
    primary_stat: 'STR' as StatKind,
    base_xp: 50,
    is_required: true,
    sort_order: 99,
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      await createTemplate(form);
      setForm({ ...form, name: '' });
    });
  }

  return (
    <form onSubmit={submit} className="border border-zinc-800 rounded p-3 space-y-2">
      <Label>New quest</Label>
      <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Meditate" required className="bg-zinc-900 border-zinc-800" />
      <div className="grid grid-cols-2 gap-2">
        <select className="bg-zinc-900 border border-zinc-800 rounded p-2 text-sm" value={form.completion_type} onChange={(e) => setForm({ ...form, completion_type: e.target.value as CompletionType })}>
          <option value="checkbox">Checkbox</option>
          <option value="count">Count</option>
          <option value="timer">Timer (min)</option>
        </select>
        <Input type="number" value={form.target_value} onChange={(e) => setForm({ ...form, target_value: parseInt(e.target.value || '0', 10) })} placeholder="target" className="bg-zinc-900 border-zinc-800" />
        <select className="bg-zinc-900 border border-zinc-800 rounded p-2 text-sm" value={form.primary_stat} onChange={(e) => setForm({ ...form, primary_stat: e.target.value as StatKind })}>
          {(['STR','VIT','AGI','INT','PER'] as const).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <Input type="number" value={form.base_xp} onChange={(e) => setForm({ ...form, base_xp: parseInt(e.target.value || '0', 10) })} placeholder="base XP" className="bg-zinc-900 border-zinc-800" />
      </div>
      <label className="flex items-center gap-2 text-sm text-zinc-400">
        <input type="checkbox" checked={form.is_required} onChange={(e) => setForm({ ...form, is_required: e.target.checked })} />
        Required (counts toward Relax Gate)
      </label>
      <Button type="submit" disabled={pending} className="w-full">Add quest</Button>
    </form>
  );
}
```

- [ ] **Step 3: Create `app/settings/page.tsx` (tab shell)**

```tsx
import Link from 'next/link';

export default function SettingsPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 px-4 py-6 max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-mono">Settings</h1>
      <nav className="flex gap-3 border-b border-zinc-800 pb-2">
        <Link href="/settings/template" className="text-blue-400 hover:underline">Daily Template</Link>
        <Link href="/settings/schedule" className="text-blue-400 hover:underline">Schedule & Email</Link>
      </nav>
      <p className="text-zinc-500 text-sm">Pick a tab.</p>
    </main>
  );
}
```

- [ ] **Step 4: Create `app/settings/template/page.tsx`**

```tsx
import { createClient } from '@/lib/supabase/server';
import { TemplateEditor } from '@/components/settings/TemplateEditor';
import type { QuestTemplate } from '@/lib/types';

export default async function TemplatePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data } = await supabase
    .from('quest_template')
    .select('*')
    .eq('user_id', user!.id)
    .eq('active', true)
    .order('sort_order');
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 px-4 py-6 max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-mono">Daily Template</h1>
      <TemplateEditor initial={(data ?? []) as QuestTemplate[]} />
    </main>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add app/settings app/actions/updateTemplate.ts components/settings/TemplateEditor.tsx
git commit -m "feat(settings): template editor with create/remove/seed-defaults"
```

---

## Task 14: Settings — Schedule & Email Config

**Files:**
- Create: `app/settings/schedule/page.tsx`
- Create: `app/actions/updateSettings.ts`
- Create: `components/settings/ScheduleForm.tsx`

- [ ] **Step 1: Create `updateSettings.ts`**

```ts
'use server';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const SettingsSchema = z.object({
  reset_hour_local: z.number().int().min(0).max(23),
  email_send_hour_local: z.number().int().min(0).max(23),
  timezone: z.string().min(1),
  email_target: z.string().email().nullable(),
  email_enabled: z.boolean(),
});

export async function updateSettings(input: unknown) {
  const data = SettingsSchema.parse(input);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not authenticated');
  await supabase.from('profile').update(data).eq('user_id', user.id);
  revalidatePath('/settings/schedule');
  return { ok: true };
}

export async function sendTestEmail() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not authenticated');
  const { sendDailyQuestEmail } = await import('@/lib/email/send');
  await sendDailyQuestEmail({ userId: user.id, isTest: true });
  return { ok: true };
}
```

- [ ] **Step 2: Create `ScheduleForm.tsx`**

```tsx
'use client';
import { useState, useTransition } from 'react';
import { updateSettings, sendTestEmail } from '@/app/actions/updateSettings';
import type { Profile } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ScheduleForm({ profile }: { profile: Profile }) {
  const [form, setForm] = useState({
    reset_hour_local: profile.reset_hour_local,
    email_send_hour_local: profile.email_send_hour_local,
    timezone: profile.timezone,
    email_target: profile.email_target ?? '',
    email_enabled: profile.email_enabled,
  });
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function save(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      await updateSettings({ ...form, email_target: form.email_target || null });
      setMsg('Saved.');
      setTimeout(() => setMsg(null), 2000);
    });
  }

  return (
    <form onSubmit={save} className="space-y-4 font-mono">
      <div className="space-y-2">
        <Label>Reset hour (when new quests appear, local 24h)</Label>
        <Input type="number" min={0} max={23} value={form.reset_hour_local} onChange={(e) => setForm({ ...form, reset_hour_local: parseInt(e.target.value || '0', 10) })} className="bg-zinc-900 border-zinc-800 w-24" />
      </div>
      <div className="space-y-2">
        <Label>Email send hour (local 24h)</Label>
        <Input type="number" min={0} max={23} value={form.email_send_hour_local} onChange={(e) => setForm({ ...form, email_send_hour_local: parseInt(e.target.value || '0', 10) })} className="bg-zinc-900 border-zinc-800 w-24" />
      </div>
      <div className="space-y-2">
        <Label>Timezone (IANA, e.g. America/New_York)</Label>
        <Input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} className="bg-zinc-900 border-zinc-800" />
      </div>
      <div className="space-y-2">
        <Label>Email target</Label>
        <Input type="email" value={form.email_target} onChange={(e) => setForm({ ...form, email_target: e.target.value })} className="bg-zinc-900 border-zinc-800" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.email_enabled} onChange={(e) => setForm({ ...form, email_enabled: e.target.checked })} />
        Email daily quest notifications
      </label>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending} className="bg-blue-600 hover:bg-blue-500">Save</Button>
        <Button type="button" variant="outline" onClick={() => start(async () => { await sendTestEmail(); setMsg('Test email sent.'); })} disabled={pending}>
          Send test email
        </Button>
      </div>
      {msg && <p className="text-emerald-400 text-sm">{msg}</p>}
    </form>
  );
}
```

- [ ] **Step 3: Create `app/settings/schedule/page.tsx`**

```tsx
import { getOrCreateProfile } from '@/lib/profile';
import { ScheduleForm } from '@/components/settings/ScheduleForm';

export default async function SchedulePage() {
  const profile = await getOrCreateProfile();
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 px-4 py-6 max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-mono">Schedule & Email</h1>
      <ScheduleForm profile={profile} />
    </main>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add app/settings/schedule app/actions/updateSettings.ts components/settings/ScheduleForm.tsx
git commit -m "feat(settings): schedule + email config form"
```

---

## Task 15: Email Template & Resend Wrapper

**Files:**
- Create: `lib/email/DailyQuestEmail.tsx`
- Create: `lib/email/send.ts`

- [ ] **Step 1: Create React Email template (`lib/email/DailyQuestEmail.tsx`)**

```tsx
import { Html, Head, Body, Container, Heading, Text, Button, Section, Hr } from '@react-email/components';
import type { QuestInstance, Profile } from '@/lib/types';

export function DailyQuestEmail({
  profile,
  instances,
  appUrl,
  hasPenalty,
  date,
}: {
  profile: Profile;
  instances: QuestInstance[];
  appUrl: string;
  hasPenalty: boolean;
  date: string;
}) {
  return (
    <Html>
      <Head />
      <Body style={{ backgroundColor: '#09090b', color: '#e4e4e7', fontFamily: 'ui-monospace, monospace', margin: 0, padding: 0 }}>
        <Container style={{ maxWidth: 560, margin: '0 auto', padding: '32px 24px' }}>
          <Heading style={{ color: '#60a5fa', fontSize: 22, margin: 0 }}>SYSTEM · DAILY QUEST</Heading>
          <Text style={{ color: '#a1a1aa', fontSize: 14 }}>{date} · {profile.display_name}</Text>
          <Text style={{ color: '#a1a1aa', fontSize: 14 }}>
            Lv {profile.level} · {profile.title} · 🔥 {profile.streak_current}-day streak
          </Text>
          {hasPenalty && (
            <Section style={{ border: '1px solid #b91c1c', backgroundColor: '#450a0a', padding: 12, borderRadius: 6, marginTop: 16 }}>
              <Text style={{ color: '#fca5a5', margin: 0, fontSize: 14 }}>
                ⚠ PENALTY QUEST ACTIVE — yesterday's quests were missed.
              </Text>
            </Section>
          )}
          <Hr style={{ borderColor: '#27272a', marginTop: 24, marginBottom: 16 }} />
          <Section>
            {instances.map((q) => (
              <Text key={q.id} style={{ margin: '8px 0', fontSize: 14, color: q.is_penalty ? '#fca5a5' : '#e4e4e7' }}>
                {q.is_penalty ? '⚠ ' : '☐ '}
                {q.name}
                {q.target_value !== null && <span style={{ color: '#71717a' }}> · target {q.target_value}{q.completion_type === 'timer' ? ' min' : ''}</span>}
                <span style={{ color: '#3b82f6', float: 'right' }}>{q.base_xp} XP</span>
              </Text>
            ))}
          </Section>
          <Hr style={{ borderColor: '#27272a', marginTop: 16 }} />
          <Section style={{ textAlign: 'center', marginTop: 24 }}>
            <Button href={appUrl} style={{ backgroundColor: '#2563eb', color: 'white', padding: '12px 24px', borderRadius: 6, textDecoration: 'none', fontSize: 14 }}>
              Open Dashboard
            </Button>
          </Section>
          <Text style={{ color: '#52525b', fontSize: 12, textAlign: 'center', marginTop: 32 }}>
            Train, Hunter.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
```

- [ ] **Step 2: Create `lib/email/send.ts`**

```ts
import { Resend } from 'resend';
import { render } from '@react-email/components';
import { DailyQuestEmail } from './DailyQuestEmail';
import { createServiceClient } from '@/lib/supabase/service';
import { localDateISO } from '@/lib/time';
import type { Profile, QuestInstance, DailyLog } from '@/lib/types';

const resend = new Resend(process.env.RESEND_API_KEY!);

export async function sendDailyQuestEmail({
  userId,
  isTest = false,
}: { userId: string; isTest?: boolean }) {
  const supabase = createServiceClient();

  const { data: profile } = await supabase.from('profile').select('*').eq('user_id', userId).single();
  if (!profile) throw new Error('profile missing');
  const p = profile as Profile;
  if (!p.email_enabled || !p.email_target) return { skipped: true, reason: 'email disabled or missing' };

  const today = localDateISO(new Date(), p.timezone);

  // Dedupe on (user_id, quest_date) — not for tests
  if (!isTest) {
    const { data: existing } = await supabase
      .from('email_log')
      .select('id')
      .eq('user_id', userId)
      .eq('quest_date', today)
      .maybeSingle();
    if (existing) return { skipped: true, reason: 'already sent today' };
  }

  const { data: log } = await supabase
    .from('daily_log')
    .select('*')
    .eq('user_id', userId)
    .eq('quest_date', today)
    .maybeSingle();

  const instances: QuestInstance[] = log
    ? (await supabase.from('quest_instance').select('*').eq('daily_log_id', (log as DailyLog).id)).data as QuestInstance[] ?? []
    : [];

  const html = await render(
    DailyQuestEmail({
      profile: p,
      instances,
      appUrl: process.env.APP_URL || 'http://localhost:3000',
      hasPenalty: (log as DailyLog | null)?.has_penalty_quest ?? false,
      date: today,
    })
  );

  try {
    await resend.emails.send({
      from: 'Solo Leveling Life <onboarding@resend.dev>', // verified later
      to: p.email_target,
      subject: `⚔️ Daily Quest — ${today} — Lv ${p.level}${p.streak_current >= 7 ? ` 🔥${p.streak_current}` : ''}`,
      html,
    });
    if (!isTest) {
      await supabase.from('email_log').insert({ user_id: userId, quest_date: today, status: 'sent' });
    }
    return { sent: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!isTest) {
      await supabase.from('email_log').insert({ user_id: userId, quest_date: today, status: 'failed', error: msg });
    }
    throw e;
  }
}
```

- [ ] **Step 3: Manual test from settings page**

Set your `email_target` in settings → click "Send test email" → check inbox.

- [ ] **Step 4: Commit**

```bash
git add lib/email
git commit -m "feat(email): React Email template + Resend wrapper with dedupe"
```

---

## Task 16: Cron Tick — Instantiation, Email, Reconciliation

**Files:**
- Create: `app/api/cron/tick/route.ts`
- Create: `vercel.json`

**Required skill:** `fullstack-dev-skills:secure-code-guardian` for the cron auth.

- [ ] **Step 1: Create `vercel.json`**

```json
{
  "crons": [
    { "path": "/api/cron/tick", "schedule": "0 * * * *" }
  ]
}
```

- [ ] **Step 2: Create cron route (`app/api/cron/tick/route.ts`)**

```ts
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { localDateISO, localHour, yesterdayLocal } from '@/lib/time';
import { buildInstancesFromTemplate, buildPenaltyInstance, pickPenaltyTarget, computePartialXp, evaluateDailyClear } from '@/lib/quests';
import { applyXpGain, type Title } from '@/lib/xp';
import { sendDailyQuestEmail } from '@/lib/email/send';
import type { Profile, QuestTemplate, QuestInstance, DailyLog } from '@/lib/types';

export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: profiles } = await supabase.from('profile').select('*');
  if (!profiles) return NextResponse.json({ ok: true, processed: 0 });

  const now = new Date();
  const results: Array<{ user_id: string; actions: string[] }> = [];

  for (const profile of profiles as Profile[]) {
    const actions: string[] = [];
    const hour = localHour(now, profile.timezone);
    const today = localDateISO(now, profile.timezone);

    // === Reset hour: instantiate today's quests ===
    if (hour === profile.reset_hour_local) {
      const { data: existing } = await supabase
        .from('daily_log')
        .select('id')
        .eq('user_id', profile.user_id)
        .eq('quest_date', today)
        .maybeSingle();
      if (!existing) {
        const yesterday = yesterdayLocal(today);
        const { data: yLog } = await supabase
          .from('daily_log')
          .select('*')
          .eq('user_id', profile.user_id)
          .eq('quest_date', yesterday)
          .maybeSingle();
        const hasPenalty = (yLog as DailyLog | null)?.status === 'missed';

        const { data: log, error: logErr } = await supabase
          .from('daily_log')
          .insert({
            user_id: profile.user_id,
            quest_date: today,
            has_penalty_quest: hasPenalty,
          })
          .select()
          .single();
        if (logErr || !log) { actions.push(`log_err:${logErr?.message}`); continue; }

        const { data: templates } = await supabase
          .from('quest_template')
          .select('*')
          .eq('user_id', profile.user_id)
          .eq('active', true);
        const tList = (templates ?? []) as QuestTemplate[];
        const instances = buildInstancesFromTemplate(tList, log.id, profile.user_id);
        if (hasPenalty) {
          const target = pickPenaltyTarget(tList);
          if (target) instances.push(buildPenaltyInstance(target, log.id, profile.user_id));
        }
        if (instances.length > 0) {
          await supabase.from('quest_instance').insert(instances);
        }
        actions.push(`instantiated:${instances.length}${hasPenalty ? '+penalty' : ''}`);
      }
    }

    // === End-of-day reconciliation (hour = reset_hour - 1) ===
    const reconHour = (profile.reset_hour_local + 23) % 24;
    if (hour === reconHour) {
      const { data: log } = await supabase
        .from('daily_log')
        .select('*')
        .eq('user_id', profile.user_id)
        .eq('quest_date', today)
        .maybeSingle();
      if (log && (log as DailyLog).status === 'pending') {
        const { data: insts } = await supabase
          .from('quest_instance')
          .select('*')
          .eq('daily_log_id', (log as DailyLog).id);
        const instances = (insts ?? []) as QuestInstance[];

        // Award partial XP for incomplete count/timer quests
        let totalPartial = 0;
        for (const i of instances) {
          if (i.completed) continue;
          if (i.completion_type === 'checkbox') continue;
          const partial = computePartialXp({ actual: i.actual_value, target: i.target_value, base_xp: i.base_xp });
          if (partial > 0) {
            await supabase
              .from('quest_instance')
              .update({ xp_awarded: partial })
              .eq('id', i.id);
            totalPartial += partial;
          }
        }

        if (totalPartial > 0) {
          const xpResult = applyXpGain(
            {
              level: profile.level,
              total_xp: profile.total_xp,
              xp_in_level: profile.xp_in_level,
              xp_to_next: profile.xp_to_next,
              unallocated_points: profile.unallocated_points,
              title: profile.title as Title,
            },
            totalPartial
          );
          await supabase
            .from('profile')
            .update({
              level: xpResult.level,
              total_xp: xpResult.total_xp,
              xp_in_level: xpResult.xp_in_level,
              xp_to_next: xpResult.xp_to_next,
              unallocated_points: xpResult.unallocated_points,
              title: xpResult.title,
            })
            .eq('user_id', profile.user_id);
          if (xpResult.levels_gained > 0) {
            await supabase.from('level_up_event').insert({
              user_id: profile.user_id,
              from_level: profile.level,
              to_level: xpResult.level,
              points_granted: xpResult.levels_gained * 5,
              title_unlocked: xpResult.title_unlocked,
            });
          }
        }

        const { status: clear } = evaluateDailyClear(instances);
        if (clear === 'cleared') {
          await supabase
            .from('daily_log')
            .update({ status: 'cleared', cleared_at: new Date().toISOString() })
            .eq('id', (log as DailyLog).id);
          await supabase
            .from('profile')
            .update({
              streak_current: profile.streak_current + 1,
              streak_best: Math.max(profile.streak_best, profile.streak_current + 1),
            })
            .eq('user_id', profile.user_id);
          actions.push('reconciled:cleared');
        } else {
          await supabase.from('daily_log').update({ status: 'missed' }).eq('id', (log as DailyLog).id);
          await supabase.from('profile').update({ streak_current: 0 }).eq('user_id', profile.user_id);
          actions.push('reconciled:missed');
        }
      }
    }

    // === Email send hour ===
    if (hour === profile.email_send_hour_local && profile.email_enabled && profile.email_target) {
      try {
        const r = await sendDailyQuestEmail({ userId: profile.user_id });
        actions.push(`email:${r.sent ? 'sent' : r.reason ?? 'skipped'}`);
      } catch (e) {
        actions.push(`email_err:${e instanceof Error ? e.message : 'unknown'}`);
      }
    }

    if (actions.length > 0) results.push({ user_id: profile.user_id, actions });
  }

  return NextResponse.json({ ok: true, results });
}
```

- [ ] **Step 3: Manual test locally**

```bash
# In one terminal
pnpm dev
# In another
curl -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/tick
```

Set your `reset_hour_local` to the current local hour in Supabase first, then hit the endpoint and verify a `daily_log` + `quest_instance` rows were created.

- [ ] **Step 4: Commit**

```bash
git add app/api/cron/tick vercel.json
git commit -m "feat(cron): hourly tick for instantiation, reconciliation, and email"
```

---

## Task 17: History Page

**Files:**
- Create: `app/history/page.tsx`
- Create: `components/history/HistoryCalendar.tsx`

- [ ] **Step 1: Create `HistoryCalendar.tsx`**

```tsx
'use client';
import { useState } from 'react';
import type { DailyLog } from '@/lib/types';

export function HistoryCalendar({ logs }: { logs: DailyLog[] }) {
  const [selected, setSelected] = useState<DailyLog | null>(null);
  const sorted = [...logs].sort((a, b) => b.quest_date.localeCompare(a.quest_date));
  return (
    <div className="space-y-4">
      <ul className="space-y-1 font-mono">
        {sorted.map((d) => (
          <li key={d.id}>
            <button
              onClick={() => setSelected(d)}
              className={`w-full text-left p-2 rounded border ${
                d.status === 'cleared' ? 'border-emerald-700/40 bg-emerald-950/20' :
                d.status === 'missed' ? 'border-red-700/40 bg-red-950/20' :
                'border-zinc-800'
              }`}
            >
              <span>{d.quest_date}</span>
              <span className="float-right text-xs uppercase">{d.status}</span>
            </button>
          </li>
        ))}
      </ul>
      {selected && (
        <div className="border border-zinc-800 rounded p-3 text-sm">
          <div className="font-mono text-zinc-400">{selected.quest_date}</div>
          <div className="mt-1">Status: <span className="font-mono">{selected.status}</span></div>
          {selected.cleared_at && (
            <div className="mt-1 text-zinc-500 text-xs">
              Cleared at {new Date(selected.cleared_at).toLocaleString()}
            </div>
          )}
          {selected.has_penalty_quest && (
            <div className="mt-1 text-red-400 text-xs">Penalty quest was active</div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `app/history/page.tsx`**

```tsx
import { createClient } from '@/lib/supabase/server';
import { HistoryCalendar } from '@/components/history/HistoryCalendar';
import type { DailyLog } from '@/lib/types';

export default async function HistoryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data } = await supabase
    .from('daily_log')
    .select('*')
    .eq('user_id', user!.id)
    .order('quest_date', { ascending: false })
    .limit(120);
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 px-4 py-6 max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-mono">History</h1>
      <HistoryCalendar logs={(data ?? []) as DailyLog[]} />
    </main>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/history components/history
git commit -m "feat(history): per-day log browsing"
```

---

## Task 18: Navigation Shell & Layout Theming

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`

**Required skill:** `ui-ux-pro-max` for the Solo Leveling aesthetic — deep blacks, blue/purple accents, monospace numerals, subtle glow on level-up moments.

- [ ] **Step 1: Replace `app/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Solo Leveling Life',
  description: 'Train, Hunter.',
  manifest: '/manifest.json',
  themeColor: '#09090b',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#09090b',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="bg-zinc-950 text-zinc-100 antialiased min-h-screen">
        {children}
        <NavBar />
      </body>
    </html>
  );
}

function NavBar() {
  return (
    <nav className="fixed bottom-0 inset-x-0 bg-zinc-950 border-t border-zinc-800 px-4 py-2 flex justify-around text-sm font-mono">
      <Link href="/" className="text-zinc-300 hover:text-blue-400">Home</Link>
      <Link href="/character" className="text-zinc-300 hover:text-blue-400">Stats</Link>
      <Link href="/history" className="text-zinc-300 hover:text-blue-400">History</Link>
      <Link href="/settings" className="text-zinc-300 hover:text-blue-400">Settings</Link>
    </nav>
  );
}
```

- [ ] **Step 2: Update `app/globals.css` — bottom padding so content clears nav**

```css
@import "tailwindcss";

@layer base {
  body { padding-bottom: 4rem; }
  :root {
    --solo-blue: #3b82f6;
    --solo-purple: #8b5cf6;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add app/layout.tsx app/globals.css
git commit -m "feat(ui): bottom nav + Solo Leveling dark theme"
```

---

## Task 19: PWA — Manifest, Service Worker, Icons

**Files:**
- Create: `public/manifest.json`
- Create: `public/sw.js`
- Create: `public/icons/` (192px, 512px PNGs — use a placeholder or generate)

- [ ] **Step 1: Create `public/manifest.json`**

```json
{
  "name": "Solo Leveling Life",
  "short_name": "Solo Life",
  "description": "Train, Hunter.",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#09090b",
  "theme_color": "#09090b",
  "orientation": "portrait",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 2: Create `public/sw.js`**

```js
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => self.clients.claim());
// Minimal — no offline cache. Just enables PWA install on iOS.
```

- [ ] **Step 3: Register the SW in layout**

Add to `app/layout.tsx` inside `<head>`:

```tsx
<script
  dangerouslySetInnerHTML={{
    __html: `if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');`,
  }}
/>
```

- [ ] **Step 4: Add icons**

Generate two PNGs (192x192 and 512x512) — a simple dark square with a blue "S" or a Solo Leveling-style glyph — or use placeholder generator like https://realfavicongenerator.net. Place at `public/icons/icon-192.png` and `public/icons/icon-512.png`.

- [ ] **Step 5: Commit**

```bash
git add public/manifest.json public/sw.js public/icons app/layout.tsx
git commit -m "feat(pwa): manifest + service worker + icons for home-screen install"
```

---

## Task 20: E2E Happy-Path Test

**Files:**
- Create: `e2e/happy-path.spec.ts`

This test requires a seeded Supabase test user. For solo-dev usage we'll skip auto-auth and just assert public surface; full E2E with auth can be added later.

- [ ] **Step 1: Create `e2e/happy-path.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

test('login page renders and shows email form', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('h1', { hasText: 'SYSTEM' })).toBeVisible();
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('button', { hasText: /Send magic link/i })).toBeVisible();
});

test('protected route redirects to login', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
});
```

- [ ] **Step 2: Run E2E**

```bash
pnpm test:e2e
```

Expected: both tests pass.

- [ ] **Step 3: Commit**

```bash
git add e2e playwright.config.ts
git commit -m "test(e2e): smoke tests for login + protected redirect"
```

---

## Task 21: Production Deployment

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create Supabase project**

Manual:
1. Go to https://supabase.com → New Project
2. Set name "solo-leveling-life", choose region, save DB password
3. SQL Editor → paste `supabase/migrations/0001_init.sql` → run
4. SQL Editor → paste `supabase/migrations/0002_rls.sql` → run
5. Copy `Project URL`, `anon key`, and `service_role key` → into Vercel env later

- [ ] **Step 2: Sign up Resend**

Manual:
1. https://resend.com → free account
2. API Keys → create one → copy
3. Use `onboarding@resend.dev` as the "from" address (no domain verification needed for personal use)

- [ ] **Step 3: Push to GitHub**

```bash
gh repo create solo-leveling-life --private --source=. --remote=origin --push
```

- [ ] **Step 4: Deploy to Vercel**

Manual:
1. https://vercel.com → New Project → Import the GitHub repo
2. Add env vars:
   - `NEXT_PUBLIC_SUPABASE_URL` = Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (mark as secret, not exposed to client)
   - `RESEND_API_KEY`
   - `CRON_SECRET` = `openssl rand -hex 32` output
   - `APP_URL` = your Vercel URL (e.g. `https://solo-leveling-life.vercel.app`)
3. Deploy
4. Verify the cron is registered: Vercel dashboard → Settings → Cron Jobs → should show `/api/cron/tick` hourly

- [ ] **Step 5: First-run verification**

1. Visit your Vercel URL → log in via magic link
2. Settings → set `email_target` to `hassan.khanafer100@gmail.com`, save
3. Settings → click "Send test email" → check inbox
4. Settings → Daily Template → click "Load Hassan's defaults"
5. Set `reset_hour_local` to (current hour) and `email_send_hour_local` to (current hour + 1) for an immediate test
6. Manually trigger the cron once:
   ```bash
   curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://your-vercel-url.vercel.app/api/cron/tick
   ```
7. Reload dashboard → today's quests should appear
8. Reset hours to your preferred defaults

- [ ] **Step 6: Install on iPhone**

1. Open Vercel URL in Safari on phone
2. Share → Add to Home Screen
3. Launches full-screen, looks like a native app

- [ ] **Step 7: Write `README.md`**

```markdown
# Solo Leveling Life

Personal gamified daily-discipline web app — Solo Leveling System mechanics applied to real life.

## Stack
Next.js 15 · Supabase · Resend · Vercel · Tailwind v4 · shadcn/ui

## Local dev
\`\`\`bash
pnpm install
cp .env.local.example .env.local  # fill in keys
pnpm dev
\`\`\`

## Migrations
SQL files in \`supabase/migrations/\` — apply via Supabase dashboard SQL editor.

## Cron
Vercel hourly cron hits \`/api/cron/tick\`. Authenticated via \`CRON_SECRET\` bearer header.

## Spec & plan
- Design: \`docs/superpowers/specs/2026-05-11-solo-leveling-life-design.md\`
- Plan: \`docs/superpowers/plans/2026-05-11-solo-leveling-life.md\`
```

- [ ] **Step 8: Commit**

```bash
git add README.md
git commit -m "docs: README with deploy walkthrough"
git push
```

---

## Task 22: Final Review & Verification

**Required skills:** `fullstack-dev-skills:code-reviewer`, `superpowers:verification-before-completion`, `fullstack-dev-skills:fullstack-guardian`.

- [ ] **Step 1: Run full test suite**

```bash
pnpm test
pnpm test:e2e
pnpm build
```

Expected: all green, build succeeds.

- [ ] **Step 2: Code review pass**

Dispatch `fullstack-dev-skills:code-reviewer` against the diff vs initial commit. Address any actionable findings.

- [ ] **Step 3: RLS verification**

In Supabase SQL editor:

```sql
-- Should return 0 rows when run as a non-owner JWT
select * from profile where user_id != auth.uid();
```

Confirm RLS blocks cross-user reads on every table.

- [ ] **Step 4: Live cron verification**

Wait for the next natural hour boundary on Vercel; check Vercel Logs for the cron execution. Confirm:
- No 5xx errors
- For your user: appropriate action logged
- Email arrives at the configured hour

- [ ] **Step 5: Acceptance criteria checklist**

Tick each item from the spec (`docs/superpowers/specs/2026-05-11-solo-leveling-life-design.md` §12). Anything unticked: open a follow-up task.

- [ ] **Step 6: Final commit & tag**

```bash
git tag v0.1.0
git push --tags
```

---

## Self-Review

**Spec coverage:**
- §3.1–3.8 mechanics → Tasks 3, 5, 9, 10, 11, 16 ✓
- §4 email → Tasks 14, 15, 16 ✓
- §5 data model → Task 2 ✓
- §6 screens → Tasks 7, 8, 12, 13, 14, 17 ✓
- §7 scheduled jobs → Task 16 ✓
- §8 tech stack → Task 1 ✓
- §11 plugin directives → referenced in Tasks 1, 7, 12, 16, 18, 22 ✓
- §12 acceptance criteria → verified in Task 22 ✓

**Placeholder scan:** No "TBD" / "TODO" / "implement later." Every code step has runnable code or exact CLI.

**Type consistency:**
- `StatKind` / `CompletionType` / `DailyStatus` defined once in `lib/types.ts`, reused everywhere ✓
- `applyXpGain` signature consistent between `xp.ts` definition and `completeQuest.ts` / cron call sites ✓
- `evaluateDailyClear` returns `{status, required_remaining}` everywhere ✓
- `buildPenaltyInstance` returns `Omit<QuestInstance, 'id'>` — matches insert call sites ✓

**Scope check:** Single cohesive app, one plan is appropriate. No subsystem decomposition needed.
