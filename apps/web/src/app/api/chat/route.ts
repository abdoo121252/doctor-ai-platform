import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { createTrace } from "@/lib/request-trace";
import { logWithClient } from "@repo/agent";
import { loadChatState } from "@/lib/chat-state";
import { runChatTurn } from "@/lib/chat-runner";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const trace = createTrace();
  trace.phase("start", { route: "POST /api/chat" });

  try {
    const supabase = await createServerSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      trace.error("Unauthorized", new Error("No auth user"));
      trace.end({ phase: "auth", result: "unauthorized" });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const doctorId = auth.user.id;
    trace.info("doctor", { doctorId });

    const body = await request.json().catch(() => null);
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId : null;

    if (!message) {
      trace.end({ phase: "validate", result: "bad_request" });
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    let resolvedSessionId: string | null = sessionId;

    if (resolvedSessionId) {
      const { data: existing } = await supabase
        .from("chat_sessions")
        .select("id")
        .eq("id", resolvedSessionId)
        .eq("doctor_id", doctorId)
        .single();

      if (!existing) {
        trace.end({ phase: "session-lookup", result: "not_found" });
        return NextResponse.json(
          { error: "Session not found" },
          { status: 404 }
        );
      }
    } else {
      const title =
        message.length > 60 ? message.slice(0, 57) + "..." : message;
      const { data: newSession, error: sessionError } = await supabase
        .from("chat_sessions")
        .insert({ doctor_id: doctorId, title })
        .select()
        .single();

      if (sessionError || !newSession) {
        trace.error("Session create failed", sessionError, { title });
        throw sessionError ?? new Error("Session create failed");
      }
      resolvedSessionId = newSession.id;
      trace.info("new session", { sessionId: resolvedSessionId, title });
    }

    const finalSessionId = resolvedSessionId as string;

    // Fire-and-forget log (never blocks the response).
    logWithClient(supabase, {
      level: "info",
      source: "chat",
      message: "Processing message",
      doctor_id: doctorId,
      details: { sessionId: finalSessionId, msgLen: message.length },
    }).catch(() => {});

    // Build the model message list: prefer the durable full context in
    // chat_state; fall back to the plain transcript for legacy sessions.
    const state = await loadChatState(supabase, finalSessionId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let messages: any[];

    if (state && Array.isArray(state.messages)) {
      messages = [...(state.messages as any[])];
    } else {
      const { data: history } = await supabase
        .from("conversations")
        .select("role, content")
        .eq("session_id", finalSessionId)
        .eq("doctor_id", doctorId)
        .order("created_at", { ascending: true })
        .limit(50);
      messages = (history ?? []).map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      }));
    }

    // Append the new user message to the model context and persist it.
    messages.push({ role: "user", content: message });
    const { error: userInsertError } = await supabase
      .from("conversations")
      .insert({
        doctor_id: doctorId,
        session_id: finalSessionId,
        session_type: "chat",
        role: "user",
        content: message,
        parts: [{ type: "text", text: message }],
      });
    if (userInsertError) {
      trace.warn("user message insert failed", userInsertError);
    }

    trace.phase("model-loop-start", { messageCount: messages.length });

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: Record<string, unknown>) => {
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
            );
          } catch {
            // stream already closed
          }
        };

        try {
          await runChatTurn({
            supabase,
            doctorId,
            sessionId: finalSessionId,
            messages,
            send,
          });
        } catch (error) {
          trace.error("Chat loop failed", error);
          send({
            type: "error",
            error: error instanceof Error ? error.message : "Internal error",
          });
        }
        trace.end({ phase: "complete", sessionId: finalSessionId });
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    trace.error("Unhandled route error", error);
    trace.end({ phase: "error", result: "internal_error" });
    console.error("[Chat API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
