import { task } from "@trigger.dev/sdk/v3";
import { generateChatResponse } from "@repo/agent";
import type { AgentContext } from "@repo/agent";
import { createClient } from "@supabase/supabase-js";
import { createTriggerApprovalHandler } from "../approval-handler";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

export const onNewEmail = task({
  id: "doctor-on-new-email",
  run: async (payload: { doctorId: string; eventSource: string; eventData?: unknown }) => {
    const supabase = getSupabase();
    const { doctorId, eventSource, eventData } = payload;

    const { data: triggers, error } = await supabase
      .from("event_triggers")
      .select("*")
      .eq("doctor_id", doctorId)
      .eq("event_source", eventSource)
      .eq("enabled", true);

    if (error || !triggers || triggers.length === 0) {
      return {
        status: "skipped",
        message: "No matching enabled event triggers",
      };
    }

    const results: Array<{ triggerName: string; text: string }> = [];

    for (const trigger of triggers) {
      try {
        const row = trigger as {
          id: string;
          name: string;
          instructions: string;
        };

        const context: AgentContext = {
          doctorId,
          sessionType: "event",
          requestApproval: createTriggerApprovalHandler(doctorId),
        };

        const message = eventData
          ? `${row.instructions}\n\nEvent data: ${JSON.stringify(eventData)}`
          : row.instructions;

        const response = await generateChatResponse({
          context,
          messages: [{ role: "user", content: message }],
        });

        results.push({
          triggerName: row.name,
          text: response.text,
        });
      } catch (err) {
        console.error(`[Event] Failed trigger ${trigger.id}:`, err);
      }
    }

    return {
      status: "completed",
      processed: results.length,
      results,
    };
  },
});
