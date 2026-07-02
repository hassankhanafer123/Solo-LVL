-- 0008: pre-launch hardening — lock XP/stat columns from direct client writes,
-- enforce username format, tighten function + insert grants.
--
-- Context: the anon key + a user's JWT allow direct PostgREST writes. RLS
-- scopes rows to the owner, but "profile_self_update" allowed ALL columns —
-- so any user could forge total_xp/level (leaderboard) or point email_target
-- at a stranger. Column-level grants fix this; the API writes locked columns
-- via the service-role client (which bypasses grants + RLS) from 0008 on.
--
-- ⚠️ DEPLOY ORDER: apply this migration only alongside (or after) an API build
-- that writes locked columns via the service-role client. Against an older
-- API, Postgres's all-or-nothing column-privilege check makes the combined
-- updates in set_quest_progress / set_weekly_progress fail with
-- "permission denied" (statements mixing granted columns with xp_awarded).

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
-- 4. ALLOW path (as an authenticated user via PostgREST, on your own row):
--    PATCH /rest/v1/quest_instance?id=eq.<own-id> {"actual_value": 1} -> 204
--    PATCH /rest/v1/profile?user_id=eq.<self> {"leaderboard_opt_in": true} -> 204
--    (legit single-column writes must still succeed after the revokes)
