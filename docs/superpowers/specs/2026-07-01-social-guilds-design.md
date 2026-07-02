# Social Layer v1 ("Guilds") + Pre-Launch Hardening — Design

**Date:** 2026-07-01
**Status:** Approved (design review with Hassan, this session)
**Goal:** Harden the app for multi-user launch, add a party-scoped social layer (guilds, duels, activity feed), then deploy (Vercel + Fly.io + Supabase). Emails deferred until a Resend account exists.

## Context

The app today is a single-player gamified tracker with one global opt-in leaderboard. A three-way code review (backend, frontend, data layer — 2026-07-01) found the core solid (169 tests green, RLS-forwarded JWT auth, privacy-minimal leaderboard) but flagged launch blockers: a profile RLS policy that lets any user forge leaderboard stats and abuse the email cron, three email-cron failure modes, and missing error handling on the exact paths invited friends hit first.

**Architecture decision:** the party IS the social graph. One party per user, joined by invite code. Duels and the activity feed exist only inside a party. No separate friends system (YAGNI — revisit if parties feel limiting).

## Part 1 — Hardening (pre-launch blockers)

### 1a. Migration `0008_hardening.sql`
- **Lock stat columns:** revoke UPDATE on `profile` from `authenticated`, then grant UPDATE only on user-editable columns (`username`, `timezone`, `send_hour`, `weekly_report`, `leaderboard_opt_in`). Browsers can no longer write `total_xp`, `level`, `xp_in_level`, streak columns, or `email_target`. Same treatment for `quest_instance.xp_awarded` (revoke UPDATE on that column from `authenticated`; grant the progress columns the UI legitimately writes through the API's user-scoped client). Remove the client INSERT policy on `level_up_event`.
- **Username integrity:** `CHECK (username ~ '^[A-Za-z0-9_]{3,20}$')` on `profile`.
- **Leaderboard:** `REVOKE EXECUTE ON FUNCTION get_leaderboard() FROM public, anon;`
- **Consequence for the API:** profile stat writes and `xp_awarded` writes in `tracker_service.py` move from the user-scoped client to the admin (service-role) client. Safe: `user_id` comes from the locally-verified JWT, and every write stays explicitly filtered by it. All other reads/writes keep the user-scoped client so RLS remains the enforcement wall.

### 1b. Email cron reliability (`cron_service.py`)
Code ships correct even though emails stay off at launch:
- Wrap the per-profile body in try/except; a bad `timezone` (or any per-user error) counts as `errors: +1` and the loop continues.
- Paginate `admin.auth.admin.list_users()` (currently silently caps at 50).
- Claim-then-send dedupe: insert the `email_log` row (upsert, `ignore_duplicates`) **before** sending; only send if this run won the claim. Kills the double-send race and the mid-run abort.
- `email_target` is ignored unless it equals the user's auth email (spam-vector neutralized; revisit with proper verification later).

### 1c. Invite-funnel UX (frontend)
- Root `app/error.tsx` + `app/loading.tsx` and `/leaderboard` equivalents — cold starts show a themed loading state; API downtime shows a retry screen, not Vercel's crash page.
- `/welcome`: wrap `setUsername` in try/catch — failures re-enable the button with an error message.
- `/login`: read `?error=` from the callback redirect and show "That sign-in link didn't work — request a fresh one" (covers the Gmail in-app-browser PKCE failure).
- Sign-out button in both shells (route already exists, no UI references it).
- `/demo/leaderboard`: use the injected demo API (currently imports the live client → "Leave" button errors inside the demo); Back link stays inside `/demo`.

### 1d. API misc
- Rate limiter keys on `Fly-Client-IP` when present (current leftmost-XFF key is client-spoofable on Fly).
- Pydantic input caps: `rows` list ≤ 50, `name` ≤ 80 chars, numeric values ≤ 1,000,000.

### 1e. Git hygiene
- Unstage the 26 `__pycache__/*.pyc` files; add `__pycache__/`, `*.py[cod]`, `.venv/`, `.pytest_cache/` to `.gitignore`.
- `git add` the untracked files the staged tree will need (`lib/api/contract.ts`, `lib/demo/`, `app/demo/`, modified `lib/api/client.ts`, etc.) so CI stays green after commit.
- Verified: no real secrets staged or in history.

## Part 2 — Social layer

### 2a. Migration `0009_social.sql`

```
party            id uuid pk, name text CHECK (3–24 chars, no control chars),
                 code text UNIQUE (6 chars A-Z0-9, server-generated),
                 created_by uuid → profile, created_at
party_member     party_id → party, user_id → profile UNIQUE (one party per user),
                 role text CHECK (leader|member), joined_at
                 → party size enforced at 8 in the join/create RPCs
duel             id, party_id, challenger_id, opponent_id, status CHECK
                 (pending|active|declined|finished), created_at, accepted_at,
                 week_start date, ends_at timestamptz, winner_id nullable,
                 penalty_applied bool default false,
                 UNIQUE index on the (least,greatest) user pair WHERE status IN (pending,active)
activity_event   id, party_id, user_id, kind CHECK (quest_complete|level_up|
                 weekly_goal_hit|member_joined|duel_started|duel_won),
                 payload jsonb, created_at; index (party_id, created_at desc)

plus: ALTER TABLE profile ADD COLUMN duel_wins int NOT NULL DEFAULT 0
      (locked column — admin-written only, like total_xp)
```

**RLS (party-scoped everywhere):**
- Recursion-safe helper: `get_my_party_id()` — SECURITY DEFINER, pinned `search_path`, returns the caller's party id. All party-table policies use it (avoids the party_member self-join RLS recursion trap).
- `party`, `party_member`, `duel`, `activity_event`: SELECT where `party_id = get_my_party_id()`.
- **No client INSERT/UPDATE/DELETE policies on any social table.** All writes go through the API's admin client (feed events must be unforgeable) or SECURITY DEFINER RPCs:
  - `create_party(name)` — generates a unique code, inserts party + leader membership; fails if already in a party.
  - `join_party(code)` — code lookup, size < 8 check, inserts membership, emits `member_joined` event; fails if already in a party.
  - `leave_party()` — removes membership; if the leaver was the last member, delete the party; if the leader leaves, oldest member becomes leader. Active duels involving the leaver are voided (status → finished, no winner, no penalty).

### 2b. Duel mechanics
- Challenge a party-mate → `pending`. Opponent accepts → `active`, `ends_at` = end of the challenger's current week (absolute UTC timestamp computed from the challenger's timezone). Decline → `declined`. One pending/active duel per user pair (DB-enforced).
- **Score** = sum of `xp_awarded` on cleared `quest_instance` rows whose date falls within the duel window, plus `weekly_quest_instance` XP awarded in that week. Computed live from existing tables — un-completing a quest honestly lowers the score; nothing new to keep in sync.
- **Resolution is lazy and idempotent:** any snapshot/party/duel read past `ends_at` resolves the duel via a guarded conditional update (`status = 'active' AND now() > ends_at`); winner recorded, `duel_won` feed event emitted. Tie → draw, no winner, no penalty.
- **Loser penalty (chosen in design review):** on the loser's next daily-log build after resolution, insert one penalty instance via the existing `build_penalty_instance()` (+50% target and XP, named "(Duel Penalty +50%)"), guarded by `duel.penalty_applied`. Draws and voided duels apply no penalty.
- **Winner reward:** `duel_won` feed event + `duel_wins` counter on profile (locked column, admin-written). No bonus XP — the locked-XP economy stays pure.

