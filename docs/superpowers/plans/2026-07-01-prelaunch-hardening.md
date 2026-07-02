# Pre-Launch Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the multi-user launch blockers found in the 2026-07-01 review: forgeable leaderboard stats / email abuse, email-cron failure modes, invite-funnel error handling, and repo hygiene.

**Architecture:** DB-level column grants make stat columns unwritable by browser clients; the FastAPI service switches those specific writes to the service-role (admin) client while keeping every other query on the RLS-scoped user client. Cron becomes per-user fault-isolated with claim-then-send dedupe. Frontend gains error/loading boundaries and failure states on the three funnel pages.

**Tech Stack:** Postgres (Supabase) SQL migrations, FastAPI + supabase-py, pytest, Next.js 16 App Router, vitest.

**Spec:** `docs/superpowers/specs/2026-07-01-social-guilds-design.md` (Part 1)

**Repo root:** `/Users/hassankhanafer/Desktop/Hassans Brain/Projects/Solo Leveling Life` — all paths below relative to it. Python tests: `cd api && python3 -m pytest` (a `.venv` exists in `api/`; activate it if present). Web tests: `npx vitest run` at root.

**Verified baseline (2026-07-01):** api 83/83 pytest, web 86/86 vitest, `tsc --noEmit` clean, `next build` succeeds. HEAD = `eba50ff`; the whole `api/` directory and the demo feature exist only in the git index / working tree, not in HEAD.

---

### Task 1: Git hygiene + baseline commit

The index currently stages the entire Python API + workflows, including 26 `.pyc` files. Untracked files (`lib/api/contract.ts`, `lib/demo/`, `app/demo/`, `components/demo/`, `app/terms/`, `LICENSE`, two older spec/plan docs) are referenced by staged/modified files — committing without them breaks CI.

**Files:**
- Modify: `.gitignore`
- Stage: all untracked app code; Unstage: `**/__pycache__/**`

- [ ] **Step 1: Fix .gitignore**

Append to `.gitignore`:

```
__pycache__/
*.py[cod]
.venv/
.pytest_cache/
```

- [ ] **Step 2: Unstage bytecode, stage everything else**

```bash
git rm -r --cached api/app/__pycache__ api/app/email/__pycache__ api/app/logic/__pycache__ api/tests/__pycache__
git add -A
git status --porcelain | grep -E '\.pyc|__pycache__' ; echo "exit=$? (expect exit=1, no matches)"
```

- [ ] **Step 3: Verify the tree is CI-green before committing**

```bash
cd api && python3 -m pytest -q && cd ..
npx vitest run && npx tsc --noEmit
```
Expected: 83 passed / 86 passed / no tsc output.

- [ ] **Step 4: Commit baseline**

```bash
git commit -m "feat(api): python API port, email cron, demo mode, CI + deploy infra

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Migration 0008 — lock stat columns, username CHECK, function grants

**Files:**
- Create: `supabase/migrations/0008_hardening.sql`

No automated DB test exists (migrations are applied by hand in the Supabase dashboard); verification is the SQL smoke queries at the bottom of the file plus the service-layer changes in Task 5 that this migration forces.

- [ ] **Step 1: Write the migration**

```sql
-- 0008: pre-launch hardening — lock XP/stat columns from direct client writes,
-- enforce username format, tighten function + insert grants.
--
-- Context: the anon key + a user's JWT allow direct PostgREST writes. RLS
-- scopes rows to the owner, but "profile_self_update" allowed ALL columns —
-- so any user could forge total_xp/level (leaderboard) or point email_target
-- at a stranger. Column-level grants fix this; the API writes locked columns
-- via the service-role client (which bypasses grants + RLS) from 0008 on.

-- profile: clients may update only genuinely user-editable columns.
revoke update on table public.profile from authenticated, anon;
grant update (username, timezone, email_send_hour_local, email_enabled,
              reset_hour_local, leaderboard_opt_in)
  on public.profile to authenticated;

