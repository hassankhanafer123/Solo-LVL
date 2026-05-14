-- Weekly planning: per-week quest_template + weekly DIS quests
-- The user defines their daily tasks PER WEEK; each Monday a fresh week_plan
-- is created and last week's templates are cloned forward. DIS quests run on
-- a weekly cadence with their own log + instance tables.

create type quest_cadence as enum ('daily', 'weekly');

-- week_plan: one row per (user, Monday-week-start). Owns that week's templates.
create table week_plan (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  week_start_date date not null,
  created_at timestamptz not null default now(),
  unique (user_id, week_start_date)
);
create index week_plan_user_date_idx on week_plan(user_id, week_start_date desc);

-- quest_template now belongs to one specific week_plan; carry-forward clones rows.
alter table quest_template
  add column week_plan_id uuid references week_plan on delete cascade,
  add column cadence quest_cadence not null default 'daily';

-- For existing rows (if any) we create a backfill week_plan per user.
-- This is safe to run on an empty DB too — no rows to update.
do $$
declare
  u record;
  wp uuid;
begin
  for u in select distinct user_id from quest_template where week_plan_id is null loop
    insert into week_plan (user_id, week_start_date)
    values (u.user_id, date_trunc('week', now())::date)
    returning id into wp;
    update quest_template set week_plan_id = wp where user_id = u.user_id and week_plan_id is null;
  end loop;
end $$;

alter table quest_template alter column week_plan_id set not null;
create index quest_template_week_plan_idx on quest_template(week_plan_id, sort_order);

-- weekly_log: one per (user, week_start_date)
create table weekly_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  week_start_date date not null,
  status daily_status not null default 'pending',
  cleared_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, week_start_date)
);
create index weekly_log_user_date_idx on weekly_log(user_id, week_start_date desc);

-- weekly_quest_instance: mirrors quest_instance, bound to weekly_log
create table weekly_quest_instance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  weekly_log_id uuid not null references weekly_log on delete cascade,
  template_id uuid references quest_template on delete set null,
  name text not null,
  completion_type completion_type not null,
  target_value int,
  actual_value int not null default 0,
  primary_stat stat_kind not null,
  base_xp int not null check (base_xp >= 0),
  xp_awarded int not null default 0 check (xp_awarded >= 0),
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index weekly_quest_instance_log_idx on weekly_quest_instance(weekly_log_id);
create index weekly_quest_instance_user_completed_idx on weekly_quest_instance(user_id, completed);

-- RLS for new tables
alter table week_plan enable row level security;
alter table weekly_log enable row level security;
alter table weekly_quest_instance enable row level security;

create policy "week_plan_self_all" on week_plan for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "weekly_log_self_all" on weekly_log for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "weekly_quest_instance_self_all" on weekly_quest_instance for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Auto-seed: on new auth.users row, create profile + first week_plan + 8 starter templates
create or replace function handle_new_user() returns trigger
  language plpgsql security definer set search_path = public
as $$
declare
  wp uuid;
  monday date;
begin
  -- Profile (defaults from table definition handle the rest)
  insert into profile (user_id) values (new.id)
  on conflict (user_id) do nothing;

  -- Week start = most recent Monday in UTC. Lib code can re-anchor to the
  -- user's timezone on read; the date itself is just a bucket key.
  monday := (date_trunc('week', now())::date);

  insert into week_plan (user_id, week_start_date)
  values (new.id, monday)
  on conflict (user_id, week_start_date) do nothing
  returning id into wp;

  -- If we hit the conflict path, fetch the existing row
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
