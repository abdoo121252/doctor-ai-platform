import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { createTrace } from "@/lib/request-trace";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const trace = createTrace();
  trace.phase("start", { route: "PATCH /api/sessions/[id]", sessionId: params.id });
  try {
    const supabase = await createServerSupabase();
    const { data: auth } = await supabase.auth.getUser();
    trace.phase("auth", { authenticated: !!auth.user });
    if (!auth.user) {
      trace.error("Unauthorized", new Error("No auth user"));
      trace.end({ phase: "auth", result: "unauthorized" });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { title } = body;
    trace.data("body", { title });

    if (!title || typeof title !== "string" || title.trim().length === 0) {
      trace.info("validation failed", { reason: "title missing" });
      trace.end({ phase: "validate", result: "error" });
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    trace.phase("update", { newTitle: title.trim().slice(0, 120) });
    const { data, error } = await supabase
      .from("chat_sessions")
      .update({ title: title.trim().slice(0, 120) })
      .eq("id", params.id)
      .eq("doctor_id", auth.user.id)
      .select()
      .single();

    if (error) {
      trace.error("Rename session failed", error);
      trace.end({ phase: "update", result: "error" });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    trace.info("renamed", { sessionId: data.id, title: data.title });
    trace.end({ phase: "complete", sessionId: data.id });
    return NextResponse.json({
      id: data.id,
      title: data.title,
    });
  } catch (error) {
    trace.error("Unhandled PATCH /api/sessions/[id] error", error);
    trace.end({ phase: "error", result: "internal_error" });
    console.error("[Session PATCH] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const trace = createTrace();
  trace.phase("start", { route: "DELETE /api/sessions/[id]", sessionId: params.id });
  try {
    const supabase = await createServerSupabase();
    const { data: auth } = await supabase.auth.getUser();
    trace.phase("auth", { authenticated: !!auth.user });
    if (!auth.user) {
      trace.error("Unauthorized", new Error("No auth user"));
      trace.end({ phase: "auth", result: "unauthorized" });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    trace.phase("delete");
    const { error } = await supabase
      .from("chat_sessions")
      .delete()
      .eq("id", params.id)
      .eq("doctor_id", auth.user.id);

    if (error) {
      trace.error("Delete session failed", error);
      trace.end({ phase: "delete", result: "error" });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    trace.info("deleted", { sessionId: params.id });
    trace.end({ phase: "complete", sessionId: params.id });
    return NextResponse.json({ success: true });
  } catch (error) {
    trace.error("Unhandled DELETE /api/sessions/[id] error", error);
    trace.end({ phase: "error", result: "internal_error" });
    console.error("[Session DELETE] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
