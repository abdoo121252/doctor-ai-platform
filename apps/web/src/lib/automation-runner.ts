import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildChatTools,
  runChatStep,
  loadAutomationSensitivity,
} from "@repo/agent";
import type { AgentContext } from "@repo/agent";
import type { AgentToolName, AutomationType } from "@repo/shared";
import { TOOL_ACTION_TYPES } from "@repo/shared";
import { generateId } from "ai";
import {
  saveChatState,
  loadChatState,
  wrapToolOutput,
  resolveToolPart,
} from "./chat-state";

const MAX_STEPS = 10;

export type AutomationRunResult =
  | { status: "completed"; text: string }
  | { status: "awaiting_approval"; approvalId: string; toolName: string };

export interface AutomationTurnOptions {
  supabase: SupabaseClient;
  doctorId: string;
  sessionId: string;
  sessionType: "cron" | "event";
  automationType: AutomationType;
  automationId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: any[];
}

/**
 * Run one automation (cron / event) agent turn using the same stateless loop
 * as chat: schema-only tools, non-sensitive tools executed inline, and the
 * first sensitive tool pauses the turn. Sensitivity is resolved per automation
 * (override -> general -> default). Pausing persists chat_state + an
 * approval_requests row so the doctor can approve/reject on /review and resume
 * the turn later.
 */
export async function runAutomationTurn({
  supabase,
  doctorId,
  sessionId,
  sessionType,
  automationType,
  automationId,
  messages,
}: AutomationTurnOptions): Promise<AutomationRunResult> {
  const sensitivity = await loadAutomationSensitivity(
    doctorId,
    automationType,
    automationId,
    supabase
  );

  const context: AgentContext = {
    doctorId,
    sessionType,
    sessionId,
    supabase,
  };
  const { schemas, executors } = buildChatTools(context);

  let assistantText = "";
  const assistantParts: Array<Record<string, unknown>> = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    let stepText = "";
    const { textStream, toolCalls } = runChatStep({ messages, tools: schemas });

    for await (const chunk of textStream) {
      stepText += chunk;
      assistantText += chunk;
    }

    if (toolCalls.length === 0) {
      messages.push({ role: "assistant", content: stepText });
      await persistAutomationTurn(
        supabase,
        doctorId,
        sessionId,
        sessionType,
        assistantText,
        assistantParts
      );
      await saveChatState(supabase, sessionId, doctorId, {
        status: "completed",
        messages,
      });
      return { status: "completed", text: assistantText };
    }

    const call = toolCalls[0]!;

    messages.push({
      role: "assistant",
      content: [
        ...(stepText ? [{ type: "text", text: stepText }] : []),
        {
          type: "tool-call",
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          input: call.input,
        },
      ],
    });

    if (sensitivity[call.toolName as AgentToolName]) {
      // Sensitive: create an approval_requests row so it shows on /review,
      // then persist the pause and end the turn.
      let approvalId = generateId();
      const { data: approval } = await supabase
        .from("approval_requests")
        .insert({
          doctor_id: doctorId,
          session_id: sessionId,
          action_type: TOOL_ACTION_TYPES[call.toolName as AgentToolName] ?? "other",
          action_payload: (call.input ?? {}) as Record<string, unknown>,
          status: "pending",
        })
        .select()
        .single();
      if (approval) approvalId = (approval as { id: string }).id;

      assistantParts.push({
        type: `tool-${call.toolName}`,
        toolName: call.toolName,
        toolCallId: call.toolCallId,
        state: "approval-requested",
        input: call.input,
        approvalId,
      });
      await persistAutomationTurn(
        supabase,
        doctorId,
        sessionId,
        sessionType,
        assistantText,
        assistantParts
      );
      await saveChatState(supabase, sessionId, doctorId, {
        status: "awaiting_approval",
        messages,
        pendingApproval: {
          approvalId,
          toolName: call.toolName,
          toolCallId: call.toolCallId,
          input: call.input,
        },
      });
      return {
        status: "awaiting_approval",
        approvalId,
        toolName: call.toolName,
      };
    }

    // Non-sensitive: execute inline.
    const part: Record<string, unknown> = {
      type: `tool-${call.toolName}`,
      toolName: call.toolName,
      toolCallId: call.toolCallId,
      state: "complete",
      input: call.input,
    };

    let output: unknown;
    try {
      output = await executors[call.toolName]?.(call.input, call.toolCallId);
      part.output = output;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tool failed";
      part.output = { error: message };
      part.state = "error";
    }

    assistantParts.push(part);
    messages.push({
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          output: wrapToolOutput(output),
        },
      ],
    });
  }

  await persistAutomationTurn(
    supabase,
    doctorId,
    sessionId,
    sessionType,
    assistantText,
    assistantParts
  );
  await saveChatState(supabase, sessionId, doctorId, {
    status: "completed",
    messages,
  });
  return { status: "completed", text: assistantText };
}

