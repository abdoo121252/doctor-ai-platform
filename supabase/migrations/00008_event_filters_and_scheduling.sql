-- 00008_event_filters_and_scheduling.sql
-- Event trigger filtering + per-task cron scheduling

-- Detailed filter conditions for an event trigger (e.g. email "from X" or "containing Y").
alter table event_triggers
  add column if not exists filter_rules jsonb not null default '{}'::jsonb;

-- Last time this trigger's provider was polled for matching events.
alter table event_triggers
  add column if not exists last_checked_at timestamptz;

-- Timezone a scheduled task's cron expression is evaluated in.
alter table scheduled_tasks
  add column if not exists timezone text not null default 'UTC';

-- Last time this scheduled task actually ran (guards against double-fire within a minute).
alter table scheduled_tasks
  add column if not exists last_run_at timestamptz;

-- Deduplication ledger: which provider items a trigger has already reacted to.
create table if not exists event_trigger_seen (
  id uuid primary key default gen_random_uuid(),
  trigger_id uuid references event_triggers(id) on delete cascade not null,
  item_id text not null,
  seen_at timestamptz default now(),
  unique (trigger_id, item_id)
);

create index if not exists idx_event_trigger_seen_trigger on event_trigger_seen(trigger_id);

