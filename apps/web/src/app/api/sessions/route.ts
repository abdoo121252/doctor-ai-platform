import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { createTrace } from "@/lib/request-trace";

export const dynamic = "force-dynamic";

export async function GET() {
  const trace = createTrace();
  trace.phase("start", { route: "GET /api/sessions" });
  try {
    const supabase = await createServerSupabase();
    const { data: auth } = await supabase.auth.getUser();
    trace.phase("auth", { authenticated: !!auth.user });
    if (!auth.user) {
      trace.error("Unauthorized", new Error("No auth user"));
      trace.end({ phase: "auth", result: "unauthorized" });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    trace.info("doctor", { doctorId: auth.user.id });

    const { data, error } = await supabase
      .from("chat_sessions")
      .select("*")
      .eq("doctor_id", auth.user.id)
      .order("updated_at", { ascending: false });

    if (error) {
      trace.error("List sessions failed", error);
      trace.end({ phase: "query", result: "error" });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const sessions = data ?? [];
    trace.info("sessions loaded", { count: sessions.length });

    if (sessions.length > 0) {
      trace.phase("last-messages");
      const sessionIds = sessions.map((s) => s.id);
      const { data: lastMsgs, error: lastError } = await supabase
        .from("conversations")
        .select("session_id, content")
        .in("session_id", sessionIds)
        .order("created_at", { ascending: false });

      if (lastError) {
        trace.warn("Last-message query failed", lastError);
      }

      const lastBySession: Record<string, string | undefined> = {};
      if (lastMsgs) {
        const seen = new Set<string>();
        for (const m of lastMsgs) {
          if (!seen.has(m.session_id)) {
            lastBySession[m.session_id] = m.content;
            seen.add(m.session_id);
          }
        }
      }
      trace.info("last messages", { count: Object.keys(lastBySession).length });

      trace.end({ phase: "complete", sessions: sessions.length });
      return NextResponse.json(
        sessions.map((s) => ({
          id: s.id,
          title: s.title,
          sessionType: s.session_type,
          createdAt: s.created_at,
          updatedAt: s.updated_at,
          lastMessage: lastBySession[s.id] ?? undefined,
        }))
      );
    }

    trace.end({ phase: "complete", sessions: 0 });
    return NextResponse.json([]);
  } catch (error) {
    trace.error("Unhandled GET /api/sessions error", error);
    trace.end({ phase: "error", result: "internal_error" });
    console.error("[Sessions API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}

export async function POST() {
  const trace = createTrace();
  trace.phase("start", { route: "POST /api/sessions" });
  try {
    const supabase = await createServerSupabase();
    const { data: auth } = await supabase.auth.getUser();
    trace.phase("auth", { authenticated: !!auth.user });
    if (!auth.user) {
      trace.error("Unauthorized", new Error("No auth user"));
      trace.end({ phase: "auth", result: "unauthorized" });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    trace.phase("insert");
    const { data, error } = await supabase
      .from("chat_sessions")
      .insert({ doctor_id: auth.user.id })
      .select()
      .single();

    if (error) {
      trace.error("Create session failed", error);
      trace.end({ phase: "insert", result: "error" });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    trace.info("created", { sessionId: data.id });
    trace.end({ phase: "complete", sessionId: data.id });
    return NextResponse.json({
      id: data.id,
      title: data.title,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    });
  } catch (error) {
    trace.error("Unhandled POST /api/sessions error", error);
    trace.end({ phase: "error", result: "internal_error" });
    console.error("[Sessions API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
