-- 0006: track reminder kind so a daily and a weekly email on the same date
-- don't collide in the dedup key.

alter table email_log add column if not exists kind text not null default 'daily';

-- Replace the old (user_id, quest_date) uniqueness with per-kind uniqueness.
alter table email_log drop constraint if exists email_log_user_id_quest_date_key;
create unique index if not exists email_log_user_date_kind_uidx
  on email_log (user_id, quest_date, kind);