-- Clients never legitimately INSERT profile rows (the signup trigger does,
-- as owner). Remove the policy + grant so forged initial stats are impossible.
drop policy if exists "profile_self_insert" on public.profile;
revoke insert on table public.profile from authenticated, anon;

-- quest_instance: everything the API's user-scoped client writes EXCEPT
-- xp_awarded (moves to the admin client in the API).
revoke update on table public.quest_instance from authenticated, anon;
grant update (name, completion_type, target_value, actual_value, primary_stat,
              base_xp, is_required, is_penalty, completed, completed_at,
              timer_started_at)
  on public.quest_instance to authenticated;

-- weekly_quest_instance: same treatment.
revoke update on table public.weekly_quest_instance from authenticated, anon;
grant update (name, completion_type, target_value, actual_value, primary_stat,
              base_xp, completed, completed_at)
  on public.weekly_quest_instance to authenticated;

-- daily_log: the only API update is status/cleared_at (streak integrity) —
-- that moves to the admin client. Clients keep insert (day upsert) + select.
revoke update on table public.daily_log from authenticated, anon;

-- level_up_event: server-side writes only.
drop policy if exists "level_up_event_self_insert" on public.level_up_event;
revoke insert on table public.level_up_event from authenticated, anon;

-- Username format at the DB level (was Python-only; clients can write the
-- column directly). Existing rows were set through the API so they conform.
alter table public.profile
  add constraint profile_username_format
  check (username is null or username ~ '^[A-Za-z0-9_]{3,20}$');

-- Leaderboard function: created with default PUBLIC execute; restrict.
revoke execute on function public.get_leaderboard() from public, anon;

-- Cron claim-then-send (see api/app/cron_service.py) needs a 'pending' state.
alter type email_status add value if not exists 'pending';

-- ---- smoke checks (run after applying; each should error or return 0) ----
-- 1. As an authenticated user via PostgREST:
--    PATCH /rest/v1/profile?user_id=eq.<self> {"total_xp": 999999} -> 403/permission denied
-- 2. select count(*) from information_schema.check_constraints
--      where constraint_name = 'profile_username_format';  -- expect 1
-- 3. set role anon; select public.get_leaderboard();  -- expect permission denied
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0008_hardening.sql
git commit -m "feat(db): 0008 hardening — lock stat columns, username CHECK, grant tightening

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

**Accepted v1 risks (documented, not fixed here):** clients can still INSERT `quest_instance` rows with arbitrary `xp_awarded`, and can inflate `base_xp` (affects partial-XP on instances). Neither reaches `profile.total_xp` (the leaderboard metric) — `complete_quest` awards `category_xp()`, not row values. It can inflate duel scores; acceptable at friends scale, revisit if cheating appears.

---

### Task 3: Pydantic input caps

**Files:**
- Modify: `api/app/schemas.py:86-108`
- Test: `api/tests/test_schemas.py` (new)

- [ ] **Step 1: Write the failing test**

Create `api/tests/test_schemas.py`:

```python
import pytest
from pydantic import ValidationError

from app.schemas import PlanRowInput, PlanWeekBody, SetProgressBody, SetUsernameBody


def _row(name="Run", sort=0):
    return PlanRowInput(
        id=None, name=name, completion_type="checkbox", target_value=None,
        primary_stat="STR", is_required=True, cadence="daily", sort_order=sort,
    )


def test_plan_rejects_more_than_50_rows():
    rows = [_row(sort=i) for i in range(51)]
    with pytest.raises(ValidationError):
        PlanWeekBody(rows=rows)


def test_plan_row_rejects_absurd_name_and_target():
    with pytest.raises(ValidationError):
        _row(name="x" * 81)
    with pytest.raises(ValidationError):
        PlanRowInput(id=None, name="Run", completion_type="count",
                     target_value=10_000_001, primary_stat="STR",
                     is_required=True, cadence="daily", sort_order=0)


def test_progress_value_capped():
    with pytest.raises(ValidationError):
        SetProgressBody(actualValue=10_000_001)
    assert SetProgressBody(actualValue=-5).actualValue == -5  # clamped later by service


def test_username_length_capped():
    with pytest.raises(ValidationError):
        SetUsernameBody(username="x" * 65)
```

