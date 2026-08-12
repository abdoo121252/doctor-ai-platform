import "./ws-polyfill";
import { createClient } from "@supabase/supabase-js";

let _supabase: ReturnType<typeof createClient> | null = null;

export function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
  }
  return _supabase;
}

/**
 * Resolve the owning doctor for a chat session from the DB. Used as a
 * fallback when the run's `clientData.doctorId` is missing (e.g. sessions
 * started before clientData was wired, or resumed via realtime append).
 * Returns null if the row doesn't exist.
 */
export async function resolveDoctorId(chatId: string): Promise<string | null> {
  if (!chatId) return null;
  const supabase = getSupabase();
  const { data } = await supabase
    .from("chat_sessions")
    .select("doctor_id")
    .eq("id", chatId)
    .maybeSingle();
  return data?.doctor_id ?? null;
}

/** Extract plain text from a UIMessage's parts (text + tool inputs/outputs). */
function extractTextFromUIMessage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  message: any
): string {
  if (!message?.parts || !Array.isArray(message.parts)) {
    return typeof message?.content === "string" ? message.content : "";
  }
  const chunks: string[] = [];
  for (const part of message.parts) {
    if (part.type === "text" && typeof part.text === "string") {
      chunks.push(part.text);
    } else if (
      (part.type === "tool-invocation" || part.type.startsWith("tool-")) &&
      part.input
    ) {
      try {
        chunks.push(
          `[${part.type}] ${JSON.stringify(part.input)}`
        );
      } catch {
        // ignore non-serializable input
      }
    }
  }
  return chunks.join("\n");
}

/**
 * Extract the structurally meaningful parts of a UIMessage for durable
 * persistence and resume. Keeps text + tool parts (with state, approval,
 * input, output, toolCallId, toolName) so the chat page can rebuild
 * approval cards and tool details after a refresh. Drops transient
 * parts (step-start, reasoning, finish markers) and the parts array when
 * there is nothing to keep. Returns null when no meaningful parts exist.
 */
function extractPartsFromUIMessage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  message: any
): Record<string, unknown>[] | null {
  if (!message?.parts || !Array.isArray(message.parts)) return null;
  const keep: Record<string, unknown>[] = [];
  for (const part of message.parts) {
    if (!part || typeof part !== "object") continue;
    if (part.type === "text" && typeof part.text === "string") {
      keep.push({ type: "text", text: part.text });
      continue;
    }
    if (
      part.type === "tool-invocation" ||
      (typeof part.type === "string" && part.type.startsWith("tool-"))
    ) {
      const p: Record<string, unknown> = {
        type: part.type,
        state: part.state,
      };
      if (part.toolCallId != null) p.toolCallId = part.toolCallId;
      if (part.toolName != null) p.toolName = part.toolName;
      if (part.input != null) p.input = part.input;
      if (part.output != null) p.output = part.output;
      if (part.approval != null) p.approval = part.approval;
      if (part.errorText != null) p.errorText = part.errorText;
      keep.push(p);
    }
  }
  return keep.length > 0 ? keep : null;
}

/**
 * Persist the full conversation for a doctor + session into the
 * `conversations` table. Overwrite-style (delete + insert) so it is
 * idempotent across turns and continuation runs — safe to call from
 * onTurnStart and onTurnComplete. Returns void; never throws.
 */
export async function persistTurnMessages(
  doctorId: string,
  chatId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  uiMessages: any[]
): Promise<void> {
  if (!doctorId || !chatId || uiMessages.length === 0) return;
  const supabase = getSupabase();

  const rows = uiMessages
    .filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (m: any) => m?.role === "user" || m?.role === "assistant"
    )
    .map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (m: any) => ({
        doctor_id: doctorId,
        session_id: chatId,
        session_type: "chat",
        role: m.role as "user" | "assistant",
        content: extractTextFromUIMessage(m),
        parts: extractPartsFromUIMessage(m),
      })
    );

  if (rows.length === 0) return;

  const { error: deleteError } = await supabase
    .from("conversations")
    .delete()
    .eq("session_id", chatId)
    .eq("doctor_id", doctorId);

  if (deleteError) {
    console.error("[chat-persist] Failed to clear conversation rows:", deleteError);
    return;
  }

  const { error } = await supabase.from("conversations").insert(rows);
  if (error) {
    console.error("[chat-persist] Failed to insert conversation rows:", error);
  }
}

/**
 * Persist the transport resume state (publicAccessToken + lastEventId)
 * on the chat_sessions row. Written atomically with the message insert
 * where possible; failing here only costs a duplicate-chunk risk on a
 * refresh, never a broken chat.
 */
export async function persistSessionState(
  chatId: string,
  doctorId: string,
  publicAccessToken: string,
  lastEventId?: string
): Promise<void> {
  if (!chatId || !doctorId) return;
  const supabase = getSupabase();

  const { error } = await supabase
    .from("chat_sessions")
    .update({
      public_access_token: publicAccessToken,
      last_event_id: lastEventId ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", chatId)
    .eq("doctor_id", doctorId);

  if (error) {
    console.error("[chat-persist] Failed to persist session state:", error);
  }
}
