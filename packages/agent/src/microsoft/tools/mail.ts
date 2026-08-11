import { tool } from "ai";
import { z } from "zod";
import type { AgentContext } from "../../context";
import { listOutlookMessages, sendOutlookMessage } from "../mail";
import { logError, logInfo } from "../../logger";

export function createReadOutlookEmailsTool(ctx: AgentContext) {
  return tool({
    description: "Read the latest emails from the doctor's Outlook inbox",
    inputSchema: z.object({
      count: z.number().default(10).describe("Number of emails to fetch"),
      query: z.string().optional().describe("Optional search query"),
    }),
    execute: async ({ count, query }) => {
      logInfo("tool:readOutlookEmails", "Fetching Outlook emails", ctx.doctorId, { count, query });
      try {
        const result = await listOutlookMessages(ctx.doctorId, count ?? 3, query, ctx.supabase);
        logInfo("tool:readOutlookEmails", `Retrieved ${result.messages.length} emails`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:readOutlookEmails", "Failed to fetch Outlook emails", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createSendOutlookEmailTool(ctx: AgentContext, needsApproval = false) {
  return tool({
    description:
      "Send an email from the doctor's Outlook account. Requires approval in automated sessions.",
    inputSchema: z.object({
      to: z.string().describe("Recipient email address"),
      subject: z.string().describe("Email subject"),
      body: z.string().describe("Email body"),
    }),
    needsApproval,
    execute: async (input) => {
      logInfo("tool:sendOutlookEmail", "Preparing to send", ctx.doctorId, { to: input.to });
      if (ctx.sessionType !== "chat" && ctx.requestApproval) {
        const result = await ctx.requestApproval("send_email", input);
        if (!result.approved) {
          logInfo("tool:sendOutlookEmail", "Rejected by doctor", ctx.doctorId);
          throw new Error(
            result.reason ?? "Send email was rejected by doctor"
          );
        }
      }
      try {
        const result = await sendOutlookMessage(ctx.doctorId, input.to, input.subject, input.body, ctx.supabase);
        logInfo("tool:sendOutlookEmail", "Email sent", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:sendOutlookEmail", "Failed to send", err, ctx.doctorId);
        throw err;
      }
    },
  });
}