/**
 * Resume an automation turn after the doctor approved/rejected the pending
 * sensitive tool. Executes (or rejects) the pending tool call, then continues
 * the loop. The automation metadata (session_type + source_id) is read from
 * the chat_sessions row created by /api/automation/run.
 */
export async function resumeAutomationTurn({
  supabase,
  doctorId,
  sessionId,
  approved,
  revisedInput,
}: {
  supabase: SupabaseClient;
  doctorId: string;
  sessionId: string;
  approved: boolean;
  revisedInput?: unknown;
}): Promise<AutomationRunResult> {
  const state = await loadChatState(supabase, sessionId);
  if (!state || state.status !== "awaiting_approval" || !state.pending_approval) {
    throw new Error("No pending approval for this session");
  }
  const pending = state.pending_approval;

  const { data: session } = await supabase
    .from("chat_sessions")
    .select("session_type, source_id")
    .eq("id", sessionId)
    .single();

  const sessionType: "cron" | "event" =
    session?.session_type === "cron" ? "cron" : "event";
  const automationType: AutomationType =
    sessionType === "cron" ? "scheduled_task" : "event_trigger";
  const automationId: string = session?.source_id ?? "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = Array.isArray(state.messages)
    ? [...(state.messages as any[])]
    : [];

  const finalInput =
    revisedInput !== undefined ? revisedInput : pending.input;

  const context: AgentContext = { doctorId, sessionType, sessionId, supabase };
  const { executors } = buildChatTools(context);

  let resolvedState: "complete" | "rejected" | "error";
  let resolvedOutput: unknown;

  if (!approved) {
    resolvedState = "rejected";
    resolvedOutput = { rejected: true, reason: "Rejected by doctor" };
  } else {
    let output: unknown;
    try {
      output = await executors[pending.toolName]?.(
        finalInput,
        pending.toolCallId
      );
      resolvedState = "complete";
      resolvedOutput = output;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tool failed";
      output = { error: message };
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

  await resolveToolPart(supabase, sessionId, pending.toolCallId, {
    state: resolvedState,
    output: resolvedOutput,
  });

  await saveChatState(supabase, sessionId, doctorId, {
    status: "in_progress",
    messages,
  });

  return runAutomationTurn({
    supabase,
    doctorId,
    sessionId,
    sessionType,
    automationType,
    automationId,
    messages,
  });
}

async function persistAutomationTurn(
  supabase: SupabaseClient,
  doctorId: string,
  sessionId: string,
  sessionType: "cron" | "event",
  content: string,
  parts: Array<Record<string, unknown>>
): Promise<void> {
  if (!content && parts.length === 0) return;

  const row: Record<string, unknown> = {
    doctor_id: doctorId,
    session_id: sessionId,
    session_type: sessionType,
    role: "assistant",
    content,
  };
  if (parts.length > 0) row.parts = parts;

  const { error } = await supabase.from("conversations").insert(row);
  if (error) {
    console.error("[automation-runner] Failed to persist assistant turn:", error);
  }

  await supabase
    .from("chat_sessions")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", sessionId);
}
