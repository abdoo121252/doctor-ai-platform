-- 00012_every_n_hours.sql
-- "Every N hours from a chosen start time" schedule.

-- When N divides 24 the schedule is stored as an enumerated 5-field cron
-- (e.g. start 07:00 every 3h -> "0 1,4,7,10,13,16,19,22 * * *"). When N does
-- NOT divide 24 it can't be expressed in 5-field cron, so we store
-- `interval_hours` + `interval_anchor` and the worker computes the next fire
-- from `last_run_at` + interval.
alter table scheduled_tasks
  add column if not exists interval_hours integer;

alter table scheduled_tasks
  add column if not exists interval_anchor timestamptz;

alter table scheduled_tasks drop constraint if exists scheduled_tasks_schedule_type;
alter table scheduled_tasks
  add constraint scheduled_tasks_schedule_type
    check (schedule_type in ('recurring', 'one_off_dates', 'every_n_hours'));
