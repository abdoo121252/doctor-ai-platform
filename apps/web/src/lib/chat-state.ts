import type { SupabaseClient } from "@supabase/supabase-js";

export type ChatStateStatus = "in_progress" | "awaiting_approval" | "completed";

export interface PendingApproval {
  approvalId: string;
  toolName: string;
  toolCallId: string;
  input: unknown;
}

export interface ChatStateRow {
  session_id: string;
  doctor_id: string;
  status: ChatStateStatus;
  messages: unknown;
  pending_approval: PendingApproval | null;
  updated_at: string;
}

export async function loadChatState(
  supabase: SupabaseClient,
  sessionId: string
): Promise<ChatStateRow | null> {
  const { data } = await supabase
    .from("chat_state")
    .select("*")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (!data) return null;
  const row = data as ChatStateRow;
  return {
    ...row,
    pending_approval: (row.pending_approval as PendingApproval | null) ?? null,
  };
}

export async function saveChatState(
  supabase: SupabaseClient,
  sessionId: string,
  doctorId: string,
  {
    status,
    messages,
    pendingApproval,
  }: {
    status: ChatStateStatus;
    messages: unknown;
    pendingApproval?: PendingApproval | null;
  }
): Promise<void> {
  const { error } = await supabase.from("chat_state").upsert(
    {
      session_id: sessionId,
      doctor_id: doctorId,
      status,
      messages,
      pending_approval: pendingApproval ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "session_id" }
  );
  if (error) {
    console.error("[chat-state] Failed to save chat state:", error);
  }
}

/**
 * Wrap a raw tool output into the AI SDK v7 `ToolResultOutput` shape. The SDK
 * validates `tool-result` content against a discriminated union on `type`
 * (`{ type: 'json' | 'text' | 'error-json' | ... , value }`), so feeding a raw
 * object (e.g. `{ sent: true }`) into the model context throws
 * `InvalidPromptError` and kills the turn.
 */
export function wrapToolOutput(output: unknown): Record<string, unknown> {
  if (output === undefined || output === null) {
    return { type: "text", value: "" };
  }
  try {
    const value = JSON.parse(JSON.stringify(output));
    return { type: "json", value };
  } catch {
    return { type: "text", value: String(output) };
  }
}

export async function logToolStart(
  supabase: SupabaseClient,
  {
    sessionId,
    doctorId,
    toolCallId,
    toolName,
    input,
  }: {
    sessionId: string;
    doctorId: string;
    toolCallId: string;
    toolName: string;
    input: unknown;
  }
): Promise<void> {
  const { error } = await supabase.from("tool_execution_log").insert({
    session_id: sessionId,
    doctor_id: doctorId,
    tool_call_id: toolCallId,
    tool_name: toolName,
    status: "started",
    input,
    started_at: new Date().toISOString(),
  });
  if (error) {
    console.error("[chat-state] Failed to log tool start:", error);
  }
}

export async function logToolFinish(
  supabase: SupabaseClient,
  {
    sessionId,
    toolCallId,
    status,
    output,
    error,
  }: {
    sessionId: string;
    toolCallId: string;
    status: "completed" | "failed";
    output?: unknown;
    error?: string;
  }
): Promise<void> {
  const { error: updateError } = await supabase
    .from("tool_execution_log")
    .update({
      status,
      output: output ?? null,
      error: error ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq("session_id", sessionId)
    .eq("tool_call_id", toolCallId)
    .eq("status", "started");
  if (updateError) {
    console.error("[chat-state] Failed to log tool finish:", updateError);
  }
}

/**
 * Update a persisted `approval-requested` tool part in the `conversations`
 * transcript to its resolved state after the doctor approves/rejects it. This
 * keeps the on-reload transcript from showing a stale "requires approval" card.
 */
export async function resolveToolPart(
  supabase: SupabaseClient,
  sessionId: string,
  toolCallId: string,
  { state, output }: { state: "complete" | "rejected" | "error"; output?: unknown }
): Promise<void> {
  const { data } = await supabase
    .from("conversations")
    .select("id, parts")
    .eq("session_id", sessionId)
    .eq("role", "assistant");
  if (!data) return;

  for (const row of data as Array<{ id: string; parts: unknown }>) {
    let parts: Array<Record<string, unknown>>;
    if (Array.isArray(row.parts)) {
      parts = row.parts;
    } else if (typeof row.parts === "string") {
      try {
        parts = JSON.parse(row.parts);
      } catch {
        continue;
      }
    } else {
      continue;
    }

    let changed = false;
    for (const p of parts) {
      if (p?.toolCallId === toolCallId && p?.state === "approval-requested") {
        p.state = state;
        if (output !== undefined) p.output = output;
        changed = true;
      }
    }
    if (changed) {
      const { error } = await supabase
        .from("conversations")
        .update({ parts })
        .eq("id", row.id);
      if (error) {
        console.error("[chat-state] Failed to resolve tool part:", error);
      }
    }
  }
}

/**
 * Detect a sensitive tool that started executing but never recorded a
 * completed/failed marker — i.e. the process crashed mid-execution. Returns the
 * orphaned tool_call_id(s) so the UI can warn the doctor instead of retrying.
 */
export async function findCrashedToolExecutions(
  supabase: SupabaseClient,
  sessionId: string
): Promise<string[]> {
  const { data: started } = await supabase
    .from("tool_execution_log")
    .select("tool_call_id")
    .eq("session_id", sessionId)
    .eq("status", "started");

  if (!started || started.length === 0) return [];

  const toolCallIds = Array.from(
    new Set(started.map((r) => (r as { tool_call_id: string }).tool_call_id))
  );

  const { data: finished } = await supabase
    .from("tool_execution_log")
    .select("tool_call_id")
    .eq("session_id", sessionId)
    .in("status", ["completed", "failed"]);

  const finishedIds = new Set(
    (finished ?? []).map((r) => (r as { tool_call_id: string }).tool_call_id)
  );

  return toolCallIds.filter((id) => !finishedIds.has(id));
}
