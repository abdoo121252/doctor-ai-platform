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
  cron_expression: string;
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

    for (const row of tasks as ScheduledTaskRow[]) {
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

    return { status: "completed", dispatched };
  },
});
