-- 00004_microsoft_connections.sql
-- Microsoft (Outlook / Microsoft 365) connections — mirrors google_connections.

create table microsoft_connections (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid references doctors(id) on delete cascade not null,
  status text default 'active', -- active / expired / revoked
  refresh_token_encrypted text,
  connected_at timestamptz default now(),
  last_checked_at timestamptz
);

alter table microsoft_connections enable row level security;

create policy "microsoft_connections_self_access" on microsoft_connections
  for all using (auth.uid() = doctor_id);

-- Ensure each doctor can have at most one active Microsoft connection
create unique index idx_microsoft_connections_active_doctor
  on microsoft_connections(doctor_id)
  where status = 'active';

-- Plain unique index on doctor_id so `ON CONFLICT (doctor_id)` upserts work
-- (matches google_connections_doctor_id_unique).
create unique index microsoft_connections_doctor_id_unique
  on microsoft_connections(doctor_id);
