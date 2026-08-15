import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { listMessages, listEvents, searchFiles } from "@repo/agent";
import { doesEventMatchFilter } from "@repo/shared";
import type { EventFilterRules } from "@repo/shared";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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

interface EventTriggerRow {
  id: string;
  doctor_id: string;
  name: string;
  instructions: string;
  condition: string | null;
  filter_rules: EventFilterRules | Record<string, unknown> | null;
  event_source: string;
  last_checked_at: string | null;
}

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

function isAuthorized(request: Request): boolean {
  const secret = process.env.AUTOMATION_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

/** Poll one (doctor, source) pair and return the new items. */
async function pollSource(
  doctorId: string,
  eventSource: string,
  since: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<PollItem[]> {
  if (eventSource === "gmail_new_message") {
    const res = await listMessages(doctorId, 20, undefined, supabase);
    const cutoff = since - GMAIL_OVERLAP_MS;
    return res.messages
      .map((m) => ({
        id: m.id,
        from: m.from,
        subject: m.subject,
        snippet: m.snippet,
        date: m.date,
        ts: Date.parse(m.date),
      }))
      .filter((m) => !Number.isNaN(m.ts) && m.ts > cutoff);
  }

  if (eventSource === "calendar_event_soon") {
    const res = await listEvents(doctorId, 2, 20, supabase);
    const now = Date.now();
    const soon = now + CALENDAR_SOON_MS;
    return res.events
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
  }

  if (eventSource === "drive_new_file") {
    const res = await searchFiles(doctorId, "", 50, supabase);
    return res.files
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

  return [];
}

/**
 * Forward one matched item to /api/automation/run, which runs in its own
 * function (own 300s budget) and does the semantic filter + dedupe + agent.
 * The poll function never runs the agent inline — it only polls + filters.
 */
async function forwardToRun(
  baseUrl: string,
  secret: string,
  payload: Record<string, unknown>
): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/automation/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(300_000),
    });
    return res.ok;
  } catch (err) {
    console.error("[automation/poll] Forward to /run failed:", err);
    return false;
  }
}

/**
 * ONE function per tick. Polls every enabled trigger across ALL users in
 * parallel (I/O bound, fast), applies the deterministic filter, and forwards
 * each match to /api/automation/run for the AI filter + agent.
 */
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceSupabase();
  const baseUrl = new URL(request.url).origin;
  const secret = process.env.AUTOMATION_SECRET ?? "";

  const { data: triggers, error } = await supabase
    .from("event_triggers")
    .select("*")
    .eq("enabled", true);

  if (error || !triggers || triggers.length === 0) {
    return NextResponse.json({ status: "ok", processed: 0 });
  }

  // Group by doctor + source, tracking the most recent last_checked_at.
  const groups = new Map<
    string,
    { doctorId: string; eventSource: string; lastChecked: number | null }
  >();

  for (const t of triggers as EventTriggerRow[]) {
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

  // Poll all groups in parallel.
  const pollResults = await Promise.all(
    [...groups.values()].map(async (group) => {
      const since = group.lastChecked ?? Date.now() - FIRST_RUN_LOOKBACK_MS;
      try {
        const items = await pollSource(
          group.doctorId,
          group.eventSource,
          since,
          supabase
        );
        return { group, items };
      } catch (err) {
        console.error(
          `[automation/poll] Poll failed for ${group.doctorId} (${group.eventSource}):`,
          err
        );
        return { group, items: [] as PollItem[] };
      }
    })
  );

  const forwards: Promise<boolean>[] = [];

  for (const { group, items } of pollResults) {
    for (const item of items) {
      for (const t of triggers as EventTriggerRow[]) {
        if (t.doctor_id !== group.doctorId || t.event_source !== group.eventSource) {
          continue;
        }
        if (!doesEventMatchFilter(item, t.filter_rules)) continue;

        forwards.push(
          forwardToRun(baseUrl, secret, {
            doctorId: group.doctorId,
            sessionType: "event",
            instructions: t.instructions,
            name: t.name,
            eventData: item,
            itemId: item.id,
            triggerId: t.id,
            ...(t.condition ? { condition: t.condition } : {}),
          })
        );
      }
    }

    // Advance the cursor for every trigger in this source group.
    await supabase
      .from("event_triggers")
      .update({ last_checked_at: new Date().toISOString() })
      .eq("doctor_id", group.doctorId)
      .eq("event_source", group.eventSource)
      .eq("enabled", true);
  }

  const results = await Promise.allSettled(forwards);
  const processed = results.filter(
    (r) => r.status === "fulfilled" && r.value
  ).length;

  return NextResponse.json({
    status: "completed",
    doctors: groups.size,
    processed,
  });
}
