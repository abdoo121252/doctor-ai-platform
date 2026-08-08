import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { generateChatResponse, logWithClient } from "@repo/agent";
import type { AgentContext } from "@repo/agent";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { message, sessionType = "chat" } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    const doctorId = auth.user.id;
    await logWithClient(supabase, {
      level: "info",
      source: "chat",
      message: "Processing message",
      doctor_id: doctorId,
      details: { sessionType, msgLen: message.length },
    });

    const { data: history } = await supabase
      .from("conversations")
      .select("*")
      .eq("doctor_id", doctorId)
      .order("created_at", { ascending: true })
      .limit(20);

    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
      ...(history ?? []).map(
        (m: { role: string; content: string }) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })
      ),
      { role: "user" as const, content: message },
    ];

    const context: AgentContext = {
      doctorId,
      sessionType: sessionType as "chat" | "cron" | "event",
      supabase,
    };

    const response = await generateChatResponse({ context, messages });

    const { error: insertError } = await supabase.from("conversations").insert([
      { doctor_id: doctorId, session_type: sessionType, role: "user", content: message },
      {
        doctor_id: doctorId,
        session_type: sessionType,
        role: "assistant",
        content: response.text,
      },
    ]);

    if (insertError) {
      await logWithClient(supabase, {
        level: "error",
        source: "chat",
        message: "Failed to save conversation",
        doctor_id: doctorId,
        details: { code: insertError.code, message: insertError.message },
      });
    }

    return NextResponse.json({
      text: response.text,
      steps: response.steps,
    });
  } catch (error) {
    console.error("[Chat API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
