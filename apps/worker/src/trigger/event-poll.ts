import { schedules } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import { listMessages, listEvents, searchFiles } from "@repo/agent";
import { dispatchEventItem } from "../dispatch";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

/** Window to look back when a trigger has never been checked before. */
const FIRST_RUN_LOOKBACK_MS = 15 * 60 * 1000;
/** Overlap to tolerate clock/header skew in Gmail message dates. */
const GMAIL_OVERLAP_MS = 2 * 60 * 1000;
/** How soon an upcoming calendar event must start to fire a "soon" trigger. */
const CALENDAR_SOON_MS = 30 * 60 * 1000;

interface PollItem {
  id: string;
  ts: number;
  [key: string]: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TriggerRow = any;

export const checkEventTriggers = schedules.task({
  id: "check-event-triggers",
  cron: "*/5 * * * *",
  ttl: "5m",
  run: async () => {
    const supabase = getSupabase();

    const { data: triggers, error } = await supabase
      .from("event_triggers")
      .select("*")
      .eq("enabled", true);

    if (error || !triggers || triggers.length === 0) {
      return { status: "ok", processed: 0 };
    }

    // Group enabled triggers by doctor + source, tracking the most recent
    // `last_checked_at` per group (used only to bound the fetch window).
    const groups = new Map<
      string,
      { doctorId: string; eventSource: string; lastChecked: number | null }
    >();

    for (const t of triggers as TriggerRow[]) {
      const key = `${t.doctor_id}:${t.event_source}`;
      const tms = t.last_checked_at ? new Date(t.last_checked_at).getTime() : null;
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, {
          doctorId: t.doctor_id,
          eventSource: t.event_source,
          lastChecked: tms,
        });
      } else if (tms && (existing.lastChecked === null || tms > existing.lastChecked)) {
        existing.lastChecked = tms;
      }
    }

    let processed = 0;

    for (const group of groups.values()) {
      const since = group.lastChecked ?? Date.now() - FIRST_RUN_LOOKBACK_MS;

      let items: PollItem[] = [];

      try {
        if (group.eventSource === "gmail_new_message") {
          const res = await listMessages(group.doctorId, 20, undefined, supabase);
          const cutoff = since - GMAIL_OVERLAP_MS;
          items = res.messages
            .map((m) => ({
              id: m.id,
              from: m.from,
              subject: m.subject,
              snippet: m.snippet,
              date: m.date,
              ts: Date.parse(m.date),
            }))
            .filter((m) => !Number.isNaN(m.ts) && m.ts > cutoff);
        } else if (group.eventSource === "calendar_event_soon") {
          const res = await listEvents(group.doctorId, 2, 20, supabase);
          const now = Date.now();
          const soon = now + CALENDAR_SOON_MS;
          items = res.events
            .map((e) => ({
              id: e.id ?? "",
              summary: e.summary,
              start: e.start,
              end: e.end,
              attendees: e.attendees,
              location: e.location,
              ts: Date.parse(e.start),
            }))
            .filter((e) => !!e.id && !Number.isNaN(e.ts) && e.ts >= now && e.ts <= soon);
        } else if (group.eventSource === "drive_new_file") {
          const res = await searchFiles(group.doctorId, "", 50, supabase);
          items = res.files
            .map((f) => ({
              id: f.id ?? "",
              name: f.name,
              mimeType: f.mimeType,
              webViewLink: f.webViewLink,
              createdTime: f.createdTime,
              ts: Date.parse(f.createdTime ?? ""),
            }))
            .filter((f) => !!f.id && !Number.isNaN(f.ts) && f.ts > since);
        }
      } catch (err) {
        console.error(
          `[EventPoll] Failed to poll ${group.eventSource} for ${group.doctorId}:`,
          err
        );
        continue;
      }

      for (const item of items) {
        try {
          processed += await dispatchEventItem(
            supabase,
            group.doctorId,
            group.eventSource,
            item,
            item.id
          );
        } catch (err) {
          console.error(
            `[EventPoll] Failed to dispatch item for ${group.doctorId}:`,
            err
          );
        }
      }

      // Advance the cursor for every trigger in this group.
      await supabase
        .from("event_triggers")
        .update({ last_checked_at: new Date().toISOString() })
        .eq("doctor_id", group.doctorId)
        .eq("event_source", group.eventSource)
        .eq("enabled", true);
    }

    return { status: "completed", processed };
  },
});