- [ ] **Step 2: Run to verify failure**

Run: `cd api && python3 -m pytest tests/test_schemas.py -q`
Expected: FAIL (ValidationError not raised — no constraints yet).

- [ ] **Step 3: Implement**

In `api/app/schemas.py`, change the import line and the request models:

```python
from pydantic import BaseModel, Field
```

```python
# ---------- requests ----------
class SetUsernameBody(BaseModel):
    username: str = Field(max_length=64)  # real rule (3–20) enforced in service + DB


class SetProgressBody(BaseModel):
    # Negative values are clamped to 0 by the service (existing behaviour);
    # the cap guards the int4 column and absurd payloads.
    actualValue: int = Field(ge=-1_000_000, le=10_000_000)


class PlanRowInput(BaseModel):
    """Identical to PlanRowInput in lib/tracker/plan-reconcile.ts (snake_case)."""

    id: Optional[str]
    name: str = Field(min_length=1, max_length=80)
    completion_type: CompletionType
    target_value: Optional[int] = Field(default=None, ge=0, le=10_000_000)
    primary_stat: StatKind
    is_required: bool
    cadence: Cadence
    sort_order: int = Field(ge=0, le=500)


class PlanWeekBody(BaseModel):
    rows: list[PlanRowInput] = Field(max_length=50)
```

- [ ] **Step 4: Run tests**

Run: `cd api && python3 -m pytest tests/test_schemas.py -q` → PASS, then the full suite `python3 -m pytest -q` → 87 passed (83 + 4).

- [ ] **Step 5: Commit**

```bash
git add api/app/schemas.py api/tests/test_schemas.py
git commit -m "feat(api): cap plan/progress/username input sizes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Rate-limit key — trust Fly-Client-IP, not spoofable XFF

**Files:**
- Modify: `api/app/main.py:63-70`

Fly sets `Fly-Client-IP` on inbound requests and clients cannot forge it; the leftmost `X-Forwarded-For` hop is attacker-controlled (Fly *appends* to whatever the client sends).

- [ ] **Step 1: Replace `_client_key`**

```python
# --- Rate limiting -------------------------------------------------------
def _client_key(request: Request) -> str:
    # On Fly, Fly-Client-IP is set by the edge proxy and can't be spoofed.
    # X-Forwarded-For is appended-to (leftmost hop is client-controlled), so
    # it is only a last resort for non-Fly deployments behind one proxy.
    fly_ip = request.headers.get("fly-client-ip")
    if fly_ip:
        return fly_ip.strip()
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return get_remote_address(request)
```

- [ ] **Step 2: Verify + commit**

Run: `cd api && python3 -m pytest -q` → 87 passed.

```bash
git add api/app/main.py
git commit -m "fix(api): rate-limit on Fly-Client-IP instead of spoofable XFF hop

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: TrackerService — locked-column writes via admin client

After 0008, the user-scoped (RLS) client can no longer update `profile` stat columns, `quest_instance.xp_awarded`, `weekly_quest_instance.xp_awarded`, `daily_log.status`, or insert `level_up_event`. Those exact writes switch to the service-role client. **Every switched write keeps its explicit `.eq("user_id", uid)` filter** — the admin client bypasses RLS, so the filter is the only row scoping.

**Files:**
- Modify: `api/app/tracker_service.py` (constructor + 6 write sites)
- Modify: `api/app/main.py:86-87` (`_svc`)

There is no DB-backed test harness (all 87 tests are pure logic); correctness is enforced by the full-suite run + the live smoke test at deploy. Keep the diff mechanical: same statements, different client.

- [ ] **Step 1: Constructor takes the admin client**

