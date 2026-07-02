# Production-Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. **Git note for this run: the user will handle all commits/pushes — make the file changes and run the verifications, but DO NOT run `git commit`/`git push`.**

**Goal:** Finish making Solo Leveling Life (DayMaxing) production-ready and deployable: port the last TypeScript backend logic (email cron) to Python, add CI + error tracking, verify the Docker image builds and boots, run a security review, and produce a single deploy runbook.

**Architecture:** Python FastAPI backend (`api/`) is the only app logic. The email reminder cron moves from a Next.js route to a protected Python endpoint, triggered hourly by a GitHub Actions schedule. The Next.js cron route and Vercel cron are removed. CI runs pytest + tsc + next build. Sentry is wired but env-gated (no DSN = off).

**Tech Stack:** FastAPI, Resend (Python SDK), sentry-sdk, GitHub Actions, Docker, Fly.io.

---

### Task 1: Port the reminder-due decision to Python

**Files:**
- Create: `api/app/logic/email_due.py`
- Test: `api/tests/test_email_due.py`

- [ ] **Step 1: Write the failing test** (mirrors lib/email/due.ts behaviour)

```python
# api/tests/test_email_due.py
from datetime import datetime, timezone
from app.logic.email_due import reminder_due

def _utc(s): return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(timezone.utc)
NY = "America/New_York"

def test_due_at_send_hour():
    # 2026-06-10 11:00 UTC = 07:00 EDT (Wed); send_hour 7 -> daily due, not weekly
    r = reminder_due(now=_utc("2026-06-10T11:00:00Z"), timezone=NY, send_hour=7, reset_hour=4, email_enabled=True)
    assert r.daily is True
    assert r.weekly is False
    assert r.local_date == "2026-06-10"
    assert r.week_start == "2026-06-08"

def test_not_due_off_hour():
    r = reminder_due(now=_utc("2026-06-10T15:00:00Z"), timezone=NY, send_hour=7, reset_hour=4, email_enabled=True)
    assert r.daily is False and r.weekly is False

def test_disabled_never_due():
    r = reminder_due(now=_utc("2026-06-10T11:00:00Z"), timezone=NY, send_hour=7, reset_hour=4, email_enabled=False)
    assert r.daily is False and r.weekly is False

def test_weekly_on_local_monday():
    # 2026-06-08 11:00 UTC = 07:00 EDT Monday; local_date == week_start -> weekly due
    r = reminder_due(now=_utc("2026-06-08T11:00:00Z"), timezone=NY, send_hour=7, reset_hour=4, email_enabled=True)
    assert r.daily is True and r.weekly is True
    assert r.local_date == "2026-06-08" == r.week_start
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && python3 -m pytest tests/test_email_due.py -q`
Expected: FAIL (module `app.logic.email_due` not found)

- [ ] **Step 3: Write minimal implementation**

```python
# api/app/logic/email_due.py
"""Reminder-due decision — port of lib/email/due.ts."""
from __future__ import annotations
from dataclasses import dataclass
from datetime import datetime
from .time_utils import get_current_week_start, local_date_iso, local_hour

@dataclass
class DueResult:
    daily: bool
    weekly: bool
    local_date: str
    week_start: str

def reminder_due(*, now: datetime, timezone: str, send_hour: int, reset_hour: int, email_enabled: bool) -> DueResult:
    local_date = local_date_iso(now, timezone)
    week_start = get_current_week_start(now, timezone, reset_hour)
    at_send_hour = email_enabled and local_hour(now, timezone) == send_hour
    return DueResult(
        daily=at_send_hour,
        weekly=at_send_hour and local_date == week_start,
        local_date=local_date,
        week_start=week_start,
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api && python3 -m pytest tests/test_email_due.py -q`
Expected: PASS (4 passed)

---

### Task 2: Port the email templates to Python HTML

**Files:**
- Create: `api/app/email/__init__.py` (empty)
- Create: `api/app/email/templates.py`
- Test: `api/tests/test_email_templates.py`

- [ ] **Step 1: Write the failing test**

