-- 00007_chat_state.sql
-- Durable chat state for the stateless Next.js chat loop (post-Trigger.dev).
--
-- chat_state holds the full model conversation (AI SDK ModelMessage[]) keyed by
-- session, overwritten after every step, so a page reload / crash / new request
-- can resume the agent as a true continuation rather than a new session.
--
-- tool_execution_log records started/completed/failed markers around sensitive
-- tool executions so we can detect a crash mid-execution and warn the doctor
-- instead of silently re-running a side-effectful tool.

create table chat_state (
  session_id uuid primary key references chat_sessions(id) on delete cascade,
  doctor_id uuid references doctors(id) on delete cascade not null,
  status text not null default 'in_progress', -- in_progress / awaiting_approval / completed
  messages jsonb not null default '[]',
  pending_approval jsonb, -- { approvalId, toolName, toolCallId, input }
  updated_at timestamptz default now()
);

create table tool_execution_log (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references chat_sessions(id) on delete cascade,
  doctor_id uuid references doctors(id) on delete cascade not null,
  tool_call_id text not null,
  tool_name text not null,
  status text not null, -- started / completed / failed
  input jsonb,
  output jsonb,
  error text,
  started_at timestamptz default now(),
  completed_at timestamptz
);

create index idx_chat_state_doctor on chat_state(doctor_id, updated_at desc);
create index idx_tool_exec_log_session on tool_execution_log(session_id, tool_call_id);
create index idx_tool_exec_log_doctor on tool_execution_log(doctor_id);

alter table chat_state enable row level security;
alter table tool_execution_log enable row level security;

create policy "chat_state_self_access" on chat_state
  for all using (auth.uid() = doctor_id);

create policy "tool_execution_log_self_access" on tool_execution_log
  for all using (auth.uid() = doctor_id);
