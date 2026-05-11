-- Reference seed for Hassan's starter quest template.
-- Apply via Supabase SQL Editor AFTER first login when the profile row exists.
-- Replace :user_id with your actual auth.users uuid.
-- The app also has a one-click "Load defaults" button on the template editor (Task 13).
insert into quest_template (user_id, name, completion_type, target_value, primary_stat, base_xp, sort_order)
values
  (:user_id, 'Push-ups', 'count', 100, 'STR', 50, 1),
  (:user_id, 'Sit-ups', 'count', 100, 'STR', 50, 2),
  (:user_id, 'Squats', 'count', 100, 'STR', 50, 3),
  (:user_id, 'Run', 'count', 5, 'VIT', 75, 4),
  (:user_id, 'Study', 'timer', 90, 'INT', 75, 5),
  (:user_id, 'Read', 'timer', 30, 'INT', 25, 6);
