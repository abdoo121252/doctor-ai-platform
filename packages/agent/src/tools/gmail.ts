import { tool } from "ai";
import { z } from "zod";
import type { AgentContext } from "../context";
import { listMessages, sendMessage } from "../google/gmail";

export function createReadEmailsTool(ctx: AgentContext) {
  return tool({
    description: "Read the latest emails from the doctor's Gmail inbox",
    inputSchema: z.object({
      count: z.number().default(10).describe("Number of emails to fetch"),
      query: z.string().optional().describe("Optional Gmail search query"),
    }),
    execute: async ({ count, query }) => {
      return listMessages(ctx.doctorId, count ?? 3, query);
    },
  });
}

export function createSendEmailTool(ctx: AgentContext) {
  return tool({
    description:
      "Send an email from the doctor's Gmail account. Requires approval in automated sessions.",
    inputSchema: z.object({
      to: z.string().describe("Recipient email address"),
      subject: z.string().describe("Email subject"),
      body: z.string().describe("Email body"),
    }),
    execute: async (input) => {
      if (ctx.sessionType !== "chat" && ctx.requestApproval) {
        const result = await ctx.requestApproval("send_email", input);
        if (!result.approved) {
          throw new Error(
            result.reason ?? "Send email was rejected by doctor"
          );
        }
      }
      return sendMessage(ctx.doctorId, input.to, input.subject, input.body);
    },
  });
}

export const readEmails = createReadEmailsTool({
  doctorId: "",
  sessionType: "chat",
});

export const sendEmail = createSendEmailTool({
  doctorId: "",
  sessionType: "chat",
});
