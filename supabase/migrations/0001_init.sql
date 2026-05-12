-- Enums
create type completion_type as enum ('checkbox', 'count', 'timer');
create type stat_kind as enum ('INT', 'STR', 'DIS');
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
  stat_int int not null default 10,
  stat_str int not null default 10,
  stat_dis int not null default 10,
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
  base_xp int not null check (base_xp >= 0),
  xp_awarded int not null default 0 check (xp_awarded >= 0),
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
