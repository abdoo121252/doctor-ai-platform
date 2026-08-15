import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { filterMatchesCondition } from "@repo/agent";
import type { AutomationType } from "@repo/shared";
import { runAutomationTurn } from "@/lib/automation-runner";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const doctorId = typeof body?.doctorId === "string" ? body.doctorId : "";
  const sessionType: "cron" | "event" =
    body?.sessionType === "cron" ? "cron" : "event";
  const instructions =
    typeof body?.instructions === "string" ? body.instructions : "";
  const name = typeof body?.name === "string" ? body.name : "";
  const eventData = body?.eventData;
  const itemId = typeof body?.itemId === "string" ? body.itemId : "";
  const triggerId = typeof body?.triggerId === "string" ? body.triggerId : "";
  const taskId = typeof body?.taskId === "string" ? body.taskId : "";
  const condition = typeof body?.condition === "string" ? body.condition : "";

  if (!doctorId || !instructions) {
    return NextResponse.json(
      { error: "doctorId and instructions are required" },
      { status: 400 }
    );
  }

  const automationType: AutomationType =
    sessionType === "cron" ? "scheduled_task" : "event_trigger";
  const automationId = sessionType === "cron" ? taskId : triggerId;

  const supabase = getServiceSupabase();

  // Events: semantic pre-filter (cheap) then dedupe, before running the agent.
  if (sessionType === "event") {
    if (condition) {
      try {
        const { matches } = await filterMatchesCondition(condition, eventData);
        if (!matches) {
          return NextResponse.json({
            status: "skipped",
            reason: "condition_not_met",
          });
        }
      } catch (err) {
        console.error("[automation/run] Semantic filter failed:", err);
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
        return NextResponse.json({
          status: "skipped",
          reason: "already_seen",
        });
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
    console.error("[automation/run] Failed to create session:", sessionError);
    return NextResponse.json(
      { error: "Failed to create automation session" },
      { status: 500 }
    );
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
    return NextResponse.json(result);
  } catch (err) {
    console.error("[automation/run] Agent run failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
