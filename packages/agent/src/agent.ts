import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { streamText, generateText, isStepCount } from "ai";
import type { LanguageModel } from "ai";
import { createReadEmailsTool, createSendEmailTool } from "./tools/gmail";
import { createReadCalendarTool, createCreateEventTool } from "./tools/calendar";
import { createSearchDriveTool } from "./tools/drive";
import { createReadSheetTool } from "./tools/sheets";
import {
  createScheduleTaskTool,
  createEventTriggerTool,
} from "./tools/automation";
import {
  createReadOutlookEmailsTool,
  createSendOutlookEmailTool,
  createReadOutlookCalendarTool,
  createCreateOutlookEventTool,
  createSearchOneDriveTool,
  createReadOneDriveFileTool,
} from "./microsoft/tools";
import type { AgentContext } from "./context";
import type { AgentToolName } from "@repo/shared";

const opencode = createOpenAICompatible({
  name: "opencode",
  baseURL: "https://opencode.ai/zen/go/v1",
  apiKey: process.env.OPENAI_API_KEY,
});

export function getModel(): LanguageModel {
  return opencode("deepseek-v4-flash");
}

const SYSTEM_PROMPT = `You are a university professor's personal AI assistant connected to their accounts (Google: Gmail, Calendar, Sheets, Drive — Microsoft: Outlook mail, Outlook calendar, OneDrive).

Your role is to help the professor manage their academic workload efficiently. You can:
- Read and summarize emails (Gmail or Outlook)
- Send emails (requires approval in automated sessions)
- Read and manage the calendar (Google Calendar or Outlook calendar)
- Create calendar events (requires approval in automated sessions with attendees)
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
7. When asked to view emails, calendar, or files, use the available tools rather than pretending.`;

export interface ChatResponse {
  text: string;
  steps: Array<{
    text: string;
    toolCalls: Array<{
      toolName: string;
      args: unknown;
      result: unknown;
    }>;
  }>;
}

export interface StreamChatResponse {
  textStream: AsyncIterable<string>;
  steps: ChatResponse["steps"];
}

/**
 * Build the full tool set for an agent session, marking each tool with
 * `needsApproval` when it is sensitive for this doctor. Sensitivity is
 * resolved from `context.toolSensitivity` (already merged with defaults
 * by the caller) — fall back to all non-sensitive if unset.
 */
export function buildTools(context: AgentContext) {
  const sensitive = (name: AgentToolName) =>
    context.toolSensitivity?.[name] ?? false;

  return {
    readEmails: createReadEmailsTool(context),
    sendEmail: createSendEmailTool(context, sensitive("sendEmail")),
    readCalendar: createReadCalendarTool(context),
    createEvent: createCreateEventTool(context, sensitive("createEvent")),
    searchDrive: createSearchDriveTool(context, sensitive("searchDrive")),
    readSheet: createReadSheetTool(context, sensitive("readSheet")),
    readOutlookEmails: createReadOutlookEmailsTool(context),
    sendOutlookEmail: createSendOutlookEmailTool(
      context,
      sensitive("sendOutlookEmail")
    ),
    readOutlookCalendar: createReadOutlookCalendarTool(context),
    createOutlookEvent: createCreateOutlookEventTool(
      context,
      sensitive("createOutlookEvent")
    ),
    searchOneDrive: createSearchOneDriveTool(
      context,
      sensitive("searchOneDrive")
    ),
    readOneDriveFile: createReadOneDriveFileTool(
      context,
      sensitive("readOneDriveFile")
    ),
    scheduleTask: createScheduleTaskTool(context),
    createEventTrigger: createEventTriggerTool(context),
  };
}