`api/app/tracker_service.py` — replace the class opening:

```python
class TrackerService:
    def __init__(self, client: Client, user_id: str, admin: Client | None = None):
        self.db = client          # RLS-scoped: reads + unlocked-column writes
        self.uid = user_id
        # Locked-column writes (XP, streaks, level, daily_log.status,
        # level_up_event) — 0008 revoked these from the authenticated role.
        # Lazy import so pure-logic tests never need service credentials.
        if admin is None:
            from .db import admin_client
            admin = admin_client()
        self.adm = admin
```

- [ ] **Step 2: Switch the six write sites**

Each is a mechanical `db.` → `self.adm.` swap on the statement only (reads stay on `db`):

1. `_evaluate_prior_week_levelup` — the `profile` update (`level/xp_in_level/xp_to_next/title`, currently `db.table("profile").update({...`) **and** the `level_up_event` insert → `self.adm.table(...)`.
2. `set_quest_progress` — the `quest_instance` update writing `{"actual_value": actual, "xp_awarded": xp_awarded}` → `self.adm.table("quest_instance")...` (keeps `.eq("id", instance_id).eq("user_id", uid)`).
3. `complete_quest` — both writes: the instance update `{"completed": True, "completed_at": ..., "xp_awarded": xp}` and the profile XP update → `self.adm.`.
4. `uncomplete_quest` — stays on the user client (no locked columns) **but** must now also zero the award, which is a locked column. Replace the method body:

```python
    def uncomplete_quest(self, instance_id: str) -> dict:
        self.db.table("quest_instance").update(
            {"completed": False, "completed_at": None}
        ).eq("id", instance_id).eq("user_id", self.uid).execute()
        return self.get_today_snapshot()
```
   (unchanged — `xp_awarded` was already left stale here pre-0008; keep behaviour identical.)
5. `_maybe_advance_streak` — the `daily_log` update `{"status": "cleared", "cleared_at": ...}` and the `profile` streak update → `self.adm.` (daily_log update keeps `.eq("id", daily_log_id)`; add `.eq("user_id", uid)` to it since admin bypasses RLS):

```python
        self.adm.table("daily_log").update(
            {"status": "cleared", "cleared_at": _now_iso()}
        ).eq("id", daily_log_id).eq("user_id", uid).execute()
        self.adm.table("profile").update(
            {"streak_current": streak.current, "streak_best": streak.best}
        ).eq("user_id", uid).execute()
```
6. `set_weekly_progress` — completed branch only: the weekly instance update (writes `xp_awarded`) and the profile XP update → `self.adm.`. The `else` branch (`actual_value` only) stays on the user client.

- [ ] **Step 3: Wire in main.py**

`api/app/main.py` — extend `_svc` (import at top: `from .db import admin_client`):

```python
def _svc(ctx: AuthContext) -> TrackerService:
    return TrackerService(ctx.client, ctx.user_id, admin=admin_client())
```

- [ ] **Step 4: Verify + commit**

Run: `cd api && python3 -m pytest -q` → 87 passed (no test constructs TrackerService, verified by grep).

```bash
git add api/app/tracker_service.py api/app/main.py
git commit -m "feat(api): locked-column writes via service-role client (pairs with 0008)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Cron hardening — fault isolation, pagination, claim-then-send

**Files:**
- Modify: `api/app/cron_service.py`
- Test: `api/tests/test_cron_service.py` (new)

- [ ] **Step 1: Write the failing tests**

Create `api/tests/test_cron_service.py`:

```python
"""run_reminders orchestration: fault isolation, pagination, claim-then-send.

Uses MagicMock for the admin client — we assert orchestration behaviour
(what got called, what the summary says), not PostgREST internals.
"""
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

import app.cron_service as cron

# 11:00 UTC = 07:00 America/New_York (EDT) — send_hour 7 => daily due.
NOW = datetime(2026, 6, 10, 11, 0, tzinfo=timezone.utc)


