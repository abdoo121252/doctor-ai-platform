-- 00013_event_trigger_paths.sql
-- Multi-path event triggers: each trigger can declare several "paths"; the AI
-- (or a deterministic fields filter) selects which path's instructions run.
--
-- Each path:
--   { id, name?, filter: { mode: 'fields', fields: EventFilterRules } | { mode: 'ai', condition: text }, instructions: text }

alter table event_triggers
  add column if not exists paths jsonb not null default '[]'::jsonb;

-- Backfill existing triggers into a single "Default" path, preserving current
-- behavior: deterministic filter_rules ANDed with the natural-language
-- condition (when present). If a condition exists we route with the AI mode
-- (it can also cover the field checks); otherwise we keep the cheap fields
-- mode. `instructions` becomes that path's instructions.
update event_triggers
set paths = jsonb_build_array(
  jsonb_build_object(
    'id', 'default',
    'name', 'Default',
    'filter', jsonb_build_object(
      'mode', case
        when condition is not null and btrim(condition) <> '' then 'ai'
        else 'fields'
      end,
      'condition', condition,
      'fields', filter_rules
    ),
    'instructions', instructions
  )
)
where paths = '[]'::jsonb;