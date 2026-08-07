-- 00003_unique_doctor_connection.sql
-- Ensure each doctor can have at most one active Google connection

create unique index idx_google_connections_active_doctor
  on google_connections(doctor_id)
  where status = 'active';
