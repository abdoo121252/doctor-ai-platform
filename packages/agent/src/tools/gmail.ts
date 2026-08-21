import { tool } from "ai";
import { z } from "zod";
import type { AgentContext } from "../context";
import {
  listMessages,
  sendMessage,
  getMessage,
  getMessagesBatch,
  getAttachment,
  getThread,
  getThreadsBatch,
  modifyLabels,
  batchModifyLabels,
  listLabels,
  manageLabel,
  draftMessage,
  listFilters,
  manageFilter,
} from "../google/gmail";
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

export function createSendEmailTool(ctx: AgentContext, needsApproval = false) {
  return tool({
    description:
      "Send an email from the doctor's Gmail account. Requires approval in automated sessions.",
    inputSchema: z.object({
      to: z.string().describe("Recipient email address"),
      subject: z.string().describe("Email subject"),
      body: z.string().describe("Email body"),
    }),
    needsApproval: needsApproval,
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

export function createSearchGmailMessagesTool(ctx: AgentContext) {
  return tool({
    description: "Search Gmail messages by query",
    inputSchema: z.object({
      query: z.string().describe("Gmail search query"),
      maxResults: z.number().default(10).describe("Maximum number of results"),
    }),
    execute: async ({ query, maxResults }) => {
      logInfo("tool:searchGmailMessages", "Searching Gmail", ctx.doctorId, { query, maxResults });
      try {
        const result = await listMessages(ctx.doctorId, maxResults ?? 10, query, ctx.supabase);
        logInfo("tool:searchGmailMessages", `Found ${result.messages.length} messages`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:searchGmailMessages", "Failed to search Gmail", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createGetGmailMessageTool(ctx: AgentContext) {
  return tool({
    description: "Get full content of a specific Gmail message by ID",
    inputSchema: z.object({
      messageId: z.string().describe("Gmail message ID"),
    }),
    execute: async ({ messageId }) => {
      logInfo("tool:getGmailMessage", "Fetching Gmail message", ctx.doctorId, { messageId });
      try {
        const result = await getMessage(ctx.doctorId, messageId, ctx.supabase);
        logInfo("tool:getGmailMessage", "Fetched Gmail message", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:getGmailMessage", "Failed to fetch Gmail message", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createGetGmailMessagesBatchTool(ctx: AgentContext) {
  return tool({
    description: "Get full content of multiple Gmail messages by IDs",
    inputSchema: z.object({
      messageIds: z.array(z.string()).describe("Array of Gmail message IDs"),
    }),
    execute: async ({ messageIds }) => {
      logInfo("tool:getGmailMessagesBatch", "Fetching Gmail messages batch", ctx.doctorId, { count: messageIds.length });
      try {
        const result = await getMessagesBatch(ctx.doctorId, messageIds, ctx.supabase);
        logInfo("tool:getGmailMessagesBatch", `Fetched ${result.length} messages`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:getGmailMessagesBatch", "Failed to fetch Gmail messages batch", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createGetGmailAttachmentTool(ctx: AgentContext) {
  return tool({
    description: "Get content of a Gmail attachment",
    inputSchema: z.object({
      messageId: z.string().describe("Gmail message ID"),
      attachmentId: z.string().describe("Gmail attachment ID"),
    }),
    execute: async ({ messageId, attachmentId }) => {
      logInfo("tool:getGmailAttachment", "Fetching Gmail attachment", ctx.doctorId, { messageId, attachmentId });
      try {
        const result = await getAttachment(ctx.doctorId, messageId, attachmentId, ctx.supabase);
        logInfo("tool:getGmailAttachment", "Fetched Gmail attachment", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:getGmailAttachment", "Failed to fetch Gmail attachment", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createGetGmailThreadTool(ctx: AgentContext) {
  return tool({
    description: "Get full content of a Gmail thread by ID",
    inputSchema: z.object({
      threadId: z.string().describe("Gmail thread ID"),
    }),
    execute: async ({ threadId }) => {
      logInfo("tool:getGmailThread", "Fetching Gmail thread", ctx.doctorId, { threadId });
      try {
        const result = await getThread(ctx.doctorId, threadId, ctx.supabase);
        logInfo("tool:getGmailThread", "Fetched Gmail thread", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:getGmailThread", "Failed to fetch Gmail thread", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createGetGmailThreadsBatchTool(ctx: AgentContext) {
  return tool({
    description: "Get full content of multiple Gmail threads by IDs",
    inputSchema: z.object({
      threadIds: z.array(z.string()).describe("Array of Gmail thread IDs"),
    }),
    execute: async ({ threadIds }) => {
      logInfo("tool:getGmailThreadsBatch", "Fetching Gmail threads batch", ctx.doctorId, { count: threadIds.length });
      try {
        const result = await getThreadsBatch(ctx.doctorId, threadIds, ctx.supabase);
        logInfo("tool:getGmailThreadsBatch", `Fetched ${result.length} threads`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:getGmailThreadsBatch", "Failed to fetch Gmail threads batch", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createModifyGmailLabelsTool(ctx: AgentContext) {
  return tool({
    description: "Modify labels on a Gmail message",
    inputSchema: z.object({
      messageId: z.string().describe("Gmail message ID"),
      addLabelIds: z.array(z.string()).default([]).describe("Label IDs to add"),
      removeLabelIds: z.array(z.string()).default([]).describe("Label IDs to remove"),
    }),
    execute: async ({ messageId, addLabelIds, removeLabelIds }) => {
      logInfo("tool:modifyGmailLabels", "Modifying Gmail labels", ctx.doctorId, { messageId, addLabelIds: addLabelIds.length, removeLabelIds: removeLabelIds.length });
      try {
        const result = await modifyLabels(ctx.doctorId, messageId, addLabelIds, removeLabelIds, ctx.supabase);
        logInfo("tool:modifyGmailLabels", "Modified Gmail labels", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:modifyGmailLabels", "Failed to modify Gmail labels", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createBatchModifyGmailLabelsTool(ctx: AgentContext) {
  return tool({
    description: "Modify labels on multiple Gmail messages",
    inputSchema: z.object({
      messageIds: z.array(z.string()).describe("Array of Gmail message IDs"),
      addLabelIds: z.array(z.string()).default([]).describe("Label IDs to add"),
      removeLabelIds: z.array(z.string()).default([]).describe("Label IDs to remove"),
    }),
    execute: async ({ messageIds, addLabelIds, removeLabelIds }) => {
      logInfo("tool:batchModifyGmailLabels", "Batch modifying Gmail labels", ctx.doctorId, { count: messageIds.length, addLabelIds: addLabelIds.length, removeLabelIds: removeLabelIds.length });
      try {
        const result = await batchModifyLabels(ctx.doctorId, messageIds, addLabelIds, removeLabelIds, ctx.supabase);
        logInfo("tool:batchModifyGmailLabels", "Batch modified Gmail labels", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:batchModifyGmailLabels", "Failed to batch modify Gmail labels", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createListGmailLabelsTool(ctx: AgentContext) {
  return tool({
    description: "List all Gmail labels",
    inputSchema: z.object({}),
    execute: async () => {
      logInfo("tool:listGmailLabels", "Listing Gmail labels");
      try {
        const result = await listLabels(ctx.doctorId, ctx.supabase);
        logInfo("tool:listGmailLabels", `Found ${result.labels.length} labels`);
        return result;
      } catch (err) {
        logError("tool:listGmailLabels", "Failed to list Gmail labels", err);
        throw err;
      }
    },
  });
}

export function createManageGmailLabelTool(ctx: AgentContext) {
  return tool({
    description: "Create, update, or delete a Gmail label",
    inputSchema: z.object({
      action: z.enum(["create", "update", "delete"]).describe("Action to perform"),
      name: z.string().optional().describe("Label name (for create/update)"),
      labelId: z.string().optional().describe("Label ID (for update/delete)"),
      color: z.object({
        textColor: z.string().optional(),
        backgroundColor: z.string().optional(),
      }).optional().describe("Label color"),
    }),
    execute: async ({ action, name, labelId, color }) => {
      logInfo("tool:manageGmailLabel", `Managing Gmail label: ${action}`, ctx.doctorId, { action, name, labelId, color });
      try {
        const result = await manageLabel(ctx.doctorId, action, name, labelId, color, ctx.supabase);
        logInfo("tool:manageGmailLabel", `Managed Gmail label: ${action}`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:manageGmailLabel", "Failed to manage Gmail label", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createDraftGmailMessageTool(ctx: AgentContext) {
  return tool({
    description: "Create a draft Gmail message",
    inputSchema: z.object({
      to: z.string().describe("Recipient email address"),
      subject: z.string().describe("Email subject"),
      body: z.string().describe("Email body"),
    }),
    execute: async ({ to, subject, body }) => {
      logInfo("tool:draftGmailMessage", "Creating Gmail draft", ctx.doctorId, { to, subject });
      try {
        const result = await draftMessage(ctx.doctorId, to, subject, body, ctx.supabase);
        logInfo("tool:draftGmailMessage", "Created Gmail draft", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:draftGmailMessage", "Failed to create Gmail draft", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createListGmailFiltersTool(ctx: AgentContext) {
  return tool({
    description: "List all Gmail filters",
    inputSchema: z.object({}),
    execute: async () => {
      logInfo("tool:listGmailFilters", "Listing Gmail filters");
      try {
        const result = await listFilters(ctx.doctorId, ctx.supabase);
        logInfo("tool:listGmailFilters", `Found ${result.filters.length} filters`);
        return result;
      } catch (err) {
        logError("tool:listGmailFilters", "Failed to list Gmail filters", err);
        throw err;
      }
    },
  });
}

export function createManageGmailFilterTool(ctx: AgentContext) {
  return tool({
    description: "Create or delete a Gmail filter",
    inputSchema: z.object({
      action: z.enum(["create", "delete"]).describe("Action to perform"),
      filter: z.any().optional().describe("Filter object (for create)"),
      filterId: z.string().optional().describe("Filter ID (for delete)"),
    }),
    execute: async ({ action, filter, filterId }) => {
      logInfo("tool:manageGmailFilter", `Managing Gmail filter: ${action}`, ctx.doctorId, { action, filterId });
      try {
        const result = await manageFilter(ctx.doctorId, action, filter, filterId, ctx.supabase);
        logInfo("tool:manageGmailFilter", `Managed Gmail filter: ${action}`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:manageGmailFilter", "Failed to manage Gmail filter", err, ctx.doctorId);
        throw err;
      }
    },
  });
}
