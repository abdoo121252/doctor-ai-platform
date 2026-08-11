"use server";

import { chat } from "@trigger.dev/sdk/ai";
import { auth } from "@trigger.dev/sdk";
import { createServerSupabase } from "@/lib/supabase-server";
import { createTrace } from "@/lib/request-trace";

const CHAT_TASK_ID = "doctor-chat";

/**
 * Return the authenticated doctor's id (used client-side to wire
 * clientData into the chat transport so every message carries it).
 */
export async function getCurrentDoctorId(): Promise<string> {
  const supabase = await createServerSupabase();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    throw new Error("Unauthorized");
  }
  return authData.user.id;
}

/**
 * Start (or resume) a chat session for the authenticated doctor.
 * Creates the Session on Trigger.dev, wires the doctor id into
 * clientData, and returns a session-scoped public access token for the
 * browser transport.
 */
export async function startChatSession({
  chatId,
}: {
  chatId: string;
  clientData?: { doctorId?: string };
}) {
  const trace = createTrace();
  trace.phase("start-chat-session", { chatId });

  const supabase = await createServerSupabase();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    trace.error("Unauthorized", new Error("No auth user"));
    trace.end({ phase: "auth", result: "unauthorized" });
    throw new Error("Unauthorized");
  }
  const doctorId = authData.user.id;
  trace.info("doctor", { doctorId });

  // Ensure the chat session belongs to this doctor
  const { data: session } = await supabase
    .from("chat_sessions")
    .select("id")
    .eq("id", chatId)
    .eq("doctor_id", doctorId)
    .maybeSingle();

  if (!session) {
    trace.error("Session not found", new Error("Session not found"), {
      chatId,
    });
    trace.end({ phase: "session-check", result: "not_found" });
    throw new Error("Session not found");
  }

  const start = chat.createStartSessionAction(CHAT_TASK_ID);
  const result = await start({
    chatId,
    clientData: { doctorId },
  });

  trace.end({ phase: "started", sessionId: result.sessionId });
  return result;
}

/**
 * Mint a short-lived public access token for the chat transport to use
 * when the current token expires (401/403).
 */
export async function mintChatAccessToken(chatId: string) {
  const trace = createTrace();
  trace.phase("mint-chat-access-token", { chatId });

  const supabase = await createServerSupabase();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    trace.error("Unauthorized", new Error("No auth user"));
    trace.end({ phase: "auth", result: "unauthorized" });
    throw new Error("Unauthorized");
  }

  const { data: session } = await supabase
    .from("chat_sessions")
    .select("id")
    .eq("id", chatId)
    .eq("doctor_id", authData.user.id)
    .maybeSingle();

  if (!session) {
    trace.error("Session not found", new Error("Session not found"), {
      chatId,
    });
    trace.end({ phase: "session-check", result: "not_found" });
    throw new Error("Session not found");
  }

  const token = await auth.createPublicToken({
    scopes: { read: { sessions: chatId }, write: { sessions: chatId } },
    expirationTime: "1h",
  });

  trace.end({ phase: "minted" });
  return token;
}
