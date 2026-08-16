import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { createTrace } from "@/lib/request-trace";
import { buildChatTools } from "@repo/agent";
import type { AgentContext } from "@repo/agent";
import {
  loadChatState,
  saveChatState,
  logToolStart,
  logToolFinish,
  resolveToolPart,
  wrapToolOutput,
} from "@/lib/chat-state";
import { runChatTurn } from "@/lib/chat-runner";
import { resumeAutomationTurn } from "@/lib/automation-runner";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const trace = createTrace();
  trace.phase("start", { route: "POST /api/chat/approval" });

  try {
    const supabase = await createServerSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      trace.end({ phase: "auth", result: "unauthorized" });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const doctorId = auth.user.id;

    const body = await request.json().catch(() => null);
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
    const approvalId =
      typeof body?.approvalId === "string" ? body.approvalId : "";
    const approved = body?.approved === true;

    if (!sessionId || !approvalId) {
      trace.end({ phase: "validate", result: "bad_request" });
      return NextResponse.json(
        { error: "sessionId and approvalId are required" },
        { status: 400 }
      );
    }

    const { data: session } = await supabase
      .from("chat_sessions")
      .select("id, session_type")
      .eq("id", sessionId)
      .eq("doctor_id", doctorId)
      .single();
    if (!session) {
      trace.end({ phase: "session-lookup", result: "not_found" });
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    const isAutomation =
      session.session_type === "cron" || session.session_type === "event";

    const state = await loadChatState(supabase, sessionId);
    if (!state || state.status !== "awaiting_approval") {
      trace.end({ phase: "state-lookup", result: "not_awaiting_approval" });
      return NextResponse.json(
        { error: "No pending approval for this session" },
        { status: 409 }
      );
    }

    const pending = state.pending_approval;
    if (!pending || pending.approvalId !== approvalId) {
      trace.end({ phase: "state-lookup", result: "approval_mismatch" });
      return NextResponse.json(
        { error: "Approval id does not match the pending request" },
        { status: 409 }
      );
    }

    // Automation (cron/event) approvals also live in `approval_requests` (the
    // /review queue). Resolve that row AND resume via the automation runner so
    // approving in chat stays in sync with /review.
    if (isAutomation) {
      trace.phase("automation-approval", { sessionId, approved });

      const approvalStatus = approved ? "approved" : "rejected";
      const { error: approvalUpdateError } = await supabase
        .from("approval_requests")
        .update({
          status: approvalStatus,
          resolved_at: new Date().toISOString(),
          rejection_reason: approved ? null : "Rejected by doctor",
        })
        .eq("id", approvalId);

      if (approvalUpdateError) {
        trace.warn("approval_requests update failed", approvalUpdateError);
      }

      let resumeError: string | null = null;
      try {
        const result = await resumeAutomationTurn({
          supabase,
          doctorId,
          sessionId,
          approved,
          revisedInput: body?.input,
        });
        trace.end({ phase: "complete", sessionId, result: result.status });
      } catch (error) {
        resumeError = error instanceof Error ? error.message : "Resume failed";
        trace.error("automation resume failed", error as Error, { sessionId });
      }

      // The automation resume persists the full continuation to chat_state +
      // conversations. Tell the client to reload the transcript (there is no
      // token stream to play back for the automated loop).
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "reload",
                ...(resumeError ? { error: resumeError } : {}),
              })}\n\n`
            )
          );
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
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages: any[] = Array.isArray(state.messages)
      ? [...(state.messages as any[])]
      : [];

    // Apply a revised input (Modify flow) to the pending tool-call message.
    const revisedInput = body?.input;
    if (revisedInput !== undefined) {
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (m?.role !== "assistant" || !Array.isArray(m?.content)) continue;
        for (const part of m.content) {
          if (
            part?.type === "tool-call" &&
            part.toolCallId === pending.toolCallId
          ) {
            part.input = revisedInput;
          }
        }
      }
    }

    const context: AgentContext = {
      doctorId,
      sessionType: "chat",
      sessionId,
      supabase,
    };
    const { executors } = buildChatTools(context);

    let resolvedState: "complete" | "rejected" | "error";
    let resolvedOutput: unknown;

    if (!approved) {
      // Respect the doctor's decision — do not execute, do not retry.
      resolvedState = "rejected";
      resolvedOutput = { rejected: true, reason: "Rejected by doctor" };
    } else {
      const finalInput = revisedInput ?? pending.input;
      await logToolStart(supabase, {
        sessionId,
        doctorId,
        toolCallId: pending.toolCallId,
        toolName: pending.toolName,
        input: finalInput,
      });

      let output: unknown;
      try {
        output = await executors[pending.toolName]?.(
          finalInput,
          pending.toolCallId
        );
        await logToolFinish(supabase, {
          sessionId,
          toolCallId: pending.toolCallId,
          status: "completed",
          output,
        });
        resolvedState = "complete";
        resolvedOutput = output;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Tool execution failed";
        output = { error: message };
        await logToolFinish(supabase, {
          sessionId,
          toolCallId: pending.toolCallId,
          status: "failed",
          output,
          error: message,
        });
        resolvedState = "error";
        resolvedOutput = output;
      }
    }

    messages.push({
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: pending.toolCallId,
          toolName: pending.toolName,
          output: wrapToolOutput(resolvedOutput),
        },
      ],
    });

    // Keep the persisted transcript accurate so a reload does not show a stale
    // "requires approval" card.
    await resolveToolPart(supabase, sessionId, pending.toolCallId, {
      state: resolvedState,
      output: resolvedOutput,
    });

    // Move the state forward before continuing so a crash during the resumed
    // loop resumes as a continuation, not a re-approval.
    await saveChatState(supabase, sessionId, doctorId, {
      status: "in_progress",
      messages,
    });

    trace.phase("resume-loop", { sessionId, approved });

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
          // Let the client resolve the approval card before streaming the
          // continuation text.
          send({
            type: "tool-result",
            toolCallId: pending.toolCallId,
            toolName: pending.toolName,
            output: resolvedOutput,
          });

          await runChatTurn({
            supabase,
            doctorId,
            sessionId,
            messages,
            send,
          });
        } catch (error) {
          trace.error("Approval resume loop failed", error);
          send({
            type: "error",
            error: error instanceof Error ? error.message : "Internal error",
          });
        }
        trace.end({ phase: "complete", sessionId });
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
    trace.error("Unhandled approval route error", error);
    trace.end({ phase: "error", result: "internal_error" });
    console.error("[Chat Approval] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
