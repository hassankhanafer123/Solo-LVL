alter table profile enable row level security;
alter table quest_template enable row level security;
alter table daily_log enable row level security;
alter table quest_instance enable row level security;
alter table level_up_event enable row level security;
alter table email_log enable row level security;

-- profile policies
create policy "profile_self_select" on profile for select using (auth.uid() = user_id);
create policy "profile_self_insert" on profile for insert with check (auth.uid() = user_id);
create policy "profile_self_update" on profile for update using (auth.uid() = user_id);

-- quest_template policies
create policy "quest_template_self_all" on quest_template for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- daily_log policies
create policy "daily_log_self_all" on daily_log for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- quest_instance policies
create policy "quest_instance_self_all" on quest_instance for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- level_up_event policies (read + insert only, no updates from client)
create policy "level_up_event_self_select" on level_up_event for select using (auth.uid() = user_id);
create policy "level_up_event_self_insert" on level_up_event for insert with check (auth.uid() = user_id);

-- email_log: clients cannot write; readable for debugging
create policy "email_log_self_select" on email_log for select using (auth.uid() = user_id);
