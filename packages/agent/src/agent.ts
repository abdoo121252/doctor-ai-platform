import { openai } from "@ai-sdk/openai";
import { generateText, isStepCount } from "ai";
import { createReadEmailsTool, createSendEmailTool } from "./tools/gmail";
import { createReadCalendarTool, createCreateEventTool } from "./tools/calendar";
import { createSearchDriveTool } from "./tools/drive";
import { createReadSheetTool } from "./tools/sheets";
import type { AgentContext } from "./context";

function getModel() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "AI model not configured. Set OPENAI_API_KEY environment variable."
    );
  }
  return openai("gpt-4o");
}

const SYSTEM_PROMPT = `You are a doctor's personal AI assistant connected to their Google account (Gmail, Calendar, Sheets, Drive).

Your role is to help the doctor manage their workload efficiently. You can:
- Read and summarize emails
- Send emails (requires approval in automated sessions)
- Read and manage the calendar
- Create calendar events (requires approval in automated sessions with attendees)
- Search for files in Drive
- Read Google Sheets

**Important rules:**
1. Be concise and professional — doctors have limited time.
2. When presenting information, prioritize by urgency and relevance.
3. Always confirm before summarizing large amounts of data.
4. If you're unsure about something, ask for clarification.
5. Never make medical decisions — you're an administrative assistant, not a clinical tool.
6. When asked to view emails, calendar, or files, use the available tools rather than pretending.`;

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

export async function generateChatResponse({
  context,
  messages,
}: {
  context: AgentContext;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<ChatResponse> {
  const model = getModel();
  const steps: ChatResponse["steps"] = [];

  const result = await generateText({
    model,
    system: SYSTEM_PROMPT,
    messages,
    tools: {
      readEmails: createReadEmailsTool(context),
      sendEmail: createSendEmailTool(context),
      readCalendar: createReadCalendarTool(context),
      createEvent: createCreateEventTool(context),
      searchDrive: createSearchDriveTool(context),
      readSheet: createReadSheetTool(context),
    },
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
    text: result.text,
    steps,
  };
}