```python
# api/tests/test_email_templates.py
from app.email.templates import morning_email_html, weekly_email_html

def test_morning_has_username_tasks_and_button():
    html = morning_email_html(username="Hassan", tasks=[{"name": "Push-ups", "stat": "STR"}], app_url="https://x.app")
    assert "Good morning, Hassan" in html
    assert "Push-ups" in html
    assert "STR" in html
    assert "https://x.app" in html
    assert "DayMaxing" in html

def test_morning_empty_tasks_message():
    html = morning_email_html(username="H", tasks=[], app_url="https://x.app")
    assert "No tasks set for today" in html

def test_weekly_has_username_and_button():
    html = weekly_email_html(username="Hassan", app_url="https://x.app")
    assert "Plan your week" in html
    assert "Hassan" in html
    assert "https://x.app" in html
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && python3 -m pytest tests/test_email_templates.py -q`
Expected: FAIL (module not found)

- [ ] **Step 3: Write minimal implementation**

```python
# api/app/email/templates.py
"""HTML email templates — port of lib/email/templates.tsx (React Email -> HTML)."""
from __future__ import annotations
from html import escape

_BG = "#0a0a0f"; _CARD = "#13131c"; _BORDER = "#262635"
_TEXT = "#e6e6f0"; _MUTED = "#8a8aa0"; _ACCENT = "#7c5cff"
_STAT_COLOR = {"INT": "#4f9dff", "STR": "#ff6b6b", "DIS": "#7c5cff"}

_MAIN = f"background-color:{_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;margin:0;padding:32px 0;"
_CONTAINER = f"background-color:{_CARD};border:1px solid {_BORDER};border-radius:14px;margin:0 auto;max-width:480px;padding:36px 32px;"
_BRAND = f"color:{_ACCENT};font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 20px;"
_HEADING = f"color:{_TEXT};font-size:24px;font-weight:700;margin:0 0 8px;"
_LEAD = f"color:{_MUTED};font-size:15px;line-height:22px;margin:0 0 24px;"
_TASK_ROW = f"border-bottom:1px solid {_BORDER};padding:12px 0;"
_TASK_NAME = f"color:{_TEXT};font-size:15px;margin:0;"
_BUTTON = f"background-color:{_ACCENT};border-radius:10px;color:#fff;display:inline-block;font-size:15px;font-weight:600;padding:12px 28px;text-decoration:none;"

def _stat_badge(stat: str) -> str:
    c = _STAT_COLOR.get(stat, _ACCENT)
    style = (f"background-color:{c}22;border:1px solid {c};border-radius:6px;color:{c};"
             f"display:inline-block;font-size:11px;font-weight:700;letter-spacing:1px;margin-left:8px;padding:2px 7px;")
    return f'<span style="{style}">{escape(stat)}</span>'

def _shell(preview: str, inner: str) -> str:
    return (f'<!doctype html><html><head><meta charset="utf-8">'
            f'<div style="display:none;max-height:0;overflow:hidden">{escape(preview)}</div></head>'
            f'<body style="{_MAIN}"><div style="{_CONTAINER}">{inner}</div></body></html>')

def morning_email_html(*, username: str, tasks: list[dict], app_url: str) -> str:
    u = escape(username)
    if not tasks:
        rows = f'<p style="{_TASK_NAME}color:{_MUTED}">No tasks set for today — open the app to plan your day.</p>'
    else:
        rows = "".join(
            f'<div style="{_TASK_ROW}"><p style="{_TASK_NAME}">{escape(t["name"])}{_stat_badge(t["stat"])}</p></div>'
            for t in tasks
        )
    inner = (f'<p style="{_BRAND}">DayMaxing</p>'
             f'<h1 style="{_HEADING}">Good morning, {u}</h1>'
             f'<p style="{_LEAD}">Here\'s today\'s run:</p>'
             f'<div>{rows}</div>'
             f'<div style="padding-top:28px"><a href="{escape(app_url)}" style="{_BUTTON}">Open DayMaxing</a></div>')
    return _shell(f"Here's today's run, {username}.", inner)

def weekly_email_html(*, username: str, app_url: str) -> str:
    u = escape(username)
    inner = (f'<p style="{_BRAND}">DayMaxing</p>'
             f'<h1 style="{_HEADING}">Plan your week</h1>'
             f'<p style="{_LEAD}">New week, {u}. Open DayMaxing and set this week\'s tasks so your daily runs are ready to go.</p>'
             f'<div style="padding-top:8px"><a href="{escape(app_url)}" style="{_BUTTON}">Plan this week</a></div>')
    return _shell("Plan your week on DayMaxing", inner)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api && python3 -m pytest tests/test_email_templates.py -q`