export async function generateChatResponse({
  context,
  messages,
}: {
  context: AgentContext;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<ChatResponse> {
  const { textStream, steps } = streamChatResponse({ context, messages });

  let text = "";
  for await (const chunk of textStream) {
    text += chunk;
  }

  return { text, steps };
}

/**
 * Ask the model to rewrite a pending tool-call input according to a
 * natural-language instruction (the doctor's edit request). Returns the
 * revised input object, or null if the model did not return valid JSON.
 */
export async function rewriteToolInput({
  toolName,
  input,
  instruction,
  conversation,
}: {
  toolName: string;
  input: unknown;
  instruction: string;
  conversation?: Array<{ role: "user" | "assistant" | "tool"; content: string }>;
}): Promise<unknown | null> {
  const model = getModel();

  const { text } = await generateText({
    model,
    system: SYSTEM_PROMPT,
    prompt: [
      `You are the professor's AI assistant, mid-conversation. A tool call is waiting for approval, and the professor wants you to adjust the tool's arguments based on their instruction. You have the FULL conversation context below — use it to resolve any references in the instruction (names, dates, email addresses, file references, etc.).`,
      ``,
      `=== Conversation so far ===`,
      ...(conversation && conversation.length > 0
        ? conversation.map(
            (m) => `${m.role === "tool" ? "tool-result" : m.role}: ${m.content}`
          )
        : ["(no prior messages)"]),
      ``,
      `=== Tool call to modify ===`,
      `Tool: ${toolName}`,
      `Current input:`,
      `\`\`\`json`,
      JSON.stringify(input ?? {}, null, 2),
      `\`\`\``,
      ``,
      `Professor's instruction: ${instruction}`,
      ``,
      `The instruction is EITHER a plain-language change request OR the professor's directly-edited JSON for the tool input. If it parses as valid JSON, treat it as the final desired input (just normalize and return it, preserving its fields). Otherwise, apply the requested change to the current input.`,
      ``,
      `Return ONLY the revised tool input as a single JSON object, with no explanation, no markdown fences, and no code block markers. Keep every field the schema needs, changing only what the instruction requires.`,
    ].join("\n"),
    temperature: 0,
  });

  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

export function streamChatResponse({
  context,
  messages,
}: {
  context: AgentContext;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}): StreamChatResponse {
  const model = getModel();
  const steps: ChatResponse["steps"] = [];

  const result = streamText({
    model,
    system: SYSTEM_PROMPT,
    messages,
    tools: buildTools(context),
    stopWhen: isStepCount(10),
    onStepFinish: ({ text, toolCalls, toolResults }) => {
      steps.push({
        text,
        toolCalls: toolCalls.map((call, i) => ({
          toolName: call.toolName,
          args: call.input,
          result: toolResults[i]?.output ?? null,
        })),
      });
    },
  });

  return {
    textStream: result.textStream,
    steps,
  };
}

/**
 * A single model step for the manual chat loop: run one `streamText` step
 * (stops after the first step) with a schema-only toolset so the SDK returns
 * tool calls instead of executing them. The caller decides whether to execute
 * a tool (sensitivity gate / approval) and feeds the tool result back as the
 * next message. Returns the text stream plus the tool calls captured for this
 * step (populated once the stream is fully consumed).
 */
export interface ChatStepToolCall {
  toolCallId: string;
  toolName: string;
  input: unknown;
}

export interface ChatStepResult {
  textStream: AsyncIterable<string>;
  toolCalls: ChatStepToolCall[];
}

export function runChatStep({
  messages,
  tools,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools: Record<string, any>;
}): ChatStepResult {
  const model = getModel();
  const toolCalls: ChatStepToolCall[] = [];

  const result = streamText({
    model,
    system: SYSTEM_PROMPT,
    messages,
    tools,
    stopWhen: isStepCount(1),
    onStepFinish: ({ toolCalls: calls }) => {
      for (const c of calls) {
        toolCalls.push({
          toolCallId: c.toolCallId,
          toolName: c.toolName,
          input: c.input,
        });
      }
    },
  });

  return { textStream: result.textStream, toolCalls };
}

/**
 * Build a chat toolset for the manual loop: schema-only tools (so the SDK
 * never auto-executes) plus a map of `name -> execute(input, toolCallId)`
 * closures. Sensitivity is intentionally NOT applied here — the caller loads
 * `toolSensitivity` separately and decides whether to execute or pause.
 */
export interface ChatTools {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schemas: Record<string, any>;
  executors: Record<
    string,
    (input: unknown, toolCallId: string) => Promise<unknown> | unknown
  >;
}

export function buildChatTools(context: AgentContext): ChatTools {
  const tools = buildTools(context) as Record<
    string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >;
  const schemas: ChatTools["schemas"] = {};
  const executors: ChatTools["executors"] = {};

  for (const [name, t] of Object.entries(tools)) {
    schemas[name] = {
      description: t.description,
      inputSchema: t.inputSchema ?? t.parameters,
    };
    if (typeof t.execute === "function") {
      executors[name] = (input: unknown, toolCallId: string) =>
        t.execute(input, { toolCallId });
    }
  }

  return { schemas, executors };
}
