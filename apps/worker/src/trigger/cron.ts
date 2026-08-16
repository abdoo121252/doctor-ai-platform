import "../websocket-polyfill";
import { schedules } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import { cronMatches } from "../cron-match";
import { forwardToAutomation } from "../dispatch";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

interface ScheduledTaskRow {
  id: string;
  doctor_id: string;
  name: string;
  instructions: string;
  cron_expression: string | null;
  schedule_type: string;
  timezone: string | null;
  last_run_at: string | null;
  interval_hours: number | null;
  interval_anchor: string | null;
  enabled: boolean;
}

/** Window (minutes) to back-walk for the most recent cron match. */
const LOOKBACK_MINUTES = 16;

/** Most recent minute (ms) within the lookback window where `expr` fires. */
function lastDueMs(
  expr: string,
  timezone: string,
  now: Date
): number | null {
  for (let i = 0; i <= LOOKBACK_MINUTES; i++) {
    const d = new Date(now.getTime() - i * 60_000);
    if (cronMatches(expr, d, timezone || "UTC")) return d.getTime();
  }
  return null;
}

/**
 * Next slot (ms) to fire an "every N hours" task, or null if it is not yet
 * due. Slots sit on the grid anchored at the chosen start time; the first fire
 * is the first slot on/after `now`, later fires are `lastRun + interval`. When
 * behind by several intervals it fast-forwards to the latest elapsed slot
 * (fire once, no catch-up storm).
 */
function intervalNextSlot(
  anchorMs: number,
  intervalHours: number,
  lastRunMs: number | null,
  nowMs: number
): number | null {
  const intervalMs = intervalHours * 3600_000;
  const next =
    lastRunMs === null
      ? anchorMs + Math.ceil((nowMs - anchorMs) / intervalMs) * intervalMs
      : lastRunMs + intervalMs;
  if (nowMs < next) return null;
  return anchorMs + Math.floor((nowMs - anchorMs) / intervalMs) * intervalMs;
}

export const scheduledAgentSession = schedules.task({
  id: "doctor-scheduled-session",
  cron: "*/15 * * * *",
  ttl: "15m",
  run: async () => {
    const supabase = getSupabase();
    const now = new Date();

    const { data: tasks, error } = await supabase
      .from("scheduled_tasks")
      .select("*")
      .eq("enabled", true);

    if (error || !tasks) {
      console.error("[Cron] Failed to load scheduled tasks:", error);
      return { status: "error", message: "Failed to load tasks" };
    }

    let dispatched = 0;

    const recurring: ScheduledTaskRow[] = [];
    const oneOff: ScheduledTaskRow[] = [];
    for (const row of tasks as ScheduledTaskRow[]) {
      if (row.schedule_type === "one_off_dates") oneOff.push(row);
      else recurring.push(row);
    }

    for (const row of recurring) {
      // Interval schedule (N doesn't divide 24): fire from
      // interval_anchor + interval_hours + last_run_at.
      if (row.schedule_type === "every_n_hours" && !row.cron_expression) {
        const anchorMs = row.interval_anchor
          ? new Date(row.interval_anchor).getTime()
          : null;
        if (!anchorMs || !row.interval_hours) continue;
        const lastMs = row.last_run_at
          ? new Date(row.last_run_at).getTime()
          : null;
        const slotMs = intervalNextSlot(
          anchorMs,
          row.interval_hours,
          lastMs,
          now.getTime()
        );
        if (slotMs === null) continue;

        const res = await forwardToAutomation({
          doctorId: row.doctor_id,
          sessionType: "cron",
          taskId: row.id,
          name: row.name,
          instructions: row.instructions,
        });

        if (res.ok) dispatched++;

        // Same marking convention as the cron path below.
        if (res.status !== undefined) {
          await supabase
            .from("scheduled_tasks")
            .update({ last_run_at: new Date(slotMs).toISOString() })
            .eq("id", row.id);
        } else {
          console.error(
            `[Cron] Forward failed for every-n-hours task ${row.id}:`,
            res.status
          );
        }
        continue;
      }

      if (!row.cron_expression) continue;
      const dueMs = lastDueMs(row.cron_expression, row.timezone || "UTC", now);
      if (dueMs === null) continue;

      const lastRun = row.last_run_at ? new Date(row.last_run_at).getTime() : null;
      if (lastRun !== null && lastRun >= dueMs) continue;

      const res = await forwardToAutomation({
        doctorId: row.doctor_id,
        sessionType: "cron",
        taskId: row.id,
        name: row.name,
        instructions: row.instructions,
      });

      if (res.ok) {
        dispatched++;
      } else {
        console.error(
          `[Cron] Forward failed for task ${row.id}:`,
          res.status ?? "unreachable"
        );
      }

      // Mark the occurrence as run once the request reached Vercel (any HTTP
      // status). A 4xx/5xx means the automation was received and processed (or
      // attempted), so re-firing it would create duplicate sessions. Only a
      // network-level failure (res.status === undefined) leaves it unset so the
      // next cron tick can retry. Use the due time so the `lastRun >= dueMs`
      // guard still suppresses re-fires across windows.
      if (res.status !== undefined) {
        await supabase
          .from("scheduled_tasks")
          .update({ last_run_at: new Date(dueMs).toISOString() })
          .eq("id", row.id);
      }
    }

    for (const row of oneOff) {
      const { data: dates, error: dateErr } = await supabase
        .from("scheduled_task_dates")
        .select("id, run_at")
        .eq("task_id", row.id)
        .is("fired_at", null)
        .lte("run_at", now.toISOString())
        .order("run_at", { ascending: true });

      if (dateErr || !dates || dates.length === 0) continue;

      for (const d of dates as Array<{ id: string; run_at: string }>) {
        const res = await forwardToAutomation({
          doctorId: row.doctor_id,
          sessionType: "cron",
          taskId: row.id,
          name: row.name,
          instructions: row.instructions,
        });

        if (res.ok) {
          dispatched++;
        } else {
          console.error(
            `[Cron] Forward failed for one-off task ${row.id}:`,
            res.status ?? "unreachable"
          );
        }

        // Mark the date as fired once the request reached Vercel (any HTTP
        // status), so a failed/rejected run doesn't re-fire every 15 minutes
        // and create duplicate sessions. Only a network-level failure
        // (res.status === undefined) leaves it unfired for the next tick.
        if (res.status !== undefined) {
          await supabase
            .from("scheduled_task_dates")
            .update({ fired_at: new Date().toISOString() })
            .eq("id", d.id);
        }
      }

      // Auto-disable once every date has fired.
      const { data: remaining } = await supabase
        .from("scheduled_task_dates")
        .select("id")
        .eq("task_id", row.id)
        .is("fired_at", null);

      if (!remaining || remaining.length === 0) {
        await supabase
          .from("scheduled_tasks")
          .update({ enabled: false })
          .eq("id", row.id);
      }
    }

    return { status: "completed", dispatched };
  },
});
