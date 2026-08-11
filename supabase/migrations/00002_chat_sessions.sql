-- 00002_chat_sessions.sql
-- Multi-session chat support

create table chat_sessions (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid references doctors(id) on delete cascade not null,
  title text not null default 'New Chat',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_chat_sessions_doctor_id on chat_sessions(doctor_id, updated_at desc);

alter table chat_sessions enable row level security;
create policy "chat_sessions_self_access" on chat_sessions
  for all using (auth.uid() = doctor_id);

alter table conversations add column if not exists session_id uuid references chat_sessions(id) on delete cascade;
create index idx_conversations_session on conversations(session_id);
