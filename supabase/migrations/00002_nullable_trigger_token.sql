-- 00002_nullable_trigger_token.sql
-- Make trigger_token_id optional since we use polling-based approval instead of wait tokens

alter table approval_requests
alter column trigger_token_id drop not null;