def _profile(uid, tz="America/New_York"):
    return {
        "user_id": uid, "username": "hunter_" + uid, "timezone": tz,
        "email_send_hour_local": 7, "reset_hour_local": 4,
        "email_enabled": True, "email_target": None,
    }


def _user(uid, email):
    return SimpleNamespace(id=uid, email=email)


def _admin(profiles, users, claim_wins=True):
    admin = MagicMock()
    admin.auth.admin.list_users.side_effect = [users, []]  # one page, then empty

    def table(name):
        t = MagicMock()
        if name == "profile":
            t.select.return_value.execute.return_value.data = profiles
        elif name == "email_log":
            # claim upsert: .data non-empty => this run won the claim
            t.upsert.return_value.execute.return_value.data = (
                [{"id": "log1"}] if claim_wins else []
            )
        elif name == "week_plan":
            t.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value = None
        return t

    admin.table.side_effect = table
    return admin


def test_bad_timezone_does_not_kill_other_users(monkeypatch):
    sent = []
    monkeypatch.setattr(cron, "send_email", lambda **kw: sent.append(kw["to"]))
    admin = _admin(
        profiles=[_profile("u1", tz="Not/AZone"), _profile("u2")],
        users=[_user("u1", "a@x.com"), _user("u2", "b@x.com")],
    )
    out = cron.run_reminders(now=NOW, admin=admin)
    assert sent == ["b@x.com"]          # u2 still got their email
    assert len(out["errors"]) == 1      # u1 recorded, not raised
    assert "u1" in out["errors"][0]


def test_lost_claim_skips_send(monkeypatch):
    sent = []
    monkeypatch.setattr(cron, "send_email", lambda **kw: sent.append(kw["to"]))
    admin = _admin(
        profiles=[_profile("u1")], users=[_user("u1", "a@x.com")], claim_wins=False,
    )
    out = cron.run_reminders(now=NOW, admin=admin)
    assert sent == []
    assert out["skipped"] >= 1


def test_email_map_paginates(monkeypatch):
    # _email_map requests 1000/page and stops on a short page — a full first
    # page must trigger a second request (the old code silently capped at 50).
    admin = MagicMock()
    page1 = [_user(f"u{i}", f"{i}@x.com") for i in range(1000)]
    page2 = [_user("u1000", "1000@x.com")]
    admin.auth.admin.list_users.side_effect = [page1, page2, []]
    out = cron._email_map(admin)
    assert len(out) == 1001
    assert admin.auth.admin.list_users.call_count == 2


def test_email_target_is_ignored(monkeypatch):
    sent = []
    monkeypatch.setattr(cron, "send_email", lambda **kw: sent.append(kw["to"]))
    p = _profile("u1")
    p["email_target"] = "victim@stranger.com"   # forged via direct DB write
    admin = _admin(profiles=[p], users=[_user("u1", "real@x.com")])
    cron.run_reminders(now=NOW, admin=admin)
    assert sent == ["real@x.com"]
```

- [ ] **Step 2: Run to verify failure**

Run: `cd api && python3 -m pytest tests/test_cron_service.py -q`
Expected: FAIL — `run_reminders()` has no `admin` kwarg; `_email_map` has no pagination; bad tz raises.

- [ ] **Step 3: Rewrite `api/app/cron_service.py`**

Replace `_email_map`, `_already_sent`, and `run_reminders` (keep `_daily_tasks` and the module docstring/imports; `_already_sent` is deleted — the claim replaces it):

```python
def _email_map(admin) -> dict[str, str | None]:
    """All auth users' emails. Paginates — GoTrue defaults to 50/page."""
    out: dict[str, str | None] = {}
    page_num = 1
    while True:
        page = admin.auth.admin.list_users(page=page_num, per_page=1000)
        users = page if isinstance(page, list) else getattr(page, "users", [])
        if not users:
            break
        for u in users:
            out[u.id] = getattr(u, "email", None)
        if len(users) < 1000:
            break
        page_num += 1
    return out


