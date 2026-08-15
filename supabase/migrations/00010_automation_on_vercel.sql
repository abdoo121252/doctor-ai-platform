-- 00010_automation_on_vercel.sql
-- Support running automation agents on Vercel instead of trigger.dev.

-- Natural-language condition for an event trigger (semantic pre-filter that
-- runs on Vercel before the full agent, in addition to deterministic
-- `filter_rules`).
alter table event_triggers
  add column if not exists condition text;

-- Distinguish automation sessions (cron / event) from interactive chat
-- sessions so the sidebar can filter them out.
alter table chat_sessions
  add column if not exists session_type text not null default 'chat';

-- Link an automation session back to its source task/trigger (for UI/debug).
alter table chat_sessions
  add column if not exists source_id uuid;
