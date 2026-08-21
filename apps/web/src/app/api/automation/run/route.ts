import { NextResponse } from "next/server";
import { runAutomationPayload } from "@/lib/automation-dispatch";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
  const paths = Array.isArray(body?.paths) ? body.paths : undefined;

  if (!doctorId || !instructions) {
    return NextResponse.json(
      { error: "doctorId and instructions are required" },
      { status: 400 }
    );
  }

  const outcome = await runAutomationPayload({
    doctorId,
    sessionType,
    instructions,
    name,
    eventData,
    itemId,
    triggerId,
    taskId,
    condition,
    paths,
  });

  if (outcome.status === "skipped") {
    return NextResponse.json({ status: "skipped", reason: outcome.reason });
  }
  if (outcome.status === "error") {
    return NextResponse.json({ error: outcome.message }, { status: 500 });
  }
  return NextResponse.json(outcome.result);
}