def _claim(admin, user_id: str, local_date: str, kind: str) -> bool:
    """Insert the email_log row BEFORE sending (status='pending').

    The (user_id, quest_date, kind) unique index makes this a race-safe
    claim: if another run already inserted the row, ignore_duplicates makes
    the upsert return no data and we skip. Requires the 'pending' enum value
    from migration 0008.
    """
    res = (
        admin.table("email_log").upsert(
            {"user_id": user_id, "quest_date": local_date, "kind": kind,
             "status": "pending", "error": None},
            on_conflict="user_id,quest_date,kind", ignore_duplicates=True,
        ).execute()
    )
    return bool(res and res.data)


def run_reminders(now: datetime | None = None, admin=None) -> dict:
    s = get_settings()
    admin = admin or admin_client()
    now = now or datetime.now(timezone.utc)
    emails = _email_map(admin)
    profiles = (
        admin.table("profile").select(
            "user_id, username, timezone, email_send_hour_local, "
            "reset_hour_local, email_enabled, email_target"
        ).execute().data
    ) or []

    daily_sent = weekly_sent = skipped = 0
    errors: list[str] = []

    for p in profiles:
        # One user's bad data (e.g. a garbage timezone written directly to the
        # DB) must never break the run for everyone else.
        try:
            due = reminder_due(
                now=now,
                timezone=p["timezone"],
                send_hour=p["email_send_hour_local"],
                reset_hour=p["reset_hour_local"],
                email_enabled=p["email_enabled"],
            )
            if not due.daily and not due.weekly:
                skipped += 1
                continue
            # email_target is client-writable history; only the auth email is
            # verified. Never send anywhere else (spam vector otherwise).
            recipient = emails.get(p["user_id"])
            if not recipient:
                skipped += 1
                continue
            username = p.get("username") or "Hunter"

            for kind in (k for k in ("daily", "weekly") if getattr(due, k)):
                if not _claim(admin, p["user_id"], due.local_date, kind):
                    skipped += 1
                    continue
                status, error = "sent", None
                try:
                    if kind == "daily":
                        html = morning_email_html(
                            username=username,
                            tasks=_daily_tasks(admin, p["user_id"], due.week_start),
                            app_url=s.app_url,
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
                admin.table("email_log").update(
                    {"status": status, "error": error}
                ).eq("user_id", p["user_id"]).eq("quest_date", due.local_date) \
                 .eq("kind", kind).execute()
        except Exception as exc:  # noqa: BLE001
            errors.append(f"user:{p.get('user_id')}:{exc}")

    return {"dailySent": daily_sent, "weeklySent": weekly_sent, "skipped": skipped, "errors": errors}
```

`from .db import admin_client` is already imported at the top of the file (line 13) — no import change needed. Delete the now-unused `_already_sent` function.

- [ ] **Step 4: Run tests**

Run: `cd api && python3 -m pytest tests/test_cron_service.py -q` → 4 passed; full suite → 91 passed.

- [ ] **Step 5: Commit**

```bash
git add api/app/cron_service.py api/tests/test_cron_service.py
git commit -m "fix(cron): per-user fault isolation, user pagination, claim-then-send dedupe

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

**Known trade-off (fine for v1):** a run that crashes between claim and send leaves a `pending` row that suppresses that user's email for the rest of that local day.

---

### Task 7: Error + loading boundaries

**Files:**
- Create: `app/error.tsx`
- Create: `app/loading.tsx`

The root boundaries cover `/` and `/leaderboard` (nested segments without their own boundaries bubble to the nearest parent). This turns Fly cold starts into a themed loading state and API downtime into a retry screen.

- [ ] **Step 1: Create `app/error.tsx`**

```tsx
"use client";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="relative min-h-[100svh] bg-slate-950 text-slate-100 flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <div className="font-mono text-[10px] tracking-[0.4em] uppercase text-purple-300 mb-3">
          DayMaxing
        </div>
        <h1 className="text-3xl font-bold text-white">The gate didn&apos;t open.</h1>
        <p className="mt-3 text-slate-400 text-sm">
          We couldn&apos;t reach the server. It may just be waking up — try again in a
          few seconds.
        </p>
        <button
          onClick={reset}
          className="mt-8 rounded-xl bg-purple-500 px-6 py-3 font-mono text-xs tracking-[0.3em] uppercase text-white hover:bg-purple-400 transition-colors"
        >
          Retry
        </button>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Create `app/loading.tsx`**

```tsx
export default function AppLoading() {
  return (
    <main className="relative min-h-[100svh] bg-slate-950 text-slate-100 flex items-center justify-center px-6">
      <div className="text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-purple-500/30 border-t-purple-400" />
        <p className="mt-6 font-mono text-[10px] tracking-[0.3em] uppercase text-slate-500">
          Summoning your quests…
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Verify + commit**

Run: `npx tsc --noEmit` → clean. Manual check (optional): `npm run dev`, stop the API, load `/` → error screen with Retry instead of a crash.

```bash
git add app/error.tsx app/loading.tsx
git commit -m "feat(web): root error + loading boundaries for cold starts and API downtime

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Welcome page — survive request failure

**Files:**
- Modify: `app/welcome/page.tsx:15-26`

- [ ] **Step 1: Wrap the submit in try/catch**

Replace `handleSubmit`:

```tsx
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await api.setUsername(value);
      if (result.ok) {
        router.push("/");
        return;
      }
      setError(result.error);
    } catch {
      setError("Couldn't reach the server — give it a few seconds and try again.");
    }
    setPending(false);
  }
```

- [ ] **Step 2: Verify + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add app/welcome/page.tsx
git commit -m "fix(web): welcome form no longer hangs on network/API failure

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Login page — surface failed magic-link callbacks

`app/auth/callback/route.ts` already redirects to `/login?error=auth_callback_failed`; the page just never reads it. This is the Gmail-in-app-browser PKCE failure — it will happen to invited friends.

**Files:**
- Modify: `app/login/page.tsx`

- [ ] **Step 1: Read the search param and show a banner**

`useSearchParams` needs a Suspense boundary in a prerendered client page. Restructure: rename the current component to `LoginForm`, add a thin default export.

At the top of `app/login/page.tsx`:

```tsx
"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { Sparkles, Mail, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const callbackFailed = searchParams.get("error") === "auth_callback_failed";
  const [email, setEmail] = useState("");
  // ... rest of the existing component body unchanged
```

Then inside the JSX, directly **above** the `{status !== "sent" && (<form ...` block, add:

```tsx
        {callbackFailed && status === "idle" && (
          <div
            role="alert"
            className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
          >
            That sign-in link didn&apos;t work — links expire and only open in the
            browser that requested them. Enter your email for a fresh one.
          </div>
        )}
```

- [ ] **Step 2: Verify + commit**

Run: `npx tsc --noEmit && npx vitest run` → clean / 86 passed. Manual: open `http://localhost:3000/login?error=auth_callback_failed` → banner shows.

```bash
git add app/login/page.tsx
git commit -m "fix(web): show a helpful banner when the magic-link callback fails

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Sign-out buttons in both shells

`app/auth/signout/route.ts` exists (POST, redirects to `/login`) with zero UI references. Add a small control to each shell header. Both shells receive demo data too — hide it in demo mode via `useIsDemo()`.

**Files:**
- Modify: `components/shells/desktop-experience.tsx` (header actions, ~line 335)
- Modify: `components/shells/mobile-app.tsx` (header actions, ~line 91)

- [ ] **Step 1: Desktop**

In `components/shells/desktop-experience.tsx`: add `LogOut` to the existing `lucide-react` import and `import { useIsDemo } from "@/lib/demo/context";` (check whether the file already imports it — the shells are demo-aware). Inside the header's `<div className="flex items-center gap-2">` (after the Plan Week button, line ~342), insert:

```tsx
          {!isDemo && (
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                data-cursor="hover"
                aria-label="Sign out"
                className="flex items-center rounded-full border border-white/10 bg-slate-950/60 px-3 py-1.5 font-mono text-[10px] tracking-[0.2em] uppercase text-slate-400 hover:bg-white/10 hover:text-slate-200 transition-colors backdrop-blur-xl"
              >
                <LogOut className="h-3 w-3" strokeWidth={2.5} />
              </button>
            </form>
          )}
```

with `const isDemo = useIsDemo();` added beside the component's other hooks.

- [ ] **Step 2: Mobile**

In `components/shells/mobile-app.tsx`: same imports; inside `<div className="flex shrink-0 items-center gap-2">` (after the "Edit tasks" button, ~line 97), insert:

```tsx
            {!isDemo && (
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  aria-label="Sign out"
                  className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-200"
                >
                  <LogOut className="h-5 w-5" strokeWidth={2.25} />
                </button>
              </form>
            )}
```

- [ ] **Step 3: Verify + commit**

Run: `npx tsc --noEmit` → clean. Manual: dashboard shows the icon; `/demo` does not.

```bash
git add components/shells/desktop-experience.tsx components/shells/mobile-app.tsx
git commit -m "feat(web): sign-out buttons in both shells (hidden in demo)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: Demo-aware leaderboard client

`app/leaderboard/leaderboard-client.tsx:7` imports the live `api` directly, so the demo leaderboard renders a real "Leave" button that throws, and its Back link exits the demo.

**Files:**
- Modify: `app/leaderboard/leaderboard-client.tsx`

- [ ] **Step 1: Use the injected api + demo-aware back link**

Replace the import of the live client and the top of the component:

```tsx
import { useTrackerApi, useIsDemo } from "@/lib/demo/context";
```

(remove `import { api } from "@/lib/api/client";`)

```tsx
export function LeaderboardClient({ view: initialView }: { view: LeaderboardView }) {
  const api = useTrackerApi();
  const isDemo = useIsDemo();
  const backHref = isDemo ? "/demo" : "/";
  const [view, setView] = useState<LeaderboardView>(initialView);
```

Change the Back link `href="/"` → `href={backHref}`. The live `/leaderboard` page renders outside any provider, so the context default (live api, `demo: false`) keeps production behaviour identical. Check how `app/demo/leaderboard/page.tsx` renders `LeaderboardClient` — if it does not wrap it in `TrackerApiProvider` with the demo api, wrap it there.

- [ ] **Step 2: Verify + commit**

Run: `npx tsc --noEmit && npx vitest run` → clean / 86 passed. Manual: `/demo/leaderboard` → Leave click updates the demo view without an error toast; Back stays in `/demo`.

```bash
git add app/leaderboard/leaderboard-client.tsx app/demo
git commit -m "fix(web): demo leaderboard uses the demo api and stays inside /demo

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12: Refresh api/.env.example + final green run

**Files:**
- Modify: `api/.env.example`

- [ ] **Step 1: Add the missing vars** (config.py reads all of these)

```
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_ANON_KEY=sb_publishable_xxx
SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxx
CORS_ORIGINS=http://localhost:3000
RATE_LIMIT=300/minute
RESEND_API_KEY=
EMAIL_FROM=DayMaxing <onboarding@resend.dev>
APP_URL=http://localhost:3000
CRON_SECRET=
SENTRY_DSN=
```

- [ ] **Step 2: Full verification**

```bash
cd api && python3 -m pytest -q && cd ..
npx vitest run && npx tsc --noEmit && npx next build
```
Expected: 91 / 86 / clean / build succeeds.

- [ ] **Step 3: Commit**

```bash
git add api/.env.example
git commit -m "chore(api): document all env vars in .env.example

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Plan A done. Continue with `docs/superpowers/plans/2026-07-01-social-guilds.md`.
