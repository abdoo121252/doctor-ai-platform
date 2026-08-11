import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { createTrace } from "@/lib/request-trace";
import { streamChatResponse, logWithClient } from "@repo/agent";
import type { AgentContext, ChatResponse } from "@repo/agent";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const trace = createTrace();
  trace.phase("start", {
    method: request.method,
    url: request.url,
    contentType: request.headers.get("content-type"),
  });

  try {
    const supabase = await createServerSupabase();
    const { data: auth } = await supabase.auth.getUser();
    trace.phase("auth", { authenticated: !!auth.user });
    if (!auth.user) {
      trace.error("Unauthorized", new Error("No auth user"));
      trace.end({ phase: "auth", result: "unauthorized" });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const doctorId = auth.user.id;
    trace.info("doctor", { doctorId });

    const body = await request.json();
    const { message, sessionType = "chat", sessionId } = body;
    trace.data("request body", {
      message,
      sessionType,
      sessionId,
      msgLen: typeof message === "string" ? message.length : null,
    });

    trace.phase("validate");
    if (!message || typeof message !== "string") {
      trace.error("Invalid message", new Error("Message is required"));
      trace.end({ phase: "validate", result: "bad_request" });
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    let resolvedSessionId: string | null = sessionId ?? null;
    let isNewSession = false;

    if (resolvedSessionId) {
      trace.phase("session-lookup", { sessionId: resolvedSessionId });
      const { data: existing } = await supabase
        .from("chat_sessions")
        .select("id")
        .eq("id", resolvedSessionId)
        .eq("doctor_id", doctorId)
        .single();

      if (!existing) {
        trace.error("Session not found", new Error("Session not found"), {
          sessionId: resolvedSessionId,
        });
        trace.end({ phase: "session-lookup", result: "not_found" });
        return NextResponse.json(
          { error: "Session not found" },
          { status: 404 }
        );
      }
    } else {
      trace.phase("session-create");
      const title =
        message.length > 60 ? message.slice(0, 57) + "..." : message;
      const { data: newSession, error: sessionError } = await supabase
        .from("chat_sessions")
        .insert({ doctor_id: doctorId, title })
        .select()
        .single();

      if (sessionError) {
        trace.error("Session create failed", sessionError, { title });
        throw sessionError;
      }
      resolvedSessionId = newSession.id;
      isNewSession = true;
      trace.info("new session", { sessionId: resolvedSessionId, title });
    }

    // Fire-and-forget: log doesn't block the response
    logWithClient(supabase, {
      level: "info",
      source: "chat",
      message: "Processing message",
      doctor_id: doctorId,
      details: { sessionType, sessionId: resolvedSessionId, msgLen: message.length },
    }).catch(() => {});

    trace.phase("history", { isNewSession });
    const { data: history } = isNewSession
      ? { data: null as Array<{ role: string; content: string }> | null }
      : await supabase
          .from("conversations")
          .select("*")
          .eq("doctor_id", doctorId)
          .eq("session_id", resolvedSessionId)
          .order("created_at", { ascending: true })
          .limit(20);

    trace.info("history loaded", { count: history?.length ?? 0 });

    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
      ...(history ?? []).map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user" as const, content: message },
    ];

    const context: AgentContext = {
      doctorId,
      sessionType: sessionType as "chat" | "cron" | "event",
      sessionId: resolvedSessionId ?? undefined,
      supabase,
    };

    trace.phase("model-stream-start", { messageCount: messages.length });
    const { textStream, steps } = streamChatResponse({ context, messages });

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let fullText = "";
        let chunkCount = 0;
        let firstChunkRel = 0;
        const streamStart = performance.now();
        try {
          for await (const chunk of textStream) {
            if (chunkCount === 0) {
              firstChunkRel = Math.round(performance.now() - streamStart);
            }
            chunkCount++;
            fullText += chunk;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "text", text: chunk })}\n\n`
              )
            );
          }
          trace.phase("model-stream-end", {
            chunkCount,
            firstChunkRel,
            streamMs: Math.round(performance.now() - streamStart),
            textLen: fullText.length,
          });
        } catch (error) {
          trace.error("Model stream failed", error, {
            chunkCount,
            textLen: fullText.length,
          });
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error:
                  error instanceof Error ? error.message : "Stream error",
              })}\n\n`
            )
          );
          controller.close();
          return;
        }

        // Persist (parallel): user+assistant insert and session touch
        trace.phase("persist");
        await Promise.all([
          supabase.from("conversations").insert([
            {
              doctor_id: doctorId,
              session_id: resolvedSessionId,
              session_type: sessionType,
              role: "user",
              content: message,
            },
            {
              doctor_id: doctorId,
              session_id: resolvedSessionId,
              session_type: sessionType,
              role: "assistant",
              content: fullText,
            },
          ]),
          supabase
            .from("chat_sessions")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", resolvedSessionId),
        ])
          .then(() => {
            trace.phase("persist-ok");
          })
          .catch((error) => {
            trace.error("Failed to save conversation", error);
            logWithClient(supabase, {
              level: "error",
              source: "chat",
              message: "Failed to save conversation",
              doctor_id: doctorId,
              details: {
                error: error instanceof Error ? error.message : String(error),
              },
            }).catch(() => {});
          });

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "done",
              text: fullText,
              steps: steps as ChatResponse["steps"],
              sessionId: resolvedSessionId,
            })}\n\n`
          )
        );
        trace.phase("stream-done");
        trace.end({
          phase: "complete",
          sessionId: resolvedSessionId,
          textLen: fullText.length,
          chunkCount,
        });
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
