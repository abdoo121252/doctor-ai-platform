-- 00001_initial_schema.sql
-- Doctor AI Agent Platform — Initial Schema

-- Enable pgcrypto for gen_random_uuid()
create extension if not exists "pgcrypto";

-- Doctors (users)
create table doctors (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text unique not null,
  created_at timestamptz default now()
);

-- Google account connection — refresh tokens encrypted via Supabase Vault
create table google_connections (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid references doctors(id) on delete cascade not null,
  status text default 'active', -- active / expired / revoked
  refresh_token_encrypted text,
  connected_at timestamptz default now(),
  last_checked_at timestamptz
);

-- Conversation history
create table conversations (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid references doctors(id) on delete cascade not null,
  session_type text not null, -- chat / cron / event
  role text not null, -- user / assistant / tool
  content text not null,
  created_at timestamptz default now()
);

create index idx_conversations_doctor_id on conversations(doctor_id);
create index idx_conversations_created_at on conversations(doctor_id, created_at);

-- Approval requests (the heart of the protection layer)
create table approval_requests (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid references doctors(id) on delete cascade not null,
  session_id uuid,
  action_type text not null, -- send_email / delete_file / create_event / ...
  action_payload jsonb not null, -- full details (email text, recipient, etc.)
  status text default 'pending', -- pending / approved / rejected
  trigger_token_id text,
  requested_at timestamptz default now(),
  resolved_at timestamptz,
  rejection_reason text
);

create index idx_approval_requests_doctor_id on approval_requests(doctor_id);
create index idx_approval_requests_status on approval_requests(doctor_id, status);

-- Per-doctor cron job definitions
create table scheduled_tasks (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid references doctors(id) on delete cascade not null,
  name text not null,
  cron_expression text not null, -- e.g. '0 8 * * *'
  instructions text not null,
  enabled boolean default true,
  created_at timestamptz default now()
);

create index idx_scheduled_tasks_doctor_id on scheduled_tasks(doctor_id);

-- Per-doctor event trigger definitions
create table event_triggers (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid references doctors(id) on delete cascade not null,
  name text not null,
  event_source text not null, -- gmail_new_message / calendar_event_soon / drive_new_file
  instructions text not null,
  enabled boolean default true,
  created_at timestamptz default now()
);

create index idx_event_triggers_doctor_id on event_triggers(doctor_id);

-- =====================
-- Row Level Security
-- =====================

alter table doctors enable row level security;
alter table google_connections enable row level security;
alter table conversations enable row level security;
alter table approval_requests enable row level security;
alter table scheduled_tasks enable row level security;
alter table event_triggers enable row level security;

-- Each doctor can only read/update their own row
create policy "doctors_self_access" on doctors
  for all using (auth.uid() = id);

-- Google connections scoped to doctor
create policy "google_connections_self_access" on google_connections
  for all using (auth.uid() = doctor_id);

-- Conversations scoped to doctor
create policy "conversations_self_access" on conversations
  for all using (auth.uid() = doctor_id);

-- Approval requests scoped to doctor
create policy "approval_requests_self_access" on approval_requests
  for all using (auth.uid() = doctor_id);

-- Scheduled tasks scoped to doctor
create policy "scheduled_tasks_self_access" on scheduled_tasks
  for all using (auth.uid() = doctor_id);

-- Event triggers scoped to doctor
create policy "event_triggers_self_access" on event_triggers
  for all using (auth.uid() = doctor_id);
