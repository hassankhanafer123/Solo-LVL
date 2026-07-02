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
