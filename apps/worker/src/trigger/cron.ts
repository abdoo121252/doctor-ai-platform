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
      if (!row.cron_expression) continue;
      const dueMs = lastDueMs(row.cron_expression, row.timezone || "UTC", now);
      if (dueMs === null) continue;

      const lastRun = row.last_run_at ? new Date(row.last_run_at).getTime() : null;
      if (lastRun !== null && lastRun >= dueMs) continue;

      // Optimistically mark as run so we don't re-fire on the next window.
      await supabase
        .from("scheduled_tasks")
        .update({ last_run_at: now.toISOString() })
        .eq("id", row.id);

      const res = await forwardToAutomation({
        doctorId: row.doctor_id,
        sessionType: "cron",
        taskId: row.id,
        name: row.name,
        instructions: row.instructions,
      });

      if (res.ok) dispatched++;
      else {
        console.error(`[Cron] Forward failed for task ${row.id}:`, res.status);
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
        await supabase
          .from("scheduled_task_dates")
          .update({ fired_at: new Date().toISOString() })
          .eq("id", d.id);

        const res = await forwardToAutomation({
          doctorId: row.doctor_id,
          sessionType: "cron",
          taskId: row.id,
          name: row.name,
          instructions: row.instructions,
        });

        if (res.ok) dispatched++;
        else {
          console.error(`[Cron] Forward failed for one-off task ${row.id}:`, res.status);
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
