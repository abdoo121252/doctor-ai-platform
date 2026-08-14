import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { createTrace } from "@/lib/request-trace";
import {
  loadChatState,
  findCrashedToolExecutions,
} from "@/lib/chat-state";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const trace = createTrace();
  trace.phase("start", { route: "GET /api/sessions/[id]/messages", sessionId: params.id });
  try {
    const supabase = await createServerSupabase();
    const { data: auth } = await supabase.auth.getUser();
    trace.phase("auth", { authenticated: !!auth.user });
    if (!auth.user) {
      trace.error("Unauthorized", new Error("No auth user"));
      trace.end({ phase: "auth", result: "unauthorized" });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // All queries are independent once we have the doctor id — run them in
    // parallel to avoid sequential Supabase round-trips on session switch.
    trace.phase("load");
    const [sessionResult, messagesResult, state, crashedToolCalls] =
      await Promise.all([
        supabase
          .from("chat_sessions")
          .select("id, title, public_access_token, last_event_id")
          .eq("id", params.id)
          .eq("doctor_id", auth.user.id)
          .single(),
        supabase
          .from("conversations")
          .select("id, role, content, parts, created_at")
          .eq("session_id", params.id)
          .order("created_at", { ascending: true }),
        loadChatState(supabase, params.id),
        findCrashedToolExecutions(supabase, params.id),
      ]);

    const session = sessionResult.data;
    const { data: messages, error } = messagesResult;

    if (!session) {
      trace.info("session not found", { sessionId: params.id });
      trace.end({ phase: "load", result: "not_found" });
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    trace.info("session found", { title: session.title });

    if (error) {
      trace.error("Load messages failed", error);
      trace.end({ phase: "load", result: "error" });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const msgs = messages ?? [];
    trace.info("messages loaded", { count: msgs.length });

    trace.end({ phase: "complete", sessionId: params.id, count: msgs.length });
    return NextResponse.json({
      session: {
        id: session.id,
        title: session.title,
        publicAccessToken: session.public_access_token,
        lastEventId: session.last_event_id,
      },
      state: {
        status: state?.status ?? null,
        pendingApproval: state?.pending_approval ?? null,
        crashedToolCalls,
      },
      messages: msgs.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.created_at,
        ...(m.parts
          ? {
              parts:
                typeof m.parts === "string"
                  ? JSON.parse(m.parts)
                  : m.parts,
            }
          : {}),
      })),
    });
  } catch (error) {
    trace.error("Unhandled GET /api/sessions/[id]/messages error", error);
    trace.end({ phase: "error", result: "internal_error" });
    console.error("[Session Messages] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