### 2c. Feed events
Emitted by the API (admin client) at: quest complete (name + XP in payload), level up, weekly goal hit, member joined, duel started, duel won. Quest *un*-complete deletes the matching event (instance id kept in payload). Feed reads return the latest 50 for the party. No retention job in v1.

### 2d. API endpoints (all Bearer-authed, same patterns as existing)
```
GET  /api/party                    overview: party, roster ranked by this week's XP,
                                   combined party XP, active/pending duels, feed (50)
                                   (weekly XP per member uses the same scoring helper
                                   as duels, windowed to each member's current week)
POST /api/party                    create {name}
POST /api/party/join               {code}
POST /api/party/leave
POST /api/duels                    {opponentId}
POST /api/duels/{id}/accept
POST /api/duels/{id}/decline
```
(Duel state rides along in `GET /api/party` and the dashboard snapshot — no separate duel GET.)
Pure logic in `api/app/logic/social.py` (code generation, duel windows, scoring, resolution) with pytest coverage mirroring the existing suites. `GET /api/snapshot` gains an `activeDuel` summary (opponent, my score, their score, ends_at) and triggers lazy duel resolution + pending penalty application.

### 2e. Frontend (both shells: desktop + mobile)
- **`/party` page** — no-party state: create (name input) or join (code input); party state: header (name, code + copy/share button, combined XP), roster ranked by weekly XP with challenge buttons, active-duel card (two progress bars), feed list. SSR via `lib/api/server.ts` like `/leaderboard`.
- **Dashboard** — party pill next to the leaderboard pill (both shells); compact active-duel banner with live scores.
- **Demo mode** — fake party ("Shadow Monarchs", 3 fake members, seeded feed, one active duel) implementing the same contract so `/demo` sells the feature.
- Contract additions in `lib/api/contract.ts`; vitest coverage for new pure helpers.

## Part 3 — Deploy (after Parts 1–2 are green)

1. Commit (hygiene-clean), push, PR `feat/email-reminders` → `main`, merge after CI passes. (The cron workflow only fires from the default branch.)
2. **Hassan:** paste migrations 0006, 0007, 0008, 0009 into the Supabase SQL editor, in order.
3. **Claude:** `fly launch --no-deploy` + `fly secrets set` (Supabase keys from local env, CORS origin, CRON_SECRET; `RESEND_API_KEY` empty — cron returns skips, sends nothing) + `fly deploy` + health check. Fly CLI already authed.
4. **Hassan:** Vercel — `vercel login` or dashboard; connect repo, set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL`; add the Vercel origin to Supabase Auth redirect allowlist; deploy.
5. **Claude:** `gh secret set API_URL / CRON_SECRET`; trigger the reminders workflow once (expect all-skips, no 500).
6. **Smoke test:** magic link → welcome → dashboard → create party → second account joins by code → duel challenge/accept → complete quest → feed + scores update → leaderboard join.
7. Supabase free tier pauses when idle — upgrade recommended before real users (Hassan's call, not blocking).

## Out of scope (v1)
Emails on (needs Resend), invite deep-links with inviter preview, party chat, kick member, multi-party membership, duel history page, XP-increment RPC for the concurrent-write race (fast-follow), FBX→GLB asset optimization, README rewrite (fast-follow).

## Testing
- pytest: social logic (scoring windows incl. DST, resolution idempotency, penalty application, code generation), endpoint tests mirroring existing service tests.
- vitest: contract/demo helpers.
- Existing suites must stay green (83 API + 86 web + tsc + next build).
- Manual: the smoke test in Part 3 with two real accounts.
