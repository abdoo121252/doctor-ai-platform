import { task } from "@trigger.dev/sdk/v3";
import { generateChatResponse } from "@repo/agent";
import type { AgentContext } from "@repo/agent";
import { createTriggerApprovalHandler } from "../approval-handler";

export const chatSession = task({
  id: "doctor-chat-session",
  run: async (payload: { doctorId: string; message: string; sessionType?: "chat" | "cron" | "event" }) => {
    const { doctorId, message, sessionType = "chat" } = payload;

    const context: AgentContext = {
      doctorId,
      sessionType,
      requestApproval:
        sessionType !== "chat"
          ? createTriggerApprovalHandler(doctorId)
          : undefined,
    };

    const history: Array<{ role: "user" | "assistant"; content: string }> = [];
    const messages = [...history, { role: "user" as const, content: message }];

    const response = await generateChatResponse({ context, messages });

    return {
      text: response.text,
      steps: response.steps,
    };
  },
});
