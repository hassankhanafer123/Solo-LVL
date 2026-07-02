# Solo Leveling Life — Python API

A FastAPI backend that re-implements the Next.js server actions
(`app/actions/tracker.ts`) and the pure game logic in `lib/`. The React
frontend is **unchanged** — this service exposes the same behaviour over REST
so the UI can eventually call Python instead of server actions.

This is the **first pass**: pure logic + endpoints + auth bridge, verified
standalone. The frontend has not been rewired yet.

## Layout

```
api/
  app/
    logic/        # pure game logic, 1:1 port of lib/ (no I/O) — fully tested
    config.py     # env settings (reuses the Next.js Supabase project)
    db.py         # supabase client factories (user-scoped + admin)
    auth.py       # Bearer-token auth bridge (validates Supabase JWT)
    schemas.py    # Pydantic request/response models (camelCase, matches the UI)
    tracker_service.py  # port of the 10 server actions
    main.py       # FastAPI app + routes
  tests/          # pytest mirror of the original vitest suites (76 tests)
```

## Setup

```bash
cd api
python3 -m venv .venv && source .venv/bin/activate   # optional but recommended
pip install -r requirements.txt
cp .env.example .env   # then fill in values from the repo-root .env.local
```

`.env` reuses the same Supabase project as the web app. Copy
`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` /
`SUPABASE_SERVICE_ROLE_KEY` from the repo-root `.env.local`.

## Run

```bash
cd api
uvicorn app.main:app --reload --port 8000
```

- Interactive docs: http://localhost:8000/docs
- Health check: http://localhost:8000/health

## Test

```bash
cd api
pytest            # 76 tests, mirrors the TypeScript vitest suite
```

## Endpoints

All `/api/*` routes require `Authorization: Bearer <supabase-access-token>`.

| Method | Path | Was (server action) |
|--------|------|---------------------|
| GET  | `/api/snapshot` | `getTodaySnapshot` |
| POST | `/api/username` | `setUsername` |
| POST | `/api/quests/{id}/progress` | `setQuestProgress` |
| POST | `/api/quests/{id}/complete` | `completeQuest` |
| POST | `/api/quests/{id}/uncomplete` | `uncompleteQuest` |
| POST | `/api/weekly/{id}/progress` | `setWeeklyProgress` |
| GET  | `/api/leaderboard` | `getLeaderboard` |
| POST | `/api/leaderboard/join` | `joinLeaderboard` |
| POST | `/api/leaderboard/leave` | `leaveLeaderboard` |
| POST | `/api/plan` | `planWeek` |

## Testing an authenticated request

The endpoints need a real Supabase access token. The browser app gets one via
magic-link login. For local API testing you can mint one with an email+password
test user (see `scripts/get_token.py`), then:

```bash
TOKEN="...";
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/snapshot
```

## Frontend wiring (done 2026-06-07)

The React app now calls this API instead of the Next.js server actions:

- `lib/api/client.ts` — browser client; attaches the Supabase access token as a
  Bearer header. Used by `hooks/use-tracker.ts`, `app/welcome/page.tsx`,
  `app/leaderboard/leaderboard-client.tsx`.
- `lib/api/server.ts` — server-component client; forwards the session token from
  cookies to this API for the initial render. Used by `app/page.tsx` and
  `app/leaderboard/page.tsx`.
- Set `NEXT_PUBLIC_API_URL` (defaults to `http://localhost:8000`).

`app/actions/tracker.ts` is now unused (kept for reference; safe to delete).

Run both apps in dev: `uvicorn app.main:app --port 8000` (here) and
`npm run dev` (repo root). Verified end-to-end in the browser: authenticated
SSR dashboard renders from `/api/snapshot`, and mutations round-trip with CORS.

## Production deployment (Fly.io)

The API ships as a Docker image (`Dockerfile`) running gunicorn + uvicorn
workers. Config lives in `fly.toml`.

**One-time:**
```bash
cd api
fly launch --no-deploy          # or edit the app name in fly.toml
# Set secrets (copy from your repo-root .env.local):
fly secrets set \
  SUPABASE_URL="https://<ref>.supabase.co" \
  SUPABASE_ANON_KEY="sb_publishable_..." \
  SUPABASE_SERVICE_ROLE_KEY="sb_secret_..." \
  CORS_ORIGINS="https://<your-frontend>.vercel.app"
```

**Deploy:**
```bash
cd api && fly deploy
```

**Then point the frontend at it** — in Vercel project settings add:
```
NEXT_PUBLIC_API_URL = https://<your-fly-app>.fly.dev
```
and set `CORS_ORIGINS` on Fly to the exact Vercel origin. Redeploy the frontend.

### Hardening already in place
- **Local JWT verification** via Supabase JWKS (ES256) — no per-request network
  call to validate tokens; falls back to `get_user` only if needed.
- **Rate limiting** (slowapi, per-client IP, X-Forwarded-For aware, `RATE_LIMIT` env).
- **No internal leakage** — unhandled errors return a generic 500, logged server-side.
- **gunicorn** production server, `/health` check wired into `fly.toml`.

### ⚠️ Required DB migration before launch
`supabase/migrations/0007_fix_new_user_week_tz.sql` fixes a pre-existing signup
bug: the `handle_new_user` trigger seeded the first week in UTC, which disagreed
with the app's timezone-based week start — a user signing up on a US Sunday
night got zero quests. Apply it in the Supabase dashboard SQL editor (CLI isn't
linked). New signups only; existing users unaffected.

## Not done yet (next passes)

- Porting the email reminder cron (`app/api/cron/reminders/route.ts`) — still
  runs fine as a Vercel cron in the Next app; not yet moved to Python.
- Upgrading Supabase off the free tier (it pauses when idle).
- CI (pytest + tsc + lint on PRs).
