import { schedules } from "@trigger.dev/sdk/v3";
import { generateChatResponse } from "@repo/agent";
import type { AgentContext } from "@repo/agent";
import { createClient } from "@supabase/supabase-js";
import { createTriggerApprovalHandler } from "../approval-handler";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export const scheduledAgentSession = schedules.task({
  id: "doctor-scheduled-session",
  cron: "0 8 * * *",
  run: async () => {
    // Load all enabled scheduled tasks across all doctors
    const { data: tasks, error } = await supabase
      .from("scheduled_tasks")
      .select("*")
      .eq("enabled", true);

    if (error || !tasks) {
      console.error("[Cron] Failed to load scheduled tasks:", error);
      return { status: "error", message: "Failed to load tasks" };
    }

    if (tasks.length === 0) {
      return { status: "ok", message: "No enabled scheduled tasks" };
    }

    const results: Array<{
      doctorId: string;
      taskName: string;
      text: string;
    }> = [];

    for (const task of tasks) {
      try {
        const taskRow = task as {
          id: string;
          doctor_id: string;
          name: string;
          instructions: string;
          cron_expression: string;
          enabled: boolean;
        };

        const context: AgentContext = {
          doctorId: taskRow.doctor_id,
          sessionType: "cron",
          requestApproval: createTriggerApprovalHandler(taskRow.doctor_id),
        };

        const response = await generateChatResponse({
          context,
          messages: [
            {
              role: "user",
              content: taskRow.instructions,
            },
          ],
        });

        results.push({
          doctorId: taskRow.doctor_id,
          taskName: taskRow.name,
          text: response.text,
        });
      } catch (err) {
        console.error(`[Cron] Failed task ${task.id}:`, err);
      }
    }

    return {
      status: "completed",
      processed: results.length,
      results,
    };
  },
});
