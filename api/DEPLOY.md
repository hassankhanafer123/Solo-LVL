# Production Deploy Runbook — Solo Leveling Life / DayMaxing

Two services: **Next.js frontend on Vercel** + **Python API on Fly.io**, sharing
one **Supabase** project. Do the steps in order.

---

## 0. Prerequisites (one-time)
- Install the Fly CLI: `brew install flyctl` then `fly auth login`.
- Have your Supabase project's keys handy (Dashboard → Project Settings → API):
  `SUPABASE_URL`, the publishable key (`sb_publishable_…`), the secret key (`sb_secret_…`).
- A [Resend](https://resend.com) API key + a verified sender domain (for emails).

---

## 1. Apply pending database migrations ⚠️ REQUIRED
Migrations in this repo are applied by hand (CLI not linked). Open the Supabase
Dashboard → SQL Editor and run these **in order** if not already applied:

- `supabase/migrations/0006_email_kind.sql` — adds `email_log.kind`. **The email
  cron 500s without it.**
- `supabase/migrations/0007_fix_new_user_week_tz.sql` — fixes the signup trigger so
  new users get quests regardless of timezone/day. **Without it, US Sunday-night
  signups get zero quests.**
- `supabase/migrations/0008_hardening.sql` — locks stat columns + adds the
  `'pending'` `email_status` enum value. **Must be applied before (or with) this
  API build — the cron claim insert and locked-column writes fail otherwise.**
- `supabase/migrations/0009_social.sql` — party/duel/feed tables + RPCs. **Required:**
  `/party` and every dashboard snapshot query these tables; without it they 500.

Quick check they took:
```sql
select column_name from information_schema.columns
where table_name='email_log' and column_name='kind';   -- expect 1 row
```

---

## 2. Deploy the Python API to Fly.io
```bash
cd api
fly launch --no-deploy          # accept/edit the app name in fly.toml
fly secrets set \
  SUPABASE_URL="https://<ref>.supabase.co" \
  SUPABASE_ANON_KEY="sb_publishable_..." \
  SUPABASE_SERVICE_ROLE_KEY="sb_secret_..." \
  CORS_ORIGINS="https://<your-frontend>.vercel.app" \
  RESEND_API_KEY="re_..." \
  EMAIL_FROM="DayMaxing <reminders@yourdomain.com>" \
  APP_URL="https://<your-frontend>.vercel.app" \
  CRON_SECRET="$(openssl rand -hex 24)" \
  SENTRY_DSN=""          # optional; leave blank to disable error tracking
fly deploy
fly status                 # confirm a machine is running
curl https://<app>.fly.dev/health   # expect {"status":"ok"}
```
Note the generated URL `https://<app>.fly.dev` and the `CRON_SECRET` value — you
need both below.

## 3. Point the frontend at the API (Vercel)
Vercel → Project → Settings → Environment Variables:
```
NEXT_PUBLIC_API_URL = https://<app>.fly.dev
```
Keep the existing `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
Redeploy the frontend. Then confirm `CORS_ORIGINS` on Fly exactly matches the
Vercel origin (no trailing slash).

## 4. Schedule the email cron (GitHub Actions)
The cron now lives in the API (`POST /internal/cron/reminders`) and is triggered
hourly by `.github/workflows/reminders-cron.yml`. Add repo secrets
(GitHub → Settings → Secrets and variables → Actions):
```
API_URL     = https://<app>.fly.dev
CRON_SECRET = <same value you set on Fly>
```
Trigger once manually (Actions tab → "Email reminders" → Run workflow) to verify.

## 5. Supabase production hygiene
- **Upgrade off the free tier** — it pauses when idle; a paused DB means failed
  requests for real users.
- Confirm RLS is enabled on all user tables (it is in the migrations).

## 6. Smoke test (post-deploy)
- [ ] `GET https://<app>.fly.dev/health` → 200
- [ ] Sign in to the frontend with a magic link → dashboard loads (data from the API)
- [ ] Complete a quest → persists on refresh
- [ ] Open `/leaderboard`, join → you appear
- [ ] Manually run the reminders workflow → returns JSON counts, no 500
- [ ] (If `min_machines_running = 0`) note the first request after idle is a cold start

---

## CI
`.github/workflows/ci.yml` runs on every PR/push to main: API `pytest` + web
`tsc --noEmit` + `next build`. Keep it green before deploying.

## Rollback
`fly releases` → `fly deploy --image <previous>` (or `fly apps restart`). The
frontend rolls back from the Vercel dashboard (Deployments → Promote previous).
