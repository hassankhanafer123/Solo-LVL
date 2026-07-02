-- 0007: align new-user week_plan with the app's timezone-based week start.
--
-- BUG: handle_new_user() seeded the first week_plan using `date_trunc('week', now())`
-- in UTC. The app computes the current week with getCurrentWeekStart() in the
-- user's timezone (default America/New_York) anchored to a 4am reset. On Sunday
-- nights in the Americas these disagree by a full week, so a user who signed up
-- then saw the app read a *different* (empty) week_plan and got ZERO quests.
--
-- FIX: seed using the same local-timezone, reset-hour-anchored Monday the app
-- uses. Affects new signups only; existing users are untouched.

create or replace function handle_new_user() returns trigger
  language plpgsql security definer set search_path = public
as $$
declare
  wp uuid;
  monday date;
begin
  insert into profile (user_id) values (new.id)
  on conflict (user_id) do nothing;

  -- Monday of the current week in the profile default timezone, shifted back by
  -- the 4am reset hour, matching lib/time.ts getCurrentWeekStart('America/New_York', 4).
  monday := date_trunc(
    'week',
    (now() at time zone 'America/New_York') - interval '4 hours'
  )::date;

  insert into week_plan (user_id, week_start_date)
  values (new.id, monday)
  on conflict (user_id, week_start_date) do nothing
  returning id into wp;

  if wp is null then
    select id into wp from week_plan where user_id = new.id and week_start_date = monday;
  end if;

  insert into quest_template
    (user_id, week_plan_id, name, completion_type, target_value, primary_stat, base_xp, cadence, sort_order)
  values
    (new.id, wp, 'Study',                'timer',    90,  'INT',  75, 'daily',  1),
    (new.id, wp, 'Read',                 'timer',    30,  'INT',  25, 'daily',  2),
    (new.id, wp, 'Push-ups',             'count',   100,  'STR',  50, 'daily',  3),
    (new.id, wp, 'Sit-ups',              'count',   100,  'STR',  50, 'daily',  4),
    (new.id, wp, 'Squats',               'count',   100,  'STR',  50, 'daily',  5),
    (new.id, wp, 'Run (km)',             'count',     5,  'STR',  75, 'daily',  6),
    (new.id, wp, 'Meditate (min/week)',  'count',    70,  'DIS', 100, 'weekly', 7),
    (new.id, wp, 'No phone after 11pm',  'count',     7,  'DIS',  50, 'weekly', 8);

  return new;
end $$;

-- Trigger definition is unchanged; recreating the function above is enough.