Expected: PASS (3 passed)

---

### Task 3: Resend send wrapper

**Files:**
- Create: `api/app/email/send.py`
- Modify: `api/requirements.txt` (add `resend==2.5.1`)
- Modify: `api/app/config.py` (add email + cron settings)

- [ ] **Step 1: Add dependency**

Add to `api/requirements.txt` after `slowapi==0.1.9`:
```
resend==2.5.1
sentry-sdk[fastapi]==2.20.0
```

- [ ] **Step 2: Add settings**

In `api/app/config.py`, add these fields to `Settings` (after `rate_limit`):
```python
    resend_api_key: str = Field(default="", validation_alias=AliasChoices("RESEND_API_KEY"))
    email_from: str = Field(default="DayMaxing <onboarding@resend.dev>", validation_alias=AliasChoices("EMAIL_FROM"))
    app_url: str = Field(default="http://localhost:3000", validation_alias=AliasChoices("APP_URL"))
    cron_secret: str = Field(default="", validation_alias=AliasChoices("CRON_SECRET"))
    sentry_dsn: str = Field(default="", validation_alias=AliasChoices("SENTRY_DSN"))
```

- [ ] **Step 3: Write the send wrapper**

```python
# api/app/email/send.py
"""Resend email send — port of lib/email/send.ts."""
from __future__ import annotations
import resend
from ..config import get_settings

def send_email(*, to: str, subject: str, html: str) -> dict:
    s = get_settings()
    resend.api_key = s.resend_api_key
    return resend.Emails.send({"from": s.email_from, "to": to, "subject": subject, "html": html})
```

- [ ] **Step 4: Install + import check**

Run: `cd api && pip3 install -q -r requirements.txt && python3 -c "import resend, sentry_sdk; from app.email.send import send_email; print('ok')"`
Expected: `ok`

---

### Task 4: Cron service (port the route logic)

**Files:**
- Create: `api/app/cron_service.py`

- [ ] **Step 1: Write the service** (port of app/api/cron/reminders/route.ts, using the admin client)

