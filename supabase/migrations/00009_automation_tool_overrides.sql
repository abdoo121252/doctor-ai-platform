-- 00009_automation_tool_overrides.sql
-- Per-automation tool sensitivity overrides.
--
-- Each automation (scheduled_task or event_trigger) can override the doctor's
-- general `tool_sensitivity_settings` for individual tools. A row here wins
-- over the general setting; missing rows inherit the general setting.
--
-- `automation_id` is a polymorphic reference (scheduled_tasks.id OR
-- event_triggers.id), so it is a loose uuid without a foreign key. Cleanup on
-- automation delete happens in the API routes.

create table automation_tool_overrides (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid references doctors(id) on delete cascade not null,
  automation_type text not null check (automation_type in ('scheduled_task', 'event_trigger')),
  automation_id uuid not null,
  tool_name text not null,
  sensitive boolean not null,
  updated_at timestamptz default now(),
  unique (doctor_id, automation_type, automation_id, tool_name)
);

create index idx_automation_overrides_lookup
  on automation_tool_overrides (doctor_id, automation_type, automation_id);

alter table automation_tool_overrides enable row level security;

create policy "automation_tool_overrides_self_access" on automation_tool_overrides
  for all using (auth.uid() = doctor_id);
