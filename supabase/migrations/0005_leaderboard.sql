-- 0005: usernames + global leaderboard (opt-in)

-- Username (display identity) + explicit opt-in to appear on the global board.
alter table profile add column if not exists username text;
alter table profile add column if not exists leaderboard_opt_in boolean not null default false;

-- Case-insensitive uniqueness for usernames that are set.
create unique index if not exists profile_username_lower_uidx
  on profile (lower(username))
  where username is not null;

-- Safe read of the global leaderboard. RLS on `profile` is "self only"; this
-- SECURITY DEFINER function deliberately bypasses RLS but exposes ONLY a
-- limited projection (username, level, total_xp, rank) and ONLY for users who
-- opted in and set a username. No emails, stats, or other columns leak.
create or replace function public.get_leaderboard()
returns table (username text, level int, total_xp bigint, rank bigint)
language sql
security definer
set search_path = public
as $$
  select
    p.username,
    p.level,
    p.total_xp,
    row_number() over (order by p.level desc, p.total_xp desc) as rank
  from profile p
  where p.leaderboard_opt_in = true and p.username is not null
  order by p.level desc, p.total_xp desc
  limit 200;
$$;

grant execute on function public.get_leaderboard() to authenticated;
