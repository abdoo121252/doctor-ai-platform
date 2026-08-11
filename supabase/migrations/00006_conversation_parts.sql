-- 00006_conversation_parts.sql
-- Structured UI message parts for chat history.
--
-- The durable chat agent stores the full UIMessage structure (text, tool
-- invocations, approval state) so the chat page can reconstruct approval
-- cards / tool details after a refresh — not just flattened text.
-- Nullable: rows written by the legacy /api/chat path keep only `content`.

alter table conversations add column if not exists parts jsonb;
