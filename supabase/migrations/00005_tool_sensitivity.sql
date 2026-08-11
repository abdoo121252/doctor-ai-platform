-- 00005_tool_sensitivity.sql
-- Per-doctor tool sensitivity settings for the chat approval gate.
--
-- Each row marks one agent tool as requiring approval (sensitive) or not.
-- Missing rows fall back to the defaults in packages/shared (see
-- TOOL_SENSITIVITY_DEFAULTS). Doctors can override on the
-- /settings/tools page.

create table tool_sensitivity_settings (
  doctor_id uuid references doctors(id) on delete cascade not null,
  tool_name text not null,
  sensitive boolean not null default false,
  updated_at timestamptz default now(),
  primary key (doctor_id, tool_name)
);

alter table tool_sensitivity_settings enable row level security;

create policy "tool_sensitivity_settings_self_access" on tool_sensitivity_settings
  for all using (auth.uid() = doctor_id);

create index idx_tool_sensitivity_doctor_id on tool_sensitivity_settings(doctor_id);

-- Chat session resume state for the Trigger.dev chat transport. The transport
-- hydrates from these on page reload: publicAccessToken lets it resubscribe to
-- session.out without re-minting, and lastEventId is the SSE cursor that skips
-- already-seen stream events. Both are written atomically in onTurnComplete.
alter table chat_sessions
  add column public_access_token text,
  add column last_event_id text;