```python
# api/app/cron_service.py
"""Email reminder cron — port of app/api/cron/reminders/route.ts.

Iterates all profiles, decides who is due this hour, dedupes via email_log,
sends morning/weekly emails via Resend, and records each attempt. Uses the
service-role (admin) client because it operates across all users.
"""
from __future__ import annotations
from datetime import datetime, timezone

from .config import get_settings
from .db import admin_client
from .email.send import send_email
from .email.templates import morning_email_html, weekly_email_html
from .logic.email_due import reminder_due


def _email_map(admin) -> dict[str, str | None]:
    out: dict[str, str | None] = {}
    page = admin.auth.admin.list_users()
    users = page if isinstance(page, list) else getattr(page, "users", page)
    for u in users:
        out[u.id] = getattr(u, "email", None)
    return out


def _already_sent(admin, user_id: str, local_date: str, kind: str) -> bool:
    res = (
        admin.table("email_log").select("id")
        .eq("user_id", user_id).eq("quest_date", local_date).eq("kind", kind)
        .maybe_single().execute()
    )
    return bool(res and res.data)


def _daily_tasks(admin, user_id: str, week_start: str) -> list[dict]:
    wp = (
        admin.table("week_plan").select("id")
        .eq("user_id", user_id).eq("week_start_date", week_start).maybe_single().execute()
    )
    if not (wp and wp.data):
        return []
    rows = (
        admin.table("quest_template").select("name, primary_stat")
        .eq("week_plan_id", wp.data["id"]).eq("active", True).eq("cadence", "daily")
        .order("sort_order").execute().data
    ) or []
    return [{"name": r["name"], "stat": r["primary_stat"]} for r in rows]


def run_reminders(now: datetime | None = None) -> dict:
    s = get_settings()
    admin = admin_client()
    now = now or datetime.now(timezone.utc)
    emails = _email_map(admin)
    profiles = (
        admin.table("profile").select(
            "user_id, username, timezone, email_send_hour_local, reset_hour_local, email_enabled, email_target"
        ).execute().data
    ) or []

    daily_sent = weekly_sent = skipped = 0
    errors: list[str] = []

    for p in profiles:
        due = reminder_due(
            now=now, timezone=p["timezone"], send_hour=p["email_send_hour_local"],
            reset_hour=p["reset_hour_local"], email_enabled=p["email_enabled"],
        )
        if not due.daily and not due.weekly:
            skipped += 1
            continue
        recipient = p.get("email_target") or emails.get(p["user_id"])
        if not recipient:
            skipped += 1
            continue
        username = p.get("username") or "Hunter"

        for kind in (k for k in ("daily", "weekly") if getattr(due, k)):
            if _already_sent(admin, p["user_id"], due.local_date, kind):
                skipped += 1
                continue
            status, error = "sent", None
            try:
                if kind == "daily":
                    html = morning_email_html(
                        username=username, tasks=_daily_tasks(admin, p["user_id"], due.week_start), app_url=s.app_url
                    )
                    subject = f"Good morning, {username} — today's run"
                else:
                    html = weekly_email_html(username=username, app_url=s.app_url)
                    subject = "Plan your week on DayMaxing"
                send_email(to=recipient, subject=subject, html=html)
            except Exception as exc:  # noqa: BLE001
                status, error = "failed", str(exc)
                errors.append(f"{kind}:{p['user_id']}:{error}")
            else:
                if kind == "daily":
                    daily_sent += 1
                else:
                    weekly_sent += 1
            admin.table("email_log").insert({
                "user_id": p["user_id"], "quest_date": due.local_date,
                "kind": kind, "status": status, "error": error,
            }).execute()

    return {"dailySent": daily_sent, "weeklySent": weekly_sent, "skipped": skipped, "errors": errors}
```

- [ ] **Step 2: Import check**

Run: `cd api && python3 -c "from app.cron_service import run_reminders; print('ok')"`
Expected: `ok`

---

### Task 5: Protected cron endpoint

**Files:**
- Modify: `api/app/main.py`

- [ ] **Step 1: Add the endpoint** (append after the `/health` route)

```python
from fastapi import Header, HTTPException

@app.post("/internal/cron/reminders")
def cron_reminders(authorization: str | None = Header(default=None)):
    from .cron_service import run_reminders
    secret = _settings.cron_secret
    if not secret or authorization != f"Bearer {secret}":
        raise HTTPException(status_code=401, detail="Unauthorized")
    return run_reminders()
```

- [ ] **Step 2: Import check + boot**

Run: `cd api && python3 -c "from app.main import app; print([r.path for r in app.routes if 'cron' in getattr(r,'path','')])"`
Expected: `['/internal/cron/reminders']`

---

### Task 6: Schedule the cron via GitHub Actions

**Files:**
- Create: `.github/workflows/reminders-cron.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: Email reminders (hourly)
on:
  schedule:
    - cron: "0 * * * *"   # top of every hour (UTC)
  workflow_dispatch: {}
jobs:
  trigger:
    runs-on: ubuntu-latest
    steps:
      - name: Hit the reminders endpoint
        run: |
          curl -fsS -X POST "$API_URL/internal/cron/reminders" \
            -H "Authorization: Bearer $CRON_SECRET"
        env:
          API_URL: ${{ secrets.API_URL }}
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
```

Note: set repo secrets `API_URL` (the Fly URL) and `CRON_SECRET` (same value as on Fly).

---

### Task 7: Remove the Next.js cron + dead email code

