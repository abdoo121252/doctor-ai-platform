-- 00011_scheduling_recurrence.sql
-- Support non-cron schedules (one-off dates) and recurring monthly schedules.

-- Recurring tasks keep a cron_expression; one-off tasks store explicit
-- timestamps in `scheduled_task_dates` instead.
alter table scheduled_tasks
  add column if not exists schedule_type text not null default 'recurring';

alter table scheduled_tasks
  add constraint scheduled_tasks_schedule_type
    check (schedule_type in ('recurring', 'one_off_dates'));

-- One-off tasks have no cron expression.
alter table scheduled_tasks
  alter column cron_expression drop not null;

-- Explicit run dates for one-off tasks. `fired_at` is set when the date has
-- been dispatched; a task auto-disables once every date has fired.
create table if not exists scheduled_task_dates (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references scheduled_tasks(id) on delete cascade not null,
  run_at timestamptz not null,
  fired_at timestamptz
);

create index if not exists idx_scheduled_task_dates_task
  on scheduled_task_dates(task_id);

create index if not exists idx_scheduled_task_dates_unfired
  on scheduled_task_dates(task_id, run_at)
  where fired_at is null;

-- RLS: a doctor may only see the dates of their own tasks.
alter table scheduled_task_dates enable row level security;

create policy "scheduled_task_dates_self_access" on scheduled_task_dates
  for all using (
    task_id in (select id from scheduled_tasks where doctor_id = auth.uid())
  );
