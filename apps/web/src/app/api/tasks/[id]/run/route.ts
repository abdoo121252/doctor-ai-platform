import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { runAutomationPayload } from "@/lib/automation-dispatch";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: task, error } = await supabase
      .from("scheduled_tasks")
      .select("id, name, instructions")
      .eq("id", params.id)
      .eq("doctor_id", auth.user.id)
      .single();

    if (error || !task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const outcome = await runAutomationPayload({
      doctorId: auth.user.id,
      sessionType: "cron",
      taskId: task.id,
      name: task.name,
      instructions: task.instructions,
    });

    if (outcome.status === "skipped") {
      return NextResponse.json({ status: "skipped", reason: outcome.reason });
    }
    if (outcome.status === "error") {
      return NextResponse.json({ error: outcome.message }, { status: 500 });
    }
    return NextResponse.json(outcome.result);
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
