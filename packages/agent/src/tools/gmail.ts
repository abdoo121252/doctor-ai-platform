import { tool } from "ai";
import { z } from "zod";
import type { AgentContext } from "../context";
import { listMessages, sendMessage } from "../google/gmail";
import { logError, logInfo } from "../logger";

export function createReadEmailsTool(ctx: AgentContext) {
  return tool({
    description: "Read the latest emails from the doctor's Gmail inbox",
    inputSchema: z.object({
      count: z.number().default(10).describe("Number of emails to fetch"),
      query: z.string().optional().describe("Optional Gmail search query"),
    }),
    execute: async ({ count, query }) => {
      logInfo("tool:readEmails", "Fetching emails", ctx.doctorId, { count, query });
      try {
        const result = await listMessages(ctx.doctorId, count ?? 3, query, ctx.supabase);
        logInfo("tool:readEmails", `Retrieved ${result.messages.length} emails`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:readEmails", "Failed to fetch emails", err, ctx.doctorId);
        throw err;
      }
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
      logInfo("tool:sendEmail", "Preparing to send", ctx.doctorId, { to: input.to });
      if (ctx.sessionType !== "chat" && ctx.requestApproval) {
        const result = await ctx.requestApproval("send_email", input);
        if (!result.approved) {
          logInfo("tool:sendEmail", "Rejected by doctor", ctx.doctorId);
          throw new Error(
            result.reason ?? "Send email was rejected by doctor"
          );
        }
      }
      try {
        const result = await sendMessage(ctx.doctorId, input.to, input.subject, input.body, ctx.supabase);
        logInfo("tool:sendEmail", "Email sent", ctx.doctorId, { messageId: result.messageId });
        return result;
      } catch (err) {
        logError("tool:sendEmail", "Failed to send", err, ctx.doctorId);
        throw err;
      }
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