**Files:**
- Delete: `app/api/cron/reminders/route.ts`
- Delete: `lib/email/templates.tsx`, `lib/email/send.ts`, `lib/email/due.ts`, `lib/email/due.test.ts`
- Modify: `vercel.json` (remove the cron block)
- Modify: `package.json` (remove `resend`, `react-email`, `@react-email/components` from deps)

- [ ] **Step 1: Confirm nothing else imports lib/email**

Run: `grep -rn "lib/email" app components hooks lib --include=*.ts --include=*.tsx | grep -v "lib/email/"`
Expected: no output (only intra-folder refs, which are being deleted)

- [ ] **Step 2: Delete the files** (listed above)

- [ ] **Step 3: Set `vercel.json` to**:
```json
{}
```

- [ ] **Step 4: Remove the three email deps from package.json dependencies, then verify build**

Run: `npm install && npm run build`
Expected: build succeeds (no missing-module errors)

---

### Task 8: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: CI
on:
  pull_request: {}
  push:
    branches: [main]
jobs:
  api:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: api } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install -r requirements.txt
      - run: python -m pytest -q
  web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npm run build
        env:
          NEXT_PUBLIC_SUPABASE_URL: https://example.supabase.co
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ci-dummy
          NEXT_PUBLIC_API_URL: https://example.fly.dev
```

---

### Task 9: Sentry error tracking (env-gated)

**Files:**
- Modify: `api/app/main.py`

- [ ] **Step 1: Initialize Sentry before app creation** (only if DSN set)

```python
if _settings_dsn := get_settings().sentry_dsn:
    import sentry_sdk
    sentry_sdk.init(dsn=_settings_dsn, traces_sample_rate=0.1)
```
Place this near the top after `_settings = get_settings()` (using `_settings.sentry_dsn`).

- [ ] **Step 2: Boot check**

Run: `cd api && python3 -c "from app.main import app; print('ok')"`
Expected: `ok` (no DSN in env → Sentry stays off)

---

### Task 10: Verify the Docker image builds and boots

- [ ] **Step 1: Ensure Docker daemon is running** (start Docker Desktop if needed: `open -a Docker`, wait ~20s)

- [ ] **Step 2: Build**

Run: `cd api && docker build -t sll-api:test .`
Expected: build completes, image created.

- [ ] **Step 3: Boot smoke test** (no secrets needed for /health)

Run:
```bash
docker run -d -p 8090:8080 --name sll-api-test \
  -e SUPABASE_URL=https://example.supabase.co -e SUPABASE_ANON_KEY=x sll-api:test
sleep 4 && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8090/health
docker rm -f sll-api-test
```
Expected: `200`

---

### Task 11: Production runbook

**Files:**
- Create: `api/DEPLOY.md`

- [ ] **Step 1: Write the runbook** consolidating: apply migration 0007 (SQL editor), `fly launch`/`fly secrets set` (SUPABASE_URL/ANON/SERVICE_ROLE_KEY/CORS_ORIGINS/RESEND_API_KEY/EMAIL_FROM/APP_URL/CRON_SECRET/SENTRY_DSN), `fly deploy`, set Vercel envs (NEXT_PUBLIC_API_URL), set GitHub repo secrets (API_URL, CRON_SECRET), upgrade Supabase tier, smoke-test checklist.

---

### Task 12: Security review

- [ ] **Step 1: Run the `/security-review` skill** against the API auth, secret handling, RLS usage, and the cron endpoint. Apply any critical findings.

---

## Self-Review

- **Spec coverage:** email cron port (T1-7), CI (T8), error tracking (T9), Docker verify (T10), runbook (T11), security (T12) — all blockers/hardening from the prod-readiness assessment are covered except the items only the user can do (apply migration, fly auth/deploy, Supabase upgrade), which are captured in the runbook (T11).
- **Placeholder scan:** all code steps contain full code; no TBDs.
- **Type consistency:** `reminder_due` returns `DueResult` with `.daily/.weekly/.local_date/.week_start`, used consistently in `cron_service`. `morning_email_html`/`weekly_email_html` signatures match their callers.
