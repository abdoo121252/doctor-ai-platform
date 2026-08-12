import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createTrace } from "@/lib/request-trace";
import { AgentChat } from "@trigger.dev/sdk/chat";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const trace = createTrace();
  trace.phase("start", { route: "POST /api/sessions/[id]/submit", sessionId: params.id });

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body.content !== "string" || !body.content.trim()) {
      trace.end({ phase: "validation", result: "bad_request" });
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }

    const content = body.content.trim();
    const sessionId = params.id;

    trace.phase("auth-lookup");
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    // Resolve doctor from session (service key bypasses RLS)
    const { data: sessionRow } = await serviceClient
      .from("chat_sessions")
      .select("id, doctor_id")
      .eq("id", sessionId)
      .maybeSingle();

    if (!sessionRow) {
      trace.info("session not found", { sessionId });
      trace.end({ phase: "session-lookup", result: "not_found" });
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doctorId = (sessionRow as any).doctor_id as string;
    trace.info("doctor resolved", { doctorId });

    // Insert the user message
    trace.phase("db-insert");
    const { data: messageRow, error: insertErr } = await serviceClient
      .from("conversations")
      .insert({
        doctor_id: doctorId,
        session_id: sessionId,
        session_type: "chat",
        role: "user",
        content,
        parts: [{ type: "text", text: content }],
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("*") as any;

    if (insertErr) {
      trace.error("insert failed", insertErr);
      trace.end({ phase: "db-insert", result: "error" });
      return NextResponse.json({ error: "Failed to save message" }, { status: 500 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = (Array.isArray(messageRow) ? messageRow[0] : messageRow) as any;
    if (!row) {
      trace.error("no row returned", new Error("no row returned"));
      trace.end({ phase: "db-insert", result: "error" });
      return NextResponse.json({ error: "Failed to save message" }, { status: 500 });
    }

    trace.phase("trigger-delivery");
    // Fire-and-forget: deliver the message to the agent via Trigger.dev API.
    // The agent wakes up, processes the message, and persists its response.
    const chat = new AgentChat({
      agent: "doctor-chat",
      id: sessionId,
      clientData: { doctorId },
    });

    chat.sendRaw(
      [
        {
          id: row.id,
          role: "user",
          parts: (row.parts as Array<Record<string, unknown>> | null) ?? [
            { type: "text", text: content },
          ],
        },
      ]
    ).catch((e) => {
      console.error("[submit] AgentChat.sendRaw failed:", e);
    });

    trace.end({ phase: "complete", messageId: row.id });

    return NextResponse.json(
      {
        id: row.id,
        role: row.role,
        content: row.content,
        parts: row.parts,
        createdAt: row.created_at,
      },
      { status: 201 }
    );
  } catch (error) {
    trace.error("Unhandled POST /api/sessions/[id]/submit error", error);
    trace.end({ phase: "error", result: "internal_error" });
    console.error("[Session Submit] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
