import type { SupabaseClient } from "@supabase/supabase-js";
import { buildChatTools, runChatStep, loadToolSensitivity } from "@repo/agent";
import type { AgentContext } from "@repo/agent";
import { generateId } from "ai";
import { saveChatState, wrapToolOutput } from "./chat-state";

const MAX_STEPS = 10;

export interface ChatTurnOptions {
  supabase: SupabaseClient;
  doctorId: string;
  sessionId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: any[];
  send: (event: Record<string, unknown>) => void;
}

/**
 * Run one agent "turn" as a stateless loop. Each model step is a single
 * `streamText` call (schema-only tools) whose text is streamed to the client.
 * Non-sensitive tools are executed inline; the first sensitive tool pauses the
 * turn by saving the full message context + a pending-approval record and
 * emitting an `approval` event. The turn is always resumed by a later request
 * that passes the saved `messages` array back in.
 */
export async function runChatTurn({
  supabase,
  doctorId,
  sessionId,
  messages,
  send,
}: ChatTurnOptions): Promise<void> {
  const sensitivity = await loadToolSensitivity(doctorId, supabase);

  const context: AgentContext = {
    doctorId,
    sessionType: "chat",
    sessionId,
    supabase,
  };
  const { schemas, executors } = buildChatTools(context);

  let assistantText = "";
  const assistantParts: Array<Record<string, unknown>> = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    let stepText = "";
    const { textStream, toolCalls } = runChatStep({ messages, tools: schemas });

    try {
      for await (const chunk of textStream) {
        stepText += chunk;
        assistantText += chunk;
        send({ type: "text", text: chunk });
      }
    } catch (error) {
      send({
        type: "error",
        error: error instanceof Error ? error.message : "Stream error",
      });
      return;
    }

    if (toolCalls.length === 0) {
      // Final text, no pending tool call — the turn is complete.
      messages.push({ role: "assistant", content: stepText });
      await persistAssistantTurn(
        supabase,
        doctorId,
        sessionId,
        assistantText,
        assistantParts
      );
      await saveChatState(supabase, sessionId, doctorId, {
        status: "completed",
        messages,
      });
      send({ type: "done", sessionId, text: assistantText });
      return;
    }

    const call = toolCalls[0]!;

    // Carry the assistant message (text + tool-call) into the model context.
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

    if (sensitivity[call.toolName as keyof typeof sensitivity]) {
      // Sensitive: do NOT execute. Persist the pause and end the request.
      const approvalId = generateId();
      assistantParts.push({
        type: `tool-${call.toolName}`,
        toolName: call.toolName,
        toolCallId: call.toolCallId,
        state: "approval-requested",
        input: call.input,
        approvalId,
      });
      await persistAssistantTurn(
        supabase,
        doctorId,
        sessionId,
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
      send({
        type: "approval",
        approvalId,
        toolName: call.toolName,
        toolCallId: call.toolCallId,
        input: call.input,
      });
      return;
    }

    // Non-sensitive: execute inline and continue the loop.
    send({
      type: "tool",
      toolCallId: call.toolCallId,
      toolName: call.toolName,
      input: call.input,
    });
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
      send({
        type: "tool-result",
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        output,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tool failed";
      part.output = { error: message };
      part.state = "error";
      send({
        type: "tool-result",
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        output: { error: message },
      });
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

  // Ran out of steps — finalize whatever we have.
  await persistAssistantTurn(
    supabase,
    doctorId,
    sessionId,
    assistantText,
    assistantParts
  );
  await saveChatState(supabase, sessionId, doctorId, {
    status: "completed",
    messages,
  });
  send({ type: "done", sessionId, text: assistantText });
}

async function persistAssistantTurn(
  supabase: SupabaseClient,
  doctorId: string,
  sessionId: string,
  content: string,
  parts: Array<Record<string, unknown>>
): Promise<void> {
  if (!content && parts.length === 0) return;

  const row: Record<string, unknown> = {
    doctor_id: doctorId,
    session_id: sessionId,
    session_type: "chat",
    role: "assistant",
    content,
  };
  if (parts.length > 0) row.parts = parts;

  const { error } = await supabase.from("conversations").insert(row);
  if (error) {
    console.error("[chat-runner] Failed to persist assistant turn:", error);
  }

  await supabase
    .from("chat_sessions")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", sessionId);
}
