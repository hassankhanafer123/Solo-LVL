-- Template-backed instances must be unique per (log, template). These are plain
-- (non-partial) unique indexes so PostgREST can infer them from upsert onConflict.
-- Penalty rows carry template_id = NULL; Postgres treats NULLs as distinct in a
-- unique index, so multiple penalty rows per log are still allowed, while real
-- template-backed rows stay deduplicated.
create unique index if not exists quest_instance_log_template_uidx
  on quest_instance (daily_log_id, template_id);

create unique index if not exists weekly_quest_instance_log_template_uidx
  on weekly_quest_instance (weekly_log_id, template_id);
