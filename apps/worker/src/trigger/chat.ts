import "../ws-polyfill";
import { chat } from "@trigger.dev/sdk/ai";
import { streamText, isStepCount } from "ai";
import { z } from "zod";
import { buildTools, loadToolSensitivity } from "@repo/agent";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  persistTurnMessages,
  persistSessionState,
  resolveDoctorId,
  getSupabase,
} from "../chat-persistence";

const SYSTEM_PROMPT = `You are a university professor's personal AI assistant connected to their accounts (Google: Gmail, Calendar, Sheets, Drive — Microsoft: Outlook mail, Outlook calendar, OneDrive).

Your role is to help the professor manage their academic workload efficiently. You can:
- Read and summarize emails (Gmail or Outlook)
- Send emails (sensitive — pauses for the doctor's approval before sending)
- Read and manage the calendar (Google Calendar or Outlook calendar)
- Create calendar events (sensitive — pauses for approval when attendees are added)
- Search for files in Google Drive or OneDrive
- Read files from OneDrive
- Read Google Sheets

**Important rules:**
1. Be concise and professional — professors have limited time.
2. When presenting information, prioritize by urgency and relevance (teaching, office hours, research deadlines, student/admin matters).
3. Always confirm before summarizing large amounts of data.
4. If you're unsure about something, ask for clarification.
5. If a tool fails because the doctor isn't connected to that provider, tell them to connect it in Settings.
6. You're an administrative assistant supporting academic work (lectures, grading, research, meetings, email) — not a medical or clinical tool.
7. When asked to view emails, calendar, or files, use the available tools rather than pretending.
8. Sensitive tools (sending email, creating events, reading files/sheets/drive) will pause for the doctor's approval before executing. That is expected — do not treat it as an error. When the doctor rejects, respect their decision and do not retry unless asked.`;

const opencode = createOpenAICompatible({
  name: "opencode",
  baseURL: "https://opencode.ai/zen/go/v1",
  apiKey: process.env.OPENAI_API_KEY,
});

function getModel() {
  return opencode("deepseek-v4-flash");
}

const doctorChat = chat.agent({
  id: "doctor-chat",
  clientDataSchema: z
    .object({
      doctorId: z.string(),
    })
    .optional(),
  actionSchema: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("modify-tool-input"),
      messageId: z.string(),
      toolCallId: z.string(),
      input: z.record(z.string(), z.unknown()),
    }),
  ]),
  maxTurns: 20,
  machine: "small-1x",
  idleTimeoutInSeconds: 300,
  tools: async ({ clientData }) => {
    const doctorId = clientData?.doctorId ?? "";
    const supabase = getSupabase();
    const sensitivity = await loadToolSensitivity(doctorId, supabase);
    return buildTools({
      doctorId,
      sessionType: "chat",
      supabase,
      toolSensitivity: sensitivity,
    });
  },
  onTurnStart: async ({ chatId, uiMessages, clientData }) => {
    try {
      const doctorId =
        clientData?.doctorId ?? (await resolveDoctorId(chatId)) ?? "";
      // TEMP DEBUG: dump incoming tool-part approvals
      for (const m of uiMessages ?? []) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const p of (m?.parts ?? []) as any[]) {
          if (p && typeof p === "object" && typeof p.type === "string" && p.type.startsWith("tool-")) {
            console.error("[doctor-chat] DBG tool part", JSON.stringify({ chatId, msgId: m.id, type: p.type, state: p.state, approval: p.approval, toolCallId: p.toolCallId }));
          }
        }
      }
      if (!doctorId) return;
    } catch (e) {
      console.error("[doctor-chat] onTurnStart error:", e);
    }
  },
  onTurnComplete: async ({
    chatId,
    uiMessages,
    clientData,
    chatAccessToken,
    lastEventId,
  }) => {
    try {
      const doctorId =
        clientData?.doctorId ?? (await resolveDoctorId(chatId)) ?? "";
      if (!doctorId) return;
      await persistTurnMessages(doctorId, chatId, uiMessages);
      await persistSessionState(chatId, doctorId, chatAccessToken, lastEventId);
    } catch (e) {
      console.error("[doctor-chat] onTurnComplete error:", e);
    }
  },
  onAction: async ({ action, chatId }) => {
    if (action.type !== "modify-tool-input") return;

    const message = chat.history.findMessage(action.messageId);
    if (!message) {
      console.error("[doctor-chat] onAction: message not found", action.messageId);
      return;
    }

    const revised = {
      ...message,
      parts: message.parts.map((part) => {
        if (
          typeof part.type === "string" &&
          part.type.startsWith("tool-") &&
          "toolCallId" in part &&
          (part as { toolCallId?: string }).toolCallId === action.toolCallId
        ) {
          return { ...part, input: action.input };
        }
        return part;
      }),
    };

    chat.history.replace(action.messageId, revised);
    console.error(
      "[doctor-chat] onAction: modified tool input",
      JSON.stringify({ chatId, messageId: action.messageId, toolCallId: action.toolCallId })
    );
  },
  run: async ({ messages, tools, signal }) => {
    console.error("[doctor-chat] run messages count:", messages.length);
    if (messages.length > 0) {
      console.error("[doctor-chat] first msg role:", messages[0]?.role, "last msg role:", messages[messages.length - 1]?.role);
    }
    const result = streamText({
      ...chat.toStreamTextOptions({ tools }),
      model: getModel(),
      system: SYSTEM_PROMPT,
      messages,
      abortSignal: signal,
      stopWhen: isStepCount(10),
    });
    return result;
  },
});

export { doctorChat };
