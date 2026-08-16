import { createClient } from "@supabase/supabase-js";
import { filterMatchesCondition } from "@repo/agent";
import type { AutomationType } from "@repo/shared";
import { runAutomationTurn, type AutomationRunResult } from "./automation-runner";

export interface AutomationPayload {
  doctorId: string;
  sessionType: "cron" | "event";
  instructions: string;
  name: string;
  eventData?: unknown;
  itemId?: string;
  triggerId?: string;
  taskId?: string;
  condition?: string;
}

export type DispatchOutcome =
  | { status: "skipped"; reason: string }
  | { status: "ok"; result: AutomationRunResult }
  | { status: "error"; message: string };

/**
 * Shared handler for a single automation payload: semantic pre-filter (events),
 * dedupe via event_trigger_seen, session creation, and the agent turn. Used by
 * both /api/automation/run (HTTP) and /api/automation/poll (internal loop) so
 * the agent logic lives in exactly one place.
 */
export async function runAutomationPayload(
  payload: AutomationPayload
): Promise<DispatchOutcome> {
  const {
    doctorId,
    sessionType,
    instructions,
    name,
    eventData,
    itemId,
    triggerId,
    taskId,
    condition,
  } = payload;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const automationType: AutomationType =
    sessionType === "cron" ? "scheduled_task" : "event_trigger";
  const automationId = (sessionType === "cron" ? taskId : triggerId) ?? "";

  // Events: semantic pre-filter (cheap) then dedupe, before running the agent.
  if (sessionType === "event") {
    if (condition) {
      try {
        const { matches } = await filterMatchesCondition(condition, eventData);
        if (!matches) {
          return { status: "skipped", reason: "condition_not_met" };
        }
      } catch (err) {
        console.error("[automation-dispatch] Semantic filter failed:", err);
      }
    }

    if (triggerId && itemId) {
      const { data: inserted } = await supabase
        .from("event_trigger_seen")
        .upsert(
          {
            trigger_id: triggerId,
            item_id: itemId,
            seen_at: new Date().toISOString(),
          },
          { onConflict: "trigger_id,item_id", ignoreDuplicates: true }
        )
        .select();

      if (!inserted || inserted.length === 0) {
        return { status: "skipped", reason: "already_seen" };
      }
    }
  }

  const { data: session, error: sessionError } = await supabase
    .from("chat_sessions")
    .insert({
      doctor_id: doctorId,
      title: name || (sessionType === "cron" ? "Scheduled task" : "Event trigger"),
      session_type: sessionType,
      source_id: automationId || null,
    })
    .select()
    .single();

  if (sessionError || !session) {
    const detail = sessionError
      ? `${sessionError.message} (${sessionError.code ?? "no-code"})`
      : "no row returned";
    return { status: "error", message: `Failed to create automation session: ${detail}` };
  }

  const sessionId = (session as { id: string }).id;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [
    {
      role: "user",
      content:
        eventData !== undefined
          ? `${instructions}\n\nEvent data: ${JSON.stringify(eventData)}`
          : instructions,
    },
  ];

  try {
    const result = await runAutomationTurn({
      supabase,
      doctorId,
      sessionId,
      sessionType,
      automationType,
      automationId,
      messages,
    });
    return { status: "ok", result };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Internal error",
    };
  }
}
