# Social Guilds v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parties (one guild per user, joined by invite code, max 8), week-long duels between party-mates (loser gets a +50% penalty quest), and a party-scoped activity feed — then deploy the whole stack.

**Architecture:** The party is the social graph. New migration `0009_social.sql` adds four tables with party-scoped RLS reads and **zero client write policies** — all writes go through SECURITY DEFINER RPCs (create/join/leave, called with the user's JWT so `auth.uid()` works) or the API's service-role client (feed events, duels — unforgeable). Duel scores are computed live from existing quest tables, so un-completing a quest honestly lowers the score. A new `SocialService` (`api/app/social_service.py`) owns party/duel/feed logic; `TrackerService` calls into it for feed emission, lazy duel resolution, and penalty application.

**Tech Stack:** Postgres/Supabase, FastAPI + supabase-py, pytest, Next.js 16, TypeScript, vitest.

**Spec:** `docs/superpowers/specs/2026-07-01-social-guilds-design.md` (Part 2 + Part 3)

**Prerequisite:** Plan A (`2026-07-01-prelaunch-hardening.md`) complete — this plan assumes `TrackerService` has `self.adm` and migration 0008 exists.

**Repo root:** `/Users/hassankhanafer/Desktop/Hassans Brain/Projects/Solo Leveling Life`. Python: `cd api && python3 -m pytest -q`. Web: `npx vitest run && npx tsc --noEmit`.

---

### Task 1: Migration 0009 — tables, RLS, RPCs

**Files:**
- Create: `supabase/migrations/0009_social.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 0009: social layer — parties (guilds), duels, activity feed.
--
-- Design: the party IS the social graph. One party per user (unique
-- membership), joined by 6-char invite code, max 8 members. Reads are
-- party-scoped via RLS; clients have NO write access to social tables —
-- membership changes go through SECURITY DEFINER RPCs (run as the user via
-- their JWT) and duels/feed events are written by the API's service role,
-- so feed events and duel state are unforgeable.

-- ---- tables --------------------------------------------------------------
create table party (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 3 and 24
                            and name !~ '[\x00-\x1F\x7F]'),
  code text not null unique,
  created_by uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

create table party_member (
  party_id uuid not null references party on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null default 'member' check (role in ('leader', 'member')),
  joined_at timestamptz not null default now(),
  primary key (party_id, user_id),
  unique (user_id)                      -- one party per user
);

create table duel (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references party on delete cascade,
  challenger_id uuid not null references auth.users on delete cascade,
  opponent_id uuid not null references auth.users on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'declined', 'finished')),
  week_start date,                      -- set on accept (challenger's week)
  ends_at timestamptz,                  -- set on accept
  winner_id uuid references auth.users, -- null until finished; null = draw/void
  penalty_applied boolean not null default false,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  check (challenger_id <> opponent_id)
);
-- one open duel per user pair, regardless of who challenged whom
create unique index duel_open_pair_uidx
  on duel (least(challenger_id, opponent_id), greatest(challenger_id, opponent_id))
  where status in ('pending', 'active');
create index duel_party_idx on duel (party_id, created_at desc);

create table activity_event (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references party on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('quest_complete', 'level_up',
    'weekly_goal_hit', 'member_joined', 'duel_started', 'duel_won')),
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index activity_event_party_idx on activity_event (party_id, created_at desc);

-- duel win count — locked column (0008 revoked client profile updates and
-- granted back only user-editable columns; duel_wins is not among them).
alter table profile add column duel_wins int not null default 0;

-- ---- RLS -------------------------------------------------------------------
alter table party enable row level security;
alter table party_member enable row level security;
alter table duel enable row level security;
alter table activity_event enable row level security;

-- Recursion-safe membership lookup: SECURITY DEFINER bypasses RLS, so
-- policies on party_member can use it without infinite recursion.
create or replace function public.get_my_party_id()
returns uuid
language sql security definer stable
set search_path = public
as $$
  select party_id from party_member where user_id = auth.uid()
$$;
revoke execute on function public.get_my_party_id() from public, anon;
grant execute on function public.get_my_party_id() to authenticated;

create policy party_read on party for select
  using (id = public.get_my_party_id());
create policy party_member_read on party_member for select
  using (party_id = public.get_my_party_id());
create policy duel_read on duel for select
  using (party_id = public.get_my_party_id());
create policy activity_event_read on activity_event for select
  using (party_id = public.get_my_party_id());

-- No client write policies — and belt-and-braces on grants:
revoke insert, update, delete on party, party_member, duel, activity_event
  from authenticated, anon;

-- ---- RPCs ------------------------------------------------------------------
-- Runs as the calling user (their JWT), definer rights for the writes.

create or replace function public.create_party(p_name text)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_party_id uuid;
  v_attempt int := 0;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if exists (select 1 from party_member where user_id = v_uid) then
    raise exception 'already in a party';
  end if;
  loop
    v_attempt := v_attempt + 1;
    -- 6 chars from an unambiguous alphabet (no I/L/O/0/1)
    v_code := (
      select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789',
                               (floor(random() * 31) + 1)::int, 1), '')
      from generate_series(1, 6)
    );
    begin
      insert into party (name, code, created_by)
      values (p_name, v_code, v_uid)
      returning id into v_party_id;
      exit;
    exception when unique_violation then
      if v_attempt >= 5 then raise; end if;
    end;
  end loop;
  insert into party_member (party_id, user_id, role)
  values (v_party_id, v_uid, 'leader');
  return json_build_object('id', v_party_id, 'code', v_code);
end;
$$;

create or replace function public.join_party(p_code text)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_party party%rowtype;
  v_count int;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if exists (select 1 from party_member where user_id = v_uid) then
    raise exception 'already in a party';
  end if;
  select * into v_party from party where code = upper(trim(p_code));
  if not found then
    raise exception 'invalid code';
  end if;
  select count(*) into v_count from party_member where party_id = v_party.id;
  if v_count >= 8 then
    raise exception 'party is full';
  end if;
  insert into party_member (party_id, user_id, role)
  values (v_party.id, v_uid, 'member');
  insert into activity_event (party_id, user_id, kind, payload)
  values (v_party.id, v_uid, 'member_joined', '{}');
  return json_build_object('id', v_party.id, 'code', v_party.code);
end;
$$;

create or replace function public.leave_party()
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_party_id uuid;
  v_role text;
  v_remaining int;
begin
  select party_id, role into v_party_id, v_role
  from party_member where user_id = v_uid;
  if not found then
    return;
  end if;
  -- Void the leaver's open duels in this party: no winner, no penalty.
  update duel
     set status = 'finished', winner_id = null, penalty_applied = true
   where party_id = v_party_id
     and status in ('pending', 'active')
     and (challenger_id = v_uid or opponent_id = v_uid);
  delete from party_member where user_id = v_uid;
  select count(*) into v_remaining from party_member where party_id = v_party_id;
  if v_remaining = 0 then
    delete from party where id = v_party_id;
  elsif v_role = 'leader' then
    update party_member set role = 'leader'
     where party_id = v_party_id
       and user_id = (
         select user_id from party_member
          where party_id = v_party_id
          order by joined_at asc limit 1
       );
  end if;
end;
$$;

revoke execute on function public.create_party(text) from public, anon;
revoke execute on function public.join_party(text) from public, anon;
revoke execute on function public.leave_party() from public, anon;
grant execute on function public.create_party(text) to authenticated;
grant execute on function public.join_party(text) to authenticated;
grant execute on function public.leave_party() to authenticated;

-- ---- smoke checks ----------------------------------------------------------
-- select public.create_party('Shadow Monarchs');       -- as a user: returns code
-- select public.join_party('XXXXXX');                  -- second user
-- insert into activity_event ... as authenticated      -- expect permission denied
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0009_social.sql
git commit -m "feat(db): 0009 social — party, party_member, duel, activity_event + RPCs

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Pure duel logic + tests

**Files:**
- Create: `api/app/logic/social.py`
- Test: `api/tests/test_social_logic.py`

- [ ] **Step 1: Write the failing tests**

Create `api/tests/test_social_logic.py`:

```python
from datetime import datetime, timezone

from app.logic.social import decide_duel_winner, duel_ends_at

NY = "America/New_York"


def test_duel_ends_at_next_monday_reset_hour():
    # Week of Mon 2026-06-08; reset hour 4 → ends Mon 2026-06-15 04:00 EDT
    # = 08:00 UTC (EDT is UTC-4).
    end = duel_ends_at("2026-06-08", NY, 4)
    assert end == datetime(2026, 6, 15, 8, 0, tzinfo=timezone.utc)


def test_duel_ends_at_handles_dst_fall_back():
    # Week of Mon 2026-10-26: DST ends Sun 2026-11-01 (EDT→EST).
    # End = Mon 2026-11-02 04:00 EST = 09:00 UTC (EST is UTC-5).
    end = duel_ends_at("2026-10-26", NY, 4)
    assert end == datetime(2026, 11, 2, 9, 0, tzinfo=timezone.utc)


def test_decide_duel_winner():
    assert decide_duel_winner(120, 80) == "challenger"
    assert decide_duel_winner(80, 120) == "opponent"
    assert decide_duel_winner(100, 100) is None  # draw
```

- [ ] **Step 2: Run to verify failure**

Run: `cd api && python3 -m pytest tests/test_social_logic.py -q`
Expected: FAIL — `app.logic.social` does not exist.

- [ ] **Step 3: Implement `api/app/logic/social.py`**

```python
"""Pure duel logic — no I/O. Scoring queries live in social_service.py."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Literal, Optional
from zoneinfo import ZoneInfo


def duel_ends_at(week_start_iso: str, tz: str, reset_hour: int) -> datetime:
    """A duel over the week starting `week_start_iso` ends when that week
    rolls over: the following Monday at the owner's reset hour, local time,
    expressed in UTC. Mirrors get_current_week_start's reset-hour anchoring.
    """
    next_monday = date.fromisoformat(week_start_iso) + timedelta(days=7)
    local = datetime(
        next_monday.year, next_monday.month, next_monday.day,
        reset_hour, 0, tzinfo=ZoneInfo(tz),
    )
    return local.astimezone(ZoneInfo("UTC"))


def decide_duel_winner(
    challenger_score: int, opponent_score: int
) -> Optional[Literal["challenger", "opponent"]]:
    if challenger_score > opponent_score:
        return "challenger"
    if opponent_score > challenger_score:
        return "opponent"
    return None  # draw
```

- [ ] **Step 4: Run tests** → `pytest tests/test_social_logic.py -q` PASS; full suite still green.

- [ ] **Step 5: Commit**

```bash
git add api/app/logic/social.py api/tests/test_social_logic.py
git commit -m "feat(api): pure duel logic — end-of-week timestamps + winner decision

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Pydantic schemas

**Files:**
- Modify: `api/app/schemas.py`

- [ ] **Step 1: Add response + request models** (append after `SetUsernameResult`, before the requests section; and add the snapshot field)

```python
# ---------- social (party / duels / feed) ----------
class PartyInfo(BaseModel):
    id: str
    name: str
    code: str
    combinedXp: int


class PartyMemberEntry(BaseModel):
    userId: str
    username: Optional[str]
    level: int
    totalXp: int
    weeklyXp: int
    duelWins: int
    isLeader: bool


class FeedEventView(BaseModel):
    id: str
    kind: str
    username: Optional[str]
    payload: dict
    createdAt: str


class DuelEntry(BaseModel):
    id: str
    status: str
    challengerId: str
    opponentId: str
    challengerUsername: Optional[str]
    opponentUsername: Optional[str]
    challengerScore: int
    opponentScore: int
    endsAt: Optional[str]
    winnerId: Optional[str]


class PartyView(BaseModel):
    party: Optional[PartyInfo]
    members: list[PartyMemberEntry]
    feed: list[FeedEventView]
    duels: list[DuelEntry]
    myUserId: str


class PartyActionResult(BaseModel):
    ok: bool
    error: Optional[str] = None
    view: Optional[PartyView] = None


class ActiveDuelSummary(BaseModel):
    id: str
    opponentUsername: Optional[str]
    myScore: int
    opponentScore: int
    endsAt: Optional[str]
```

Add to `TrackerSnapshot` (existing class):

```python
    activeDuel: Optional[ActiveDuelSummary] = None
```
(Note: `ActiveDuelSummary` must be defined before `TrackerSnapshot`, or add `TrackerSnapshot.model_rebuild()` at module bottom — simplest is defining the social block above `TrackerSnapshot`.)

Add request bodies in the requests section:

```python
class CreatePartyBody(BaseModel):
    name: str = Field(min_length=3, max_length=24)


class JoinPartyBody(BaseModel):
    code: str = Field(min_length=4, max_length=12)


class ChallengeBody(BaseModel):
    opponentId: str = Field(max_length=64)
```

- [ ] **Step 2: Verify + commit**

Run: `cd api && python3 -m pytest -q` → green (schemas import cleanly).

```bash
git add api/app/schemas.py
git commit -m "feat(api): party/duel/feed schemas + activeDuel on snapshot

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: SocialService

**Files:**
- Create: `api/app/social_service.py`
- Test: `api/tests/test_social_service.py`

All cross-user reads/writes use the admin client with explicit filters (profile RLS is self-only, so party-mate stats are unreadable through the user client by design). RPC calls (`create/join/leave`) go through the **user** client so `auth.uid()` resolves.

- [ ] **Step 1: Write the failing tests** (pure orchestration bits that don't need a DB)

Create `api/tests/test_social_service.py`:

```python
from unittest.mock import MagicMock

from app.social_service import SocialService, _rpc_error_message


def test_rpc_error_message_maps_known_errors():
    assert _rpc_error_message(Exception("already in a party")) == "You're already in a party."
    assert _rpc_error_message(Exception("party is full")) == "That party is full (max 8)."
    assert _rpc_error_message(Exception("invalid code")) == "No party with that code."
    assert "Could not" in _rpc_error_message(Exception("boom"))


def test_weekly_score_sums_daily_and_weekly_xp():
    svc = SocialService(db=MagicMock(), admin=MagicMock(), uid="u1")
    qi = svc.adm.table.return_value.select.return_value
    qi.eq.return_value.eq.return_value.gte.return_value.lte.return_value.execute.return_value.data = [
        {"xp_awarded": 30}, {"xp_awarded": 20},
    ]
    qi.eq.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
        {"xp_awarded": 25},
    ]
    assert svc.weekly_score("u1", "2026-06-08") == 75
```

- [ ] **Step 2: Run to verify failure** → `pytest tests/test_social_service.py -q` FAIL (module missing).

- [ ] **Step 3: Implement `api/app/social_service.py`**

```python
"""Party / duel / feed operations.

Membership changes run as the USER (SECURITY DEFINER RPCs need auth.uid()).
Everything else — member stats, duels, feed events — uses the admin client
with explicit party/user filters, because profile RLS is self-only and feed
events must be unforgeable (clients have no write grants on social tables).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from supabase import Client

from .logic.quests import build_penalty_instance, pick_penalty_target
from .logic.social import decide_duel_winner, duel_ends_at
from .logic.time_utils import days_of_week, get_current_week_start
from .logic.types import QuestTemplate


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _rpc_error_message(exc: Exception) -> str:
    msg = str(exc)
    if "already in a party" in msg:
        return "You're already in a party."
    if "party is full" in msg:
        return "That party is full (max 8)."
    if "invalid code" in msg:
        return "No party with that code."
    return "Could not update your party — try again."


class SocialService:
    def __init__(self, db: Client | None, admin: Client, uid: str):
        self.db = db      # user-scoped; only needed for the RPC calls
        self.adm = admin
        self.uid = uid

    # ---- membership ------------------------------------------------------
    def my_party_id(self) -> Optional[str]:
        rows = (
            self.adm.table("party_member").select("party_id")
            .eq("user_id", self.uid).execute().data
        ) or []
        return rows[0]["party_id"] if rows else None

    def create_party(self, name: str) -> dict:
        try:
            self.db.rpc("create_party", {"p_name": name}).execute()
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": _rpc_error_message(exc), "view": None}
        return {"ok": True, "error": None, "view": self.get_party_view()}

    def join_party(self, code: str) -> dict:
        try:
            self.db.rpc("join_party", {"p_code": code}).execute()
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": _rpc_error_message(exc), "view": None}
        return {"ok": True, "error": None, "view": self.get_party_view()}

    def leave_party(self) -> dict:
        self.db.rpc("leave_party", {}).execute()
        return self.get_party_view()

    # ---- feed --------------------------------------------------------------
    def emit(self, kind: str, payload: dict, party_id: Optional[str] = None) -> None:
        pid = party_id or self.my_party_id()
        if not pid:
            return
        self.adm.table("activity_event").insert({
            "party_id": pid, "user_id": self.uid, "kind": kind, "payload": payload,
        }).execute()

    def retract_quest_event(self, instance_id: str) -> None:
        pid = self.my_party_id()
        if not pid:
            return
        self.adm.table("activity_event").delete() \
            .eq("party_id", pid).eq("user_id", self.uid) \
            .eq("kind", "quest_complete") \
            .eq("payload->>instanceId", instance_id).execute()

    # ---- scoring -----------------------------------------------------------
    def weekly_score(self, user_id: str, week_start: str) -> int:
        days = days_of_week(week_start)
        daily = (
            self.adm.table("quest_instance")
            .select("xp_awarded, daily_log!inner(quest_date)")
            .eq("user_id", user_id).eq("completed", True)
            .gte("daily_log.quest_date", days[0])
            .lte("daily_log.quest_date", days[-1])
            .execute().data
        ) or []
        weekly = (
            self.adm.table("weekly_quest_instance")
            .select("xp_awarded, weekly_log!inner(week_start_date)")
            .eq("user_id", user_id).eq("completed", True)
            .eq("weekly_log.week_start_date", week_start)
            .execute().data
        ) or []
        return sum(r["xp_awarded"] for r in daily) + sum(r["xp_awarded"] for r in weekly)

    # ---- duels ---------------------------------------------------------------
    def challenge(self, opponent_id: str) -> dict:
        pid = self.my_party_id()
        if not pid:
            return {"ok": False, "error": "Join a party first.", "view": None}
        mate = (
            self.adm.table("party_member").select("user_id")
            .eq("party_id", pid).eq("user_id", opponent_id).execute().data
        )
        if not mate or opponent_id == self.uid:
            return {"ok": False, "error": "You can only duel a party member.", "view": None}
        try:
            self.adm.table("duel").insert({
                "party_id": pid, "challenger_id": self.uid,
                "opponent_id": opponent_id, "status": "pending",
            }).execute()
        except Exception:  # noqa: BLE001 — unique open-pair index
            return {"ok": False, "error": "You already have an open duel with them.", "view": None}
        return {"ok": True, "error": None, "view": self.get_party_view()}

    def accept(self, duel_id: str) -> dict:
        rows = (
            self.adm.table("duel").select("*").eq("id", duel_id)
            .eq("opponent_id", self.uid).eq("status", "pending").execute().data
        ) or []
        if rows:
            d = rows[0]
            ch = (
                self.adm.table("profile").select("timezone, reset_hour_local")
                .eq("user_id", d["challenger_id"]).single().execute().data
            )
            week_start = get_current_week_start(_now(), ch["timezone"], ch["reset_hour_local"])
            ends = duel_ends_at(week_start, ch["timezone"], ch["reset_hour_local"])
            self.adm.table("duel").update({
                "status": "active", "accepted_at": _now().isoformat(),
                "week_start": week_start, "ends_at": ends.isoformat(),
            }).eq("id", duel_id).eq("status", "pending").execute()
            self.emit("duel_started", {"duelId": duel_id}, party_id=d["party_id"])
        return self.get_party_view()

    def decline(self, duel_id: str) -> dict:
        self.adm.table("duel").update({"status": "declined"}) \
            .eq("id", duel_id).eq("opponent_id", self.uid) \
            .eq("status", "pending").execute()
        return self.get_party_view()

    def resolve_expired_duels(self) -> None:
        """Lazy, idempotent resolution — called from snapshot + party reads."""
        expired = (
            self.adm.table("duel").select("*").eq("status", "active")
            .lt("ends_at", _now().isoformat()).execute().data
        ) or []
        for d in expired:
            c_score = self.weekly_score(d["challenger_id"], d["week_start"])
            o_score = self.weekly_score(d["opponent_id"], d["week_start"])
            winner_side = decide_duel_winner(c_score, o_score)
            winner_id = (
                d["challenger_id"] if winner_side == "challenger"
                else d["opponent_id"] if winner_side == "opponent" else None
            )
            updated = (
                self.adm.table("duel").update({
                    "status": "finished", "winner_id": winner_id,
                    # draws/voids need no penalty pass
                    "penalty_applied": winner_id is None,
                }).eq("id", d["id"]).eq("status", "active").execute().data
            )
            if not updated or winner_id is None:
                continue  # another worker resolved it, or a draw
            prof = (
                self.adm.table("profile").select("duel_wins, username")
                .eq("user_id", winner_id).single().execute().data
            )
            self.adm.table("profile").update(
                {"duel_wins": prof["duel_wins"] + 1}
            ).eq("user_id", winner_id).execute()
            self.adm.table("activity_event").insert({
                "party_id": d["party_id"], "user_id": winner_id, "kind": "duel_won",
                "payload": {"duelId": d["id"], "score": max(c_score, o_score),
                            "loserScore": min(c_score, o_score)},
            }).execute()

    def apply_pending_penalty(
        self, daily_log_id: str, templates: list[QuestTemplate]
    ) -> bool:
        """If I lost a finished duel whose penalty hasn't been applied, add one
        +50% penalty quest to today's log. Returns True if one was inserted.
        Called from TrackerService.get_today_snapshot after instances exist.
        """
        rows = (
            self.adm.table("duel").select("id, winner_id")
            .eq("status", "finished").eq("penalty_applied", False)
            .or_(f"challenger_id.eq.{self.uid},opponent_id.eq.{self.uid}")
            .execute().data
        ) or []
        losses = [d for d in rows if d["winner_id"] and d["winner_id"] != self.uid]
        inserted = False
        for d in losses:
            claimed = (
                self.adm.table("duel").update({"penalty_applied": True})
                .eq("id", d["id"]).eq("penalty_applied", False).execute().data
            )
            if not claimed:
                continue
            source = pick_penalty_target(templates)
            if not source:
                continue
            inst = build_penalty_instance(source, daily_log_id, self.uid)
            inst["name"] = inst["name"].replace("(Penalty +50%)", "(Duel Penalty +50%)")
            self.adm.table("quest_instance").insert(inst).execute()
            inserted = True
        return inserted

    # ---- views -----------------------------------------------------------------
    def active_duel_summary(self) -> Optional[dict]:
        self.resolve_expired_duels()
        rows = (
            self.adm.table("duel").select("*").eq("status", "active")
            .or_(f"challenger_id.eq.{self.uid},opponent_id.eq.{self.uid}")
            .limit(1).execute().data
        ) or []
        if not rows:
            return None
        d = rows[0]
        i_am_challenger = d["challenger_id"] == self.uid
        opp_id = d["opponent_id"] if i_am_challenger else d["challenger_id"]
        opp = (
            self.adm.table("profile").select("username")
            .eq("user_id", opp_id).single().execute().data
        )
        my = self.weekly_score(self.uid, d["week_start"])
        their = self.weekly_score(opp_id, d["week_start"])
        return {
            "id": d["id"], "opponentUsername": opp.get("username"),
            "myScore": my, "opponentScore": their, "endsAt": d["ends_at"],
        }

    def get_party_view(self) -> dict:
        pid = self.my_party_id()
        if not pid:
            return {"party": None, "members": [], "feed": [], "duels": [],
                    "myUserId": self.uid}
        self.resolve_expired_duels()

        party = self.adm.table("party").select("*").eq("id", pid).single().execute().data
        member_rows = (
            self.adm.table("party_member").select("user_id, role")
            .eq("party_id", pid).execute().data
        ) or []
        ids = [m["user_id"] for m in member_rows]
        profiles = (
            self.adm.table("profile")
            .select("user_id, username, level, total_xp, duel_wins, timezone, reset_hour_local")
            .in_("user_id", ids).execute().data
        ) or []
        pmap = {p["user_id"]: p for p in profiles}
        roles = {m["user_id"]: m["role"] for m in member_rows}

        members = []
        for uid in ids:
            p = pmap.get(uid) or {}
            week_start = get_current_week_start(
                _now(), p.get("timezone", "America/New_York"),
                p.get("reset_hour_local", 4),
            )
            members.append({
                "userId": uid, "username": p.get("username"),
                "level": p.get("level", 1), "totalXp": int(p.get("total_xp", 0)),
                "weeklyXp": self.weekly_score(uid, week_start),
                "duelWins": p.get("duel_wins", 0),
                "isLeader": roles.get(uid) == "leader",
            })
        members.sort(key=lambda m: m["weeklyXp"], reverse=True)

        events = (
            self.adm.table("activity_event").select("*").eq("party_id", pid)
            .order("created_at", desc=True).limit(50).execute().data
        ) or []
        feed = [{
            "id": e["id"], "kind": e["kind"],
            "username": (pmap.get(e["user_id"]) or {}).get("username"),
            "payload": e["payload"] or {}, "createdAt": e["created_at"],
        } for e in events]

        duel_rows = (
            self.adm.table("duel").select("*").eq("party_id", pid)
            .in_("status", ["pending", "active", "finished"])
            .order("created_at", desc=True).limit(10).execute().data
        ) or []
        duels = []
        for d in duel_rows:
            c_score = o_score = 0
            if d["status"] in ("active", "finished") and d.get("week_start"):
                c_score = self.weekly_score(d["challenger_id"], d["week_start"])
                o_score = self.weekly_score(d["opponent_id"], d["week_start"])
            duels.append({
                "id": d["id"], "status": d["status"],
                "challengerId": d["challenger_id"], "opponentId": d["opponent_id"],
                "challengerUsername": (pmap.get(d["challenger_id"]) or {}).get("username"),
                "opponentUsername": (pmap.get(d["opponent_id"]) or {}).get("username"),
                "challengerScore": c_score, "opponentScore": o_score,
                "endsAt": d.get("ends_at"), "winnerId": d.get("winner_id"),
            })

        combined = sum(m["totalXp"] for m in members)
        return {
            "party": {"id": party["id"], "name": party["name"],
                      "code": party["code"], "combinedXp": combined},
            "members": members, "feed": feed, "duels": duels, "myUserId": self.uid,
        }
```

- [ ] **Step 4: Run tests** → `pytest tests/test_social_service.py -q` PASS; full suite green.

- [ ] **Step 5: Commit**

```bash
git add api/app/social_service.py api/tests/test_social_service.py
git commit -m "feat(api): SocialService — party views, duels, scoring, feed, penalties

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: TrackerService hooks — feed events, duel resolution, penalty, activeDuel

**Files:**
- Modify: `api/app/tracker_service.py`

- [ ] **Step 1: Give TrackerService a SocialService**

In the constructor (after `self.adm = admin` from Plan A):

```python
        from .social_service import SocialService
        self.social = SocialService(db=client, admin=self.adm, uid=user_id)
```

- [ ] **Step 2: Hook the events** — each wrapped so a social failure never breaks tracking:

Add a helper method:

```python
    def _social_safely(self, fn, *args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except Exception:  # noqa: BLE001 — social layer must never break tracking
            return None
```

1. `complete_quest` — after the profile XP update, before `_maybe_advance_streak`:

```python
        self._social_safely(
            self.social.emit, "quest_complete",
            {"name": i["name"], "xp": xp, "instanceId": instance_id},
        )
```

2. `uncomplete_quest` — after the instance update:

```python
        self._social_safely(self.social.retract_quest_event, instance_id)
```

3. `set_weekly_progress` — in the completed branch, after the profile update:

```python
            self._social_safely(
                self.social.emit, "weekly_goal_hit",
                {"name": i["name"], "xp": xp},
            )
```

4. `_evaluate_prior_week_levelup` — inside `if decision.leveled_up:`, after the `level_up_event` insert:

```python
            self._social_safely(
                self.social.emit, "level_up",
                {"toLevel": new_level, "title": new_title},
            )
```

- [ ] **Step 3: Duel penalty + activeDuel in the snapshot**

In `get_today_snapshot`, after the daily instances upsert (right after the `quest_instance` upsert block) add:

```python
        # Duel losses owe a +50% penalty quest, applied on the next day build.
        if self._social_safely(
            self.social.apply_pending_penalty, daily_log["id"], daily_templates
        ):
            pass  # inserted — the read below picks it up
```

And extend the returned dict:

```python
            "activeDuel": self._social_safely(self.social.active_duel_summary),
```

- [ ] **Step 4: Verify + commit**

Run: `cd api && python3 -m pytest -q` → green.

```bash
git add api/app/tracker_service.py
git commit -m "feat(api): feed events, duel penalties + activeDuel wired into tracker flow

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

**Note:** `active_duel_summary` adds a few admin queries per snapshot. Fine at friends scale; if it shows up in latency, cache party membership on the service instance (one lookup per request already, via `my_party_id`).

---

### Task 6: API routes

**Files:**
- Modify: `api/app/main.py`

- [ ] **Step 1: Add imports + service factory + routes**

Extend the schemas import with: `ChallengeBody, CreatePartyBody, JoinPartyBody, PartyActionResult, PartyView`. Below `_svc`, add:

```python
def _social(ctx: AuthContext) -> "SocialService":
    from .social_service import SocialService
    return SocialService(db=ctx.client, admin=admin_client(), uid=ctx.user_id)
```

Routes (after the leaderboard routes):

```python
@app.get("/api/party", response_model=PartyView)
def get_party(ctx: AuthContext = Depends(require_user)):
    return _social(ctx).get_party_view()


@app.post("/api/party", response_model=PartyActionResult)
def create_party(body: CreatePartyBody, ctx: AuthContext = Depends(require_user)):
    return _social(ctx).create_party(body.name.strip())


@app.post("/api/party/join", response_model=PartyActionResult)
def join_party(body: JoinPartyBody, ctx: AuthContext = Depends(require_user)):
    return _social(ctx).join_party(body.code)


@app.post("/api/party/leave", response_model=PartyView)
def leave_party(ctx: AuthContext = Depends(require_user)):
    return _social(ctx).leave_party()


@app.post("/api/duels", response_model=PartyActionResult)
def challenge_duel(body: ChallengeBody, ctx: AuthContext = Depends(require_user)):
    return _social(ctx).challenge(body.opponentId)


@app.post("/api/duels/{duel_id}/accept", response_model=PartyView)
def accept_duel(duel_id: str, ctx: AuthContext = Depends(require_user)):
    return _social(ctx).accept(duel_id)


@app.post("/api/duels/{duel_id}/decline", response_model=PartyView)
def decline_duel(duel_id: str, ctx: AuthContext = Depends(require_user)):
    return _social(ctx).decline(duel_id)
```

- [ ] **Step 2: Verify + commit**

Run: `cd api && python3 -m pytest -q` and `python3 -c "from app.main import app; print([r.path for r in app.routes])"` → the seven new paths listed.

```bash
git add api/app/main.py
git commit -m "feat(api): party + duel endpoints

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Frontend API layer — types, contract, clients

**Files:**
- Modify: `lib/api/types.ts`, `lib/api/contract.ts`, `lib/api/client.ts`, `lib/api/server.ts`, `lib/tracker/types.ts`

- [ ] **Step 1: `lib/api/types.ts`** — append:

```ts
export interface PartyInfo {
  id: string;
  name: string;
  code: string;
  combinedXp: number;
}

export interface PartyMemberEntry {
  userId: string;
  username: string | null;
  level: number;
  totalXp: number;
  weeklyXp: number;
  duelWins: number;
  isLeader: boolean;
}

export interface FeedEventView {
  id: string;
  kind:
    | 'quest_complete'
    | 'level_up'
    | 'weekly_goal_hit'
    | 'member_joined'
    | 'duel_started'
    | 'duel_won';
  username: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface DuelEntry {
  id: string;
  status: 'pending' | 'active' | 'declined' | 'finished';
  challengerId: string;
  opponentId: string;
  challengerUsername: string | null;
  opponentUsername: string | null;
  challengerScore: number;
  opponentScore: number;
  endsAt: string | null;
  winnerId: string | null;
}

export interface PartyView {
  party: PartyInfo | null;
  members: PartyMemberEntry[];
  feed: FeedEventView[];
  duels: DuelEntry[];
  myUserId: string;
}

export type PartyActionResult =
  | { ok: true; error: null; view: PartyView }
  | { ok: false; error: string; view: null };
```

- [ ] **Step 2: `lib/tracker/types.ts`** — add the summary type and extend `TrackerSnapshot`:

```ts
export interface ActiveDuelSummary {
  id: string;
  opponentUsername: string | null;
  myScore: number;
  opponentScore: number;
  endsAt: string | null;
}
```

and on the `TrackerSnapshot` interface add:

```ts
  activeDuel?: ActiveDuelSummary | null;
```

- [ ] **Step 3: `lib/api/contract.ts`** — extend the interface + import:

```ts
import type {
  LeaderboardView,
  PartyActionResult,
  PartyView,
  PlanRowInput,
  SetUsernameResult,
  TrackerSnapshot,
} from '@/lib/api/types';
```

```ts
  getParty(): Promise<PartyView>;
  createParty(name: string): Promise<PartyActionResult>;
  joinParty(code: string): Promise<PartyActionResult>;
  leaveParty(): Promise<PartyView>;
  challengeDuel(opponentId: string): Promise<PartyActionResult>;
  acceptDuel(duelId: string): Promise<PartyView>;
  declineDuel(duelId: string): Promise<PartyView>;
```

- [ ] **Step 4: `lib/api/client.ts`** — implement (inside `export const api`), plus the type imports:

```ts
  getParty: () => request<PartyView>('/api/party'),

  createParty: (name: string) =>
    request<PartyActionResult>('/api/party', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  joinParty: (code: string) =>
    request<PartyActionResult>('/api/party/join', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  leaveParty: () => request<PartyView>('/api/party/leave', { method: 'POST' }),

  challengeDuel: (opponentId: string) =>
    request<PartyActionResult>('/api/duels', {
      method: 'POST',
      body: JSON.stringify({ opponentId }),
    }),

  acceptDuel: (duelId: string) =>
    request<PartyView>(`/api/duels/${duelId}/accept`, { method: 'POST' }),

  declineDuel: (duelId: string) =>
    request<PartyView>(`/api/duels/${duelId}/decline`, { method: 'POST' }),
```

- [ ] **Step 5: `lib/api/server.ts`** — append:

```ts
/** Initial party view. Returns null when there is no session. */
export function getPartyServer(): Promise<PartyView | null> {
  return getJson<PartyView>('/api/party');
}
```
(and add `PartyView` to the type import.)

- [ ] **Step 6: Verify** — `npx tsc --noEmit` **will fail**: `lib/demo/demo-api.ts` implements `TrackerApi` and now misses seven methods. That's expected — Task 8 fixes it. Proceed directly to Task 8 before committing (commit lands there).

---

### Task 8: Demo party

**Files:**
- Create: `lib/demo/party-seed.ts`
- Modify: `lib/demo/demo-api.ts`
- Create: `app/demo/party/page.tsx` (mirror `app/demo/leaderboard/page.tsx` — read it first and copy its provider wiring exactly, swapping in the party client)

- [ ] **Step 1: Create `lib/demo/party-seed.ts`**

```ts
// Static demo party — "Shadow Monarchs". Session-local mutations only.
import type { DuelEntry, FeedEventView, PartyMemberEntry, PartyView } from '@/lib/api/types';

const NOW = Date.now();
const iso = (minsAgo: number) => new Date(NOW - minsAgo * 60_000).toISOString();

export const DEMO_MY_USER_ID = 'demo-me';

const MEMBERS: PartyMemberEntry[] = [
  { userId: 'demo-me', username: 'you_the_hunter', level: 7, totalXp: 4210, weeklyXp: 320, duelWins: 2, isLeader: true },
  { userId: 'demo-jin', username: 'jinwoo', level: 9, totalXp: 6120, weeklyXp: 280, duelWins: 4, isLeader: false },
  { userId: 'demo-cha', username: 'cha_haein', level: 8, totalXp: 5480, weeklyXp: 250, duelWins: 3, isLeader: false },
];

const FEED: FeedEventView[] = [
  { id: 'f1', kind: 'quest_complete', username: 'jinwoo', payload: { name: 'Morning run', xp: 30 }, createdAt: iso(12) },
  { id: 'f2', kind: 'duel_started', username: 'you_the_hunter', payload: {}, createdAt: iso(60) },
  { id: 'f3', kind: 'level_up', username: 'cha_haein', payload: { toLevel: 8, title: 'Elite Hunter' }, createdAt: iso(200) },
  { id: 'f4', kind: 'member_joined', username: 'cha_haein', payload: {}, createdAt: iso(2000) },
];

const DUELS: DuelEntry[] = [
  {
    id: 'd1', status: 'active', challengerId: 'demo-me', opponentId: 'demo-jin',
    challengerUsername: 'you_the_hunter', opponentUsername: 'jinwoo',
    challengerScore: 320, opponentScore: 280,
    endsAt: new Date(NOW + 2 * 86_400_000).toISOString(), winnerId: null,
  },
];

export function buildDemoParty(): PartyView {
  return {
    party: { id: 'demo-party', name: 'Shadow Monarchs', code: 'DEMO42', combinedXp: 15810 },
    members: [...MEMBERS], feed: [...FEED], duels: [...DUELS],
    myUserId: DEMO_MY_USER_ID,
  };
}
```

- [ ] **Step 2: Implement the seven methods in `lib/demo/demo-api.ts`**

Keep a module-level `let demoParty = buildDemoParty();` and implement against it (import `buildDemoParty`; follow the file's existing style — e.g. it resolves promises directly):

```ts
  getParty: async () => demoParty,

  createParty: async (name: string) => {
    demoParty = { ...buildDemoParty(), party: { ...buildDemoParty().party!, name } };
    return { ok: true as const, error: null, view: demoParty };
  },

  joinParty: async () => ({ ok: true as const, error: null, view: demoParty }),

  leaveParty: async () => {
    demoParty = { party: null, members: [], feed: [], duels: [], myUserId: 'demo-me' };
    return demoParty;
  },

  challengeDuel: async (opponentId: string) => {
    const opp = demoParty.members.find((m) => m.userId === opponentId);
    const duel = {
      id: `d-${Date.now()}`, status: 'pending' as const,
      challengerId: 'demo-me', opponentId,
      challengerUsername: 'you_the_hunter', opponentUsername: opp?.username ?? null,
      challengerScore: 0, opponentScore: 0, endsAt: null, winnerId: null,
    };
    demoParty = { ...demoParty, duels: [duel, ...demoParty.duels] };
    return { ok: true as const, error: null, view: demoParty };
  },

  acceptDuel: async () => demoParty,
  declineDuel: async (duelId: string) => {
    demoParty = { ...demoParty, duels: demoParty.duels.filter((d) => d.id !== duelId) };
    return demoParty;
  },
```

- [ ] **Step 3: Vitest for the demo behaviour** — add to `lib/demo/demo-api.test.ts` (follow existing test style in that file):

```ts
it('challengeDuel adds a pending duel against a party mate', async () => {
  const before = await demoApi.getParty();
  const mate = before.members.find((m) => m.userId !== before.myUserId)!;
  const res = await demoApi.challengeDuel(mate.userId);
  expect(res.ok).toBe(true);
  expect(res.view!.duels[0].status).toBe('pending');
  expect(res.view!.duels[0].opponentId).toBe(mate.userId);
});
```

- [ ] **Step 4: Verify + commit**

Run: `npx tsc --noEmit && npx vitest run` → clean, all tests pass (contract now fully implemented).

```bash
git add lib/api lib/tracker/types.ts lib/demo
git commit -m "feat(web): party/duel API contract, live client, server client, demo impl

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: /party page

**Files:**
- Create: `app/party/page.tsx`
- Create: `app/party/party-client.tsx`
- Create: `app/demo/party/page.tsx`
- Modify: `lib/supabase/proxy.ts` — confirm `/party` is NOT in the public-path list (it must stay auth-gated; no change expected, verify only)

- [ ] **Step 1: `app/party/page.tsx`** (mirrors `app/leaderboard/page.tsx`)

```tsx
import { redirect } from 'next/navigation';
import { getPartyServer } from '@/lib/api/server';
import { PartyClient } from './party-client';

export default async function PartyPage() {
  const view = await getPartyServer();
  if (!view) {
    redirect('/login');
  }
  return <PartyClient view={view} />;
}
```

- [ ] **Step 2: `app/party/party-client.tsx`** — full component:

```tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Check, Copy, Crown, Shield, Swords, X } from "lucide-react";
import { useTrackerApi, useIsDemo } from "@/lib/demo/context";
import type { DuelEntry, FeedEventView, PartyView } from "@/lib/api/types";

const FEED_LABEL: Record<FeedEventView["kind"], (e: FeedEventView) => string> = {
  quest_complete: (e) => `cleared “${e.payload.name}” (+${e.payload.xp} XP)`,
  level_up: (e) => `reached Level ${e.payload.toLevel} — ${e.payload.title}`,
  weekly_goal_hit: (e) => `hit the weekly goal “${e.payload.name}”`,
  member_joined: () => "joined the party",
  duel_started: () => "started a duel",
  duel_won: () => "won a duel",
};

function timeAgo(isoDate: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - Date.parse(isoDate)) / 60_000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function PartyClient({ view: initialView }: { view: PartyView }) {
  const api = useTrackerApi();
  const isDemo = useIsDemo();
  const backHref = isDemo ? "/demo" : "/";
  const [view, setView] = useState<PartyView>(initialView);
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);

  function act(fn: () => Promise<PartyView>) {
    startTransition(async () => {
      try {
        setView(await fn());
      } catch {
        toast.error("Couldn't reach the server. Try again.");
      }
    });
  }

  function actResult(fn: () => Promise<{ ok: boolean; error: string | null; view: PartyView | null }>) {
    startTransition(async () => {
      try {
        const res = await fn();
        if (res.ok && res.view) setView(res.view);
        else toast.error(res.error ?? "Something went wrong.");
      } catch {
        toast.error("Couldn't reach the server. Try again.");
      }
    });
  }

  const me = view.members.find((m) => m.userId === view.myUserId);
  const pendingForMe = view.duels.filter(
    (d) => d.status === "pending" && d.opponentId === view.myUserId,
  );
  const visibleDuels = view.duels.filter((d) => d.status !== "declined");

  return (
    <main className="relative min-h-[100svh] bg-slate-950 text-slate-100 px-4 py-8 overflow-hidden">
      <div aria-hidden className="absolute inset-0 pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 50% at 50% 20%, rgba(59,130,246,0.12) 0%, transparent 60%)",
          }}
        />
        <div className="grain" />
      </div>

      <div className="relative z-10 w-full max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <Link
            href={backHref}
            className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.3em] uppercase text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ArrowLeft className="h-3 w-3" strokeWidth={2.5} />
            Back
          </Link>
          <div className="font-mono text-[10px] tracking-[0.4em] uppercase text-blue-300">
            DayMaxing
          </div>
        </div>

        {!view.party ? (
          /* ---- no-party state: create or join ---- */
          <div>
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-2">
                <Shield className="h-6 w-6 text-blue-400" strokeWidth={2} />
                <h1 className="text-4xl font-bold text-white">Your Party</h1>
              </div>
              <p className="text-slate-400 text-sm">
                Team up with up to 8 hunters. Duel each other, see each other&apos;s
                progress, climb together.
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-950/60 backdrop-blur-xl p-6 mb-4">
              <h2 className="font-semibold text-white mb-3">Create a party</h2>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Party name (3–24 chars)"
                  value={name}
                  maxLength={24}
                  onChange={(e) => setName(e.target.value)}
                  className="flex-1 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-blue-400 transition-colors"
                />
                <button
                  onClick={() => actResult(() => api.createParty(name.trim()))}
                  disabled={isPending || name.trim().length < 3}
                  className="rounded-xl bg-blue-500 px-5 py-3 font-mono text-xs tracking-[0.2em] uppercase text-white hover:bg-blue-400 transition-colors disabled:opacity-50"
                >
                  Create
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-950/60 backdrop-blur-xl p-6">
              <h2 className="font-semibold text-white mb-3">Join with a code</h2>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="6-char code"
                  value={code}
                  maxLength={6}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="flex-1 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-3 font-mono tracking-[0.3em] text-white placeholder-slate-600 focus:outline-none focus:border-blue-400 transition-colors"
                />
                <button
                  onClick={() => actResult(() => api.joinParty(code.trim()))}
                  disabled={isPending || code.trim().length < 4}
                  className="rounded-xl border border-white/15 bg-white/5 px-5 py-3 font-mono text-xs tracking-[0.2em] uppercase text-slate-200 hover:bg-white/10 transition-colors disabled:opacity-50"
                >
                  Join
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* ---- party state ---- */
          <div>
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-1">
                <Shield className="h-6 w-6 text-blue-400" strokeWidth={2} />
                <h1 className="text-4xl font-bold text-white">{view.party.name}</h1>
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-400">
                <span>
                  {view.members.length}/8 hunters · {view.party.combinedXp.toLocaleString()} combined XP
                </span>
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(view.party!.code);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1 font-mono text-[11px] tracking-[0.25em] text-blue-200 hover:bg-white/10 transition-colors"
                >
                  {view.party.code}
                  {copied ? (
                    <Check className="h-3 w-3 text-emerald-300" strokeWidth={2.5} />
                  ) : (
                    <Copy className="h-3 w-3" strokeWidth={2.5} />
                  )}
                </button>
              </div>
            </div>

            {/* pending challenges against me */}
            {pendingForMe.map((d) => (
              <div
                key={d.id}
                className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2 text-sm text-amber-100">
                  <Swords className="h-4 w-4 text-amber-300" strokeWidth={2.5} />
                  <span>
                    <strong>{d.challengerUsername}</strong> challenged you to a duel
                    (this week&apos;s XP).
                  </span>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => act(() => api.acceptDuel(d.id))}
                    disabled={isPending}
                    className="rounded-lg bg-amber-400 px-3 py-1.5 font-mono text-[10px] tracking-[0.2em] uppercase text-slate-950 hover:bg-amber-300 transition-colors disabled:opacity-50"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => act(() => api.declineDuel(d.id))}
                    disabled={isPending}
                    aria-label="Decline"
                    className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/10 transition-colors disabled:opacity-50"
                  >
                    <X className="h-4 w-4" strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            ))}

            {/* active/finished duels */}
            {visibleDuels
              .filter((d) => d.status === "active")
              .map((d) => (
                <DuelCard key={d.id} duel={d} myUserId={view.myUserId} />
              ))}

            {/* roster, ranked by weekly XP */}
            <h2 className="mt-8 mb-3 font-mono text-[10px] tracking-[0.3em] uppercase text-slate-500">
              This week
            </h2>
            <div className="space-y-2">
              {view.members.map((m, idx) => {
                const isMe = m.userId === view.myUserId;
                const hasOpenDuel = view.duels.some(
                  (d) =>
                    ["pending", "active"].includes(d.status) &&
                    [d.challengerId, d.opponentId].includes(m.userId) &&
                    [d.challengerId, d.opponentId].includes(view.myUserId),
                );
                return (
                  <div
                    key={m.userId}
                    className={
                      isMe
                        ? "rounded-2xl border border-blue-500/50 bg-blue-500/10 backdrop-blur-xl px-4 py-3.5"
                        : "rounded-2xl border border-white/10 bg-slate-950/55 backdrop-blur-xl px-4 py-3.5"
                    }
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-8 shrink-0 text-center">
                        {idx === 0 ? (
                          <Crown className="h-5 w-5 text-yellow-400 mx-auto" strokeWidth={2} />
                        ) : (
                          <span className="font-mono text-sm font-bold tabular-nums text-slate-400">
                            #{idx + 1}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-semibold truncate ${isMe ? "text-blue-200" : "text-white"}`}>
                            {m.username ?? "hunter"}
                          </span>
                          {m.isLeader && (
                            <span className="rounded border border-yellow-500/40 bg-yellow-500/10 px-1.5 py-0.5 font-mono text-[9px] tracking-widest uppercase text-yellow-300">
                              leader
                            </span>
                          )}
                          {isMe && (
                            <span className="rounded border border-blue-500/50 bg-blue-500/20 px-1.5 py-0.5 font-mono text-[9px] tracking-widest uppercase text-blue-300">
                              you
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 font-mono text-[10px] tracking-widest uppercase text-slate-500">
                          Lv {m.level} · {m.duelWins}
                          <Swords className="mx-1 inline h-3 w-3" strokeWidth={2.5} />
                          wins
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center gap-3">
                        <div className="text-right font-mono text-xs tabular-nums">
                          <div className="text-slate-400 text-[10px] tracking-widest uppercase">Week</div>
                          <div className="text-blue-300 font-bold">{m.weeklyXp.toLocaleString()} XP</div>
                        </div>
                        {!isMe && !hasOpenDuel && (
                          <button
                            onClick={() => actResult(() => api.challengeDuel(m.userId))}
                            disabled={isPending}
                            aria-label={`Challenge ${m.username ?? "hunter"}`}
                            className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/40 transition-colors disabled:opacity-50"
                          >
                            <Swords className="h-4 w-4" strokeWidth={2.5} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* feed */}
            <h2 className="mt-8 mb-3 font-mono text-[10px] tracking-[0.3em] uppercase text-slate-500">
              Activity
            </h2>
            {view.feed.length === 0 ? (
              <p className="text-sm text-slate-500">
                Quiet so far — clear a quest and it&apos;ll show up here.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {view.feed.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-baseline gap-2 rounded-xl border border-white/5 bg-slate-950/40 px-3 py-2 text-sm"
                  >
                    <span className="font-semibold text-slate-200">{e.username ?? "hunter"}</span>
                    <span className="text-slate-400 min-w-0 flex-1 truncate">
                      {FEED_LABEL[e.kind]?.(e) ?? e.kind}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-slate-600">
                      {timeAgo(e.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {/* leave */}
            <div className="mt-8 text-center">
              <button
                onClick={() => act(() => api.leaveParty())}
                disabled={isPending}
                className="font-mono text-[10px] tracking-[0.3em] uppercase text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-40"
              >
                {isPending ? "Updating..." : "Leave party"}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function DuelCard({ duel, myUserId }: { duel: DuelEntry; myUserId: string }) {
  const iAmChallenger = duel.challengerId === myUserId;
  const my = iAmChallenger ? duel.challengerScore : duel.opponentScore;
  const their = iAmChallenger ? duel.opponentScore : duel.challengerScore;
  const them = iAmChallenger ? duel.opponentUsername : duel.challengerUsername;
  const total = Math.max(1, my + their);
  const endsIn = duel.endsAt
    ? Math.max(0, Math.ceil((Date.parse(duel.endsAt) - Date.now()) / 86_400_000))
    : null;
  return (
    <div className="mb-4 rounded-2xl border border-red-500/25 bg-red-500/5 backdrop-blur-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.3em] uppercase text-red-300">
          <Swords className="h-3.5 w-3.5" strokeWidth={2.5} />
          Duel vs {them ?? "hunter"}
        </div>
        {endsIn !== null && (
          <span className="font-mono text-[10px] text-slate-500">
            {endsIn === 0 ? "ends today" : `${endsIn}d left`}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between font-mono text-sm tabular-nums mb-1.5">
        <span className="text-blue-300 font-bold">{my} XP you</span>
        <span className="text-slate-300 font-bold">{them ?? "them"} {their} XP</span>
      </div>
      <div className="h-2 rounded-full bg-slate-800 overflow-hidden flex">
        <div className="bg-blue-400 transition-all" style={{ width: `${(my / total) * 100}%` }} />
        <div className="bg-red-400/70 transition-all" style={{ width: `${(their / total) * 100}%` }} />
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        Loser takes a +50% penalty quest. Week&apos;s XP decides it.
      </p>
    </div>
  );
}
```

- [ ] **Step 3: `app/demo/party/page.tsx`** — read `app/demo/leaderboard/page.tsx` first and mirror it exactly (demo provider wrapping), rendering `<PartyClient view={...} />` with the view from the demo api's `getParty()`.

- [ ] **Step 4: Verify + commit**

Run: `npx tsc --noEmit && npx vitest run && npx next build` (build with dummy env like CI). Manual: `npm run dev` → `/demo/party` renders the Shadow Monarchs party.

```bash
git add app/party app/demo/party
git commit -m "feat(web): /party page — create/join, roster, duels, feed (+demo)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Shell integration — party pill + duel banner

**Files:**
- Create: `components/tracker/duel-banner.tsx`
- Modify: `components/shells/desktop-experience.tsx` (~line 327: after the leaderboard `<Link>`)
- Modify: `components/shells/mobile-app.tsx` (~line 84: after the trophy `<Link>`)

- [ ] **Step 1: `components/tracker/duel-banner.tsx`**

```tsx
"use client";

import Link from "next/link";
import { Swords } from "lucide-react";
import type { ActiveDuelSummary } from "@/lib/tracker/types";

export function DuelBanner({
  duel,
  partyHref,
}: {
  duel: ActiveDuelSummary | null | undefined;
  partyHref: string;
}) {
  if (!duel) return null;
  const leading = duel.myScore >= duel.opponentScore;
  return (
    <Link
      href={partyHref}
      className="flex items-center justify-between gap-3 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-2.5 backdrop-blur-xl hover:bg-red-500/15 transition-colors"
    >
      <span className="flex items-center gap-2 font-mono text-[10px] tracking-[0.25em] uppercase text-red-300">
        <Swords className="h-3.5 w-3.5" strokeWidth={2.5} />
        Duel vs {duel.opponentUsername ?? "hunter"}
      </span>
      <span className="font-mono text-xs tabular-nums font-bold">
        <span className={leading ? "text-emerald-300" : "text-slate-300"}>{duel.myScore}</span>
        <span className="text-slate-500"> : </span>
        <span className={!leading ? "text-red-300" : "text-slate-300"}>{duel.opponentScore}</span>
      </span>
    </Link>
  );
}
```

- [ ] **Step 2: Desktop shell** — in `components/shells/desktop-experience.tsx`:
  1. Find where `lbHref` is defined and add beside it: `const partyHref = /* same demo test as lbHref */ ? "/demo/party" : "/party";` (copy the exact conditional `lbHref` uses).
  2. Add `Shield` (or `Users`) to the lucide import; import `DuelBanner`.
  3. After the leaderboard `<Link href={lbHref} ...>...</Link>` (ends line ~334), insert:

```tsx
          <Link
            href={partyHref}
            data-cursor="hover"
            className="flex items-center gap-1.5 rounded-full border border-white/10 bg-slate-950/60 px-3 py-1.5 font-mono text-[10px] tracking-[0.2em] uppercase text-slate-300 hover:bg-white/10 transition-colors backdrop-blur-xl"
          >
            <Shield className="h-3 w-3" strokeWidth={2.5} />
            <span className="hidden sm:inline">Party</span>
          </Link>
```

  4. Immediately after the `</header>` closing tag, render the banner in a positioned wrapper consistent with the header's layout (read the surrounding container; a `max-w` matching wrapper with horizontal padding):

```tsx
      {snapshot.activeDuel && (
        <div className="fixed top-16 left-1/2 z-40 w-full max-w-md -translate-x-1/2 px-4">
          <DuelBanner duel={snapshot.activeDuel} partyHref={partyHref} />
        </div>
      )}
```
  (Adjust `top-16` so it clears the header — check the header's height class when editing. `snapshot` here is whatever prop/variable the shell derives `player` from; read the component signature and use the actual snapshot variable name.)

- [ ] **Step 3: Mobile shell** — in `components/shells/mobile-app.tsx`:
  1. `partyHref` beside `lbHref` (same pattern), `Shield` import, `DuelBanner` import.
  2. After the trophy `<Link>` (ends ~line 90), insert:

```tsx
            <Link
              href={partyHref}
              aria-label="Party"
              className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-200 transition-colors hover:bg-white/10"
            >
              <Shield className="h-5 w-5" strokeWidth={2.25} />
            </Link>
```

  3. Below the header block (find where the main content column starts), insert:

```tsx
        <div className="px-4 pt-2">
          <DuelBanner duel={snapshot.activeDuel} partyHref={partyHref} />
        </div>
```
  (again using the shell's actual snapshot variable name).

- [ ] **Step 4: Verify + commit**

Run: `npx tsc --noEmit && npx vitest run` → clean. Manual: `/demo` shows the party icon in both widths (resize); no banner in demo (demo snapshot has no `activeDuel`).

```bash
git add components/tracker/duel-banner.tsx components/shells
git commit -m "feat(web): party pill + active-duel banner in both shells

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: Full verification + PR

- [ ] **Step 1: Everything green**

```bash
cd api && python3 -m pytest -q && cd ..
npx vitest run && npx tsc --noEmit && npx next build
```

- [ ] **Step 2: Push + PR + merge**

```bash
git push origin feat/email-reminders
gh pr create --title "Harden for launch + social guilds v1 (parties, duels, feed)" --body "$(cat <<'EOF'
## Summary
- Pre-launch hardening: locked stat columns (0008), cron fault isolation + pagination + claim-then-send, funnel error states, input caps, Fly-Client-IP rate limiting
- Social guilds v1 (0009): parties w/ invite codes (max 8), week-long duels (loser gets +50% penalty quest), party activity feed
- /party page + shell integration + demo party

## Deploy notes
Migrations 0006–0009 must be applied in the Supabase SQL editor before deploy (see api/DEPLOY.md).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
# after CI is green:
gh pr merge --squash --delete-branch=false
```

(The reminders cron only fires from `main`, so the merge is a deploy prerequisite.)

---

### Task 12: Deploy (operational — follows api/DEPLOY.md with these deltas)

Ownership: **Hassan** does the Supabase + Vercel dashboard steps; **Claude** runs Fly + GitHub CLI steps (already authenticated).

- [ ] **Step 1 (Hassan): Apply migrations** — Supabase Dashboard → SQL editor, run in order (skip any already applied): `0006_email_kind.sql`, `0007_fix_new_user_week_tz.sql`, `0008_hardening.sql`, `0009_social.sql`. Verify:

```sql
select column_name from information_schema.columns
 where table_name='email_log' and column_name='kind';            -- 1 row
select count(*) from information_schema.check_constraints
 where constraint_name='profile_username_format';                 -- 1
select proname from pg_proc where proname in
 ('create_party','join_party','leave_party','get_my_party_id');   -- 4 rows
```

- [ ] **Step 2 (Claude): Fly deploy**

```bash
cd api
fly launch --no-deploy        # accept/adjust app name in fly.toml
fly secrets set \
  SUPABASE_URL="<from api/.env>" \
  SUPABASE_ANON_KEY="<from api/.env>" \
  SUPABASE_SERVICE_ROLE_KEY="<from api/.env>" \
  CORS_ORIGINS="https://<vercel-domain>" \
  RESEND_API_KEY="" \
  APP_URL="https://<vercel-domain>" \
  CRON_SECRET="$(openssl rand -hex 24)"
fly deploy
curl https://<app>.fly.dev/health    # {"status":"ok"}
```
(Empty `RESEND_API_KEY` = emails off; cron returns skips/errors without sending — per the launch decision.)

- [ ] **Step 3 (Hassan): Vercel** — connect the repo (or `vercel login` + `vercel link`), set env vars `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL=https://<app>.fly.dev`, deploy `main`. Then Supabase Dashboard → Authentication → URL Configuration: add `https://<vercel-domain>/auth/callback` to redirect URLs and set the site URL.

- [ ] **Step 4 (Claude): Cross-wire + cron secrets**

```bash
fly secrets set CORS_ORIGINS="https://<final-vercel-domain>"   # exact origin, no trailing slash
gh secret set API_URL --body "https://<app>.fly.dev"
gh secret set CRON_SECRET --body "<same value as Fly>"
gh workflow run "Email reminders"    # expect JSON counts, all skips, no 500
```

- [ ] **Step 5: Smoke test (two real accounts, one phone)**
  - [ ] Magic link sign-in → welcome → username → dashboard renders
  - [ ] Complete a quest → persists on refresh
  - [ ] Create party → copy code → second account joins with code
  - [ ] Feed shows the join + a quest completion from each side
  - [ ] Challenge → accept on the other account → duel banner shows on both dashboards with live scores
  - [ ] `/leaderboard` join → both appear
  - [ ] Direct PostgREST forge attempt fails: `curl -X PATCH "<SUPABASE_URL>/rest/v1/profile?user_id=eq.<uid>" -H "apikey: <anon>" -H "Authorization: Bearer <user-jwt>" -d '{"total_xp": 999999}'` → permission denied
  - [ ] Supabase free tier: consider upgrading (pauses when idle) — Hassan's call

---

## Self-review notes (spec → plan)

- Spec 1a–1e → Plan A Tasks 2, 6, 7–11, 4/3, 1. Spec 2a → Task 1; 2b → Tasks 2, 4, 5; 2c → Tasks 4, 5; 2d → Tasks 3, 6; 2e → Tasks 7–10. Spec Part 3 → Tasks 11–12. Out-of-scope list untouched. ✓
- Deviation from spec (intentional, simpler): duel score counts the **whole** duel week for both sides even when accepted mid-week — symmetric and computable from existing tables; the spec's "between accept and end" wording is superseded. Recorded here as the source of truth.
- `leave_party` sets `penalty_applied = true` on voided duels so the penalty pass skips them — matches "voided duels apply no penalty".
