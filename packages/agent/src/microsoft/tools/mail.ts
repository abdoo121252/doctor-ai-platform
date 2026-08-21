import { tool } from "ai";
import { z } from "zod";
import type { AgentContext } from "../../context";
import {
  listOutlookMessages,
  sendOutlookMessage,
  getOutlookMessage,
  getOutlookAttachment,
  replyOutlookMessage,
  createOutlookReplyDraft,
  createOutlookDraft,
  updateOutlookDraft,
  sendOutlookDraft,
  listOutlookDrafts,
  searchOutlookMessages,
  moveOutlookMessages,
  listOutlookFolders,
  createOutlookFolder,
  listOutlookRules,
  createOutlookRule,
  getOutlookFocusedInbox,
  listOutlookCategories,
  createOutlookCategory,
  updateOutlookCategory,
  deleteOutlookCategory,
  applyOutlookCategories,
  removeOutlookCategories,
} from "../mail";
import { logError, logInfo } from "../../logger";

export function createReadOutlookEmailsTool(ctx: AgentContext) {
  return tool({
    description:
      "Read the latest emails from the doctor's Outlook inbox (optionally a specific folder)",
    inputSchema: z.object({
      count: z.number().default(10).describe("Number of emails to fetch"),
      query: z.string().optional().describe("Optional search query"),
      folderId: z.string().optional().describe("Mail folder ID to read from"),
      folderName: z.string().optional().describe("Mail folder name (e.g. Inbox, Archive)"),
    }),
    execute: async ({ count, query, folderId, folderName }) => {
      logInfo("tool:readOutlookEmails", "Fetching Outlook emails", ctx.doctorId, { count, query, folderId, folderName });
      try {
        const result = await listOutlookMessages(
          ctx.doctorId,
          count ?? 10,
          query,
          ctx.supabase,
          { folderId, folderName }
        );
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
      "Send an email from the doctor's Outlook account, with optional CC, BCC and attachments. Requires approval in automated sessions.",
    inputSchema: z.object({
      to: z.union([z.string(), z.array(z.string())]).describe("Recipient email address(es)"),
      subject: z.string().describe("Email subject"),
      body: z.string().describe("Email body (HTML)"),
      cc: z.union([z.string(), z.array(z.string())]).optional().describe("CC recipients"),
      bcc: z.union([z.string(), z.array(z.string())]).optional().describe("BCC recipients"),
      attachments: z
        .array(
          z.object({
            name: z.string().describe("File name"),
            contentBase64: z.string().describe("File content base64-encoded"),
            contentType: z.string().optional().describe("MIME content type"),
          })
        )
        .optional()
        .describe("Attachments (base64 content, max ~3 MB each)"),
      mailbox: z.string().optional().describe("Mailbox address for shared mailboxes"),
    }),
    needsApproval,
    execute: async (input) => {
      logInfo("tool:sendOutlookEmail", "Preparing to send", ctx.doctorId, { to: input.to });
      if (ctx.sessionType !== "chat" && ctx.requestApproval) {
        const result = await ctx.requestApproval("send_email", input);
        if (!result.approved) {
          logInfo("tool:sendOutlookEmail", "Rejected by doctor", ctx.doctorId);
          throw new Error(result.reason ?? "Send email was rejected by doctor");
        }
      }
      try {
        const result = await sendOutlookMessage(
          ctx.doctorId,
          input.to,
          input.subject,
          input.body,
          ctx.supabase,
          {
            cc: input.cc,
            bcc: input.bcc,
            attachments: input.attachments?.map((a) => ({
              name: a.name,
              contentBytes: a.contentBase64,
              contentType: a.contentType,
            })),
            mailbox: input.mailbox,
          }
        );
        logInfo("tool:sendOutlookEmail", "Email sent", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:sendOutlookEmail", "Failed to send", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createReadOutlookMessageTool(ctx: AgentContext) {
  return tool({
    description: "Read a single Outlook email by ID, including full body and attachment metadata",
    inputSchema: z.object({
      emailId: z.string().describe("Outlook message ID"),
      mailbox: z.string().optional().describe("Mailbox address for shared mailboxes"),
    }),
    execute: async ({ emailId, mailbox }) => {
      logInfo("tool:readOutlookMessage", "Fetching Outlook message", ctx.doctorId, { emailId });
      try {
        const result = await getOutlookMessage(ctx.doctorId, emailId, ctx.supabase, mailbox);
        logInfo("tool:readOutlookMessage", `Read message: ${result.subject}`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:readOutlookMessage", "Failed to fetch message", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createGetOutlookAttachmentTool(ctx: AgentContext) {
  return tool({
    description: "Download an attachment from an Outlook email and return its content base64-encoded",
    inputSchema: z.object({
      emailId: z.string().describe("Outlook message ID"),
      attachmentId: z.string().describe("Attachment ID"),
      mailbox: z.string().optional().describe("Mailbox address for shared mailboxes"),
    }),
    execute: async ({ emailId, attachmentId, mailbox }) => {
      logInfo("tool:getOutlookAttachment", "Fetching Outlook attachment", ctx.doctorId, { emailId, attachmentId });
      try {
        const result = await getOutlookAttachment(ctx.doctorId, emailId, attachmentId, ctx.supabase, mailbox);
        logInfo("tool:getOutlookAttachment", `Got attachment: ${result.name}`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:getOutlookAttachment", "Failed to fetch attachment", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createReplyOutlookEmailTool(ctx: AgentContext, needsApproval = false) {
  return tool({
    description: "Reply to an Outlook email (or reply-all). Sends immediately. Requires approval in automated sessions.",
    inputSchema: z.object({
      emailId: z.string().describe("Outlook message ID to reply to"),
      body: z.string().describe("Reply body (HTML)"),
      replyAll: z.boolean().default(false).describe("Reply to all recipients"),
      to: z.union([z.string(), z.array(z.string())]).optional().describe("Override reply recipients"),
      cc: z.union([z.string(), z.array(z.string())]).optional().describe("CC recipients"),
      attachments: z
        .array(
          z.object({
            name: z.string().describe("File name"),
            contentBase64: z.string().describe("File content base64-encoded"),
            contentType: z.string().optional().describe("MIME content type"),
          })
        )
        .optional()
        .describe("Attachments"),
      mailbox: z.string().optional().describe("Mailbox address for shared mailboxes"),
    }),
    needsApproval,
    execute: async (input) => {
      if (ctx.sessionType !== "chat" && ctx.requestApproval) {
        const result = await ctx.requestApproval("send_email", input);
        if (!result.approved) {
          throw new Error(result.reason ?? "Reply was rejected by doctor");
        }
      }
      try {
        const result = await replyOutlookMessage(
          ctx.doctorId,
          input.emailId,
          input.body,
          ctx.supabase,
          {
            replyAll: input.replyAll,
            to: input.to,
            cc: input.cc,
            attachments: input.attachments?.map((a) => ({
              name: a.name,
              contentBytes: a.contentBase64,
              contentType: a.contentType,
            })),
            mailbox: input.mailbox,
          }
        );
        logInfo("tool:replyOutlookEmail", "Reply sent", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:replyOutlookEmail", "Failed to send reply", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createDraftOutlookReplyAllTool(ctx: AgentContext) {
  return tool({
    description:
      "Create a threaded reply-all draft for an Outlook email. Does NOT send it — the doctor can review before sending.",
    inputSchema: z.object({
      emailId: z.string().describe("Outlook message ID to reply to"),
      body: z.string().describe("Draft body (HTML)"),
      to: z.union([z.string(), z.array(z.string())]).optional().describe("Override reply recipients"),
      cc: z.union([z.string(), z.array(z.string())]).optional().describe("CC recipients"),
      mailbox: z.string().optional().describe("Mailbox address for shared mailboxes"),
    }),
    execute: async (input) => {
      logInfo("tool:draftOutlookReplyAll", "Creating reply-all draft", ctx.doctorId, { emailId: input.emailId });
      try {
        const result = await createOutlookReplyDraft(
          ctx.doctorId,
          input.emailId,
          input.body,
          ctx.supabase,
          { replyAll: true, to: input.to, cc: input.cc, mailbox: input.mailbox }
        );
        logInfo("tool:draftOutlookReplyAll", `Draft created: ${result.draftId}`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:draftOutlookReplyAll", "Failed to create reply-all draft", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createDraftOutlookEmailTool(ctx: AgentContext) {
  return tool({
    description:
      "Create a new Outlook email draft. Does NOT send it — the doctor can review before sending via sendOutlookDraft.",
    inputSchema: z.object({
      to: z.union([z.string(), z.array(z.string())]).optional().describe("Recipient email address(es)"),
      cc: z.union([z.string(), z.array(z.string())]).optional().describe("CC recipients"),
      bcc: z.union([z.string(), z.array(z.string())]).optional().describe("BCC recipients"),
      subject: z.string().optional().describe("Email subject"),
      body: z.string().optional().describe("Email body (HTML)"),
      mailbox: z.string().optional().describe("Mailbox address for shared mailboxes"),
    }),
    execute: async (input) => {
      logInfo("tool:draftOutlookEmail", "Creating draft", ctx.doctorId, { subject: input.subject });
      try {
        const result = await createOutlookDraft(ctx.doctorId, input, ctx.supabase);
        logInfo("tool:draftOutlookEmail", `Draft created: ${result.draftId}`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:draftOutlookEmail", "Failed to create draft", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createUpdateOutlookDraftTool(ctx: AgentContext) {
  return tool({
    description: "Update the fields of an existing Outlook email draft",
    inputSchema: z.object({
      draftId: z.string().describe("Draft message ID"),
      to: z.union([z.string(), z.array(z.string())]).optional().describe("Recipient email address(es)"),
      cc: z.union([z.string(), z.array(z.string())]).optional().describe("CC recipients"),
      bcc: z.union([z.string(), z.array(z.string())]).optional().describe("BCC recipients"),
      subject: z.string().optional().describe("Email subject"),
      body: z.string().optional().describe("Email body (HTML)"),
      mailbox: z.string().optional().describe("Mailbox address for shared mailboxes"),
    }),
    execute: async (input) => {
      const { draftId, ...updates } = input;
      logInfo("tool:updateOutlookDraft", "Updating draft", ctx.doctorId, { draftId });
      try {
        const result = await updateOutlookDraft(ctx.doctorId, draftId, updates, ctx.supabase);
        logInfo("tool:updateOutlookDraft", "Draft updated", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:updateOutlookDraft", "Failed to update draft", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createSendOutlookDraftTool(ctx: AgentContext, needsApproval = false) {
  return tool({
    description: "Send an existing Outlook email draft. Requires approval in automated sessions.",
    inputSchema: z.object({
      draftId: z.string().describe("Draft message ID to send"),
      mailbox: z.string().optional().describe("Mailbox address for shared mailboxes"),
    }),
    needsApproval,
    execute: async (input) => {
      if (ctx.sessionType !== "chat" && ctx.requestApproval) {
        const result = await ctx.requestApproval("send_email", { draftId: input.draftId });
        if (!result.approved) {
          throw new Error(result.reason ?? "Send draft was rejected by doctor");
        }
      }
      try {
        const result = await sendOutlookDraft(ctx.doctorId, input.draftId, ctx.supabase, input.mailbox);
        logInfo("tool:sendOutlookDraft", "Draft sent", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:sendOutlookDraft", "Failed to send draft", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createListOutlookDraftsTool(ctx: AgentContext) {
  return tool({
    description: "List the doctor's Outlook email drafts",
    inputSchema: z.object({
      count: z.number().default(10).describe("Number of drafts to fetch"),
    }),
    execute: async ({ count }) => {
      logInfo("tool:listOutlookDrafts", "Fetching drafts", ctx.doctorId);
      try {
        const result = await listOutlookDrafts(ctx.doctorId, count ?? 10, ctx.supabase);
        logInfo("tool:listOutlookDrafts", `Retrieved ${result.messages.length} drafts`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:listOutlookDrafts", "Failed to fetch drafts", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createSearchOutlookMessagesTool(ctx: AgentContext) {
  return tool({
    description:
      "Search Outlook messages with structured filters (from, to, subject, has attachments, date range, folder)",
    inputSchema: z.object({
      query: z.string().optional().describe("Free-text query"),
      from: z.string().optional().describe("Sender email address"),
      to: z.string().optional().describe("Recipient email address"),
      subject: z.string().optional().describe("Text contained in the subject"),
      hasAttachments: z.boolean().optional().describe("Only messages with attachments"),
      isRead: z.boolean().optional().describe("Filter by read status"),
      importance: z.enum(["low", "normal", "high"]).optional().describe("Importance filter"),
      startDate: z.string().optional().describe("Received after this ISO datetime"),
      endDate: z.string().optional().describe("Received before this ISO datetime"),
      folderId: z.string().optional().describe("Mail folder ID"),
      folderName: z.string().optional().describe("Mail folder name"),
      maxResults: z.number().default(25).describe("Max results"),
    }),
    execute: async (input) => {
      logInfo("tool:searchOutlookMessages", "Searching messages", ctx.doctorId, { query: input.query, from: input.from });
      try {
        const result = await searchOutlookMessages(ctx.doctorId, input, ctx.supabase);
        logInfo("tool:searchOutlookMessages", `Found ${result.messages.length} messages`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:searchOutlookMessages", "Search failed", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createMoveOutlookMessagesTool(ctx: AgentContext, needsApproval = false) {
  return tool({
    description: "Move one or more Outlook emails to another folder. Requires approval in automated sessions.",
    inputSchema: z.object({
      emailIds: z.array(z.string()).describe("Message IDs to move"),
      destinationFolderId: z.string().optional().describe("Destination folder ID"),
      destinationFolderName: z.string().optional().describe("Destination folder name"),
      mailbox: z.string().optional().describe("Mailbox address for shared mailboxes"),
    }),
    needsApproval,
    execute: async (input) => {
      if (ctx.sessionType !== "chat" && ctx.requestApproval) {
        const result = await ctx.requestApproval("send_email", { emailIds: input.emailIds });
        if (!result.approved) {
          throw new Error(result.reason ?? "Move was rejected by doctor");
        }
      }
      try {
        const result = await moveOutlookMessages(
          ctx.doctorId,
          input.emailIds,
          input.destinationFolderId,
          input.destinationFolderName,
          ctx.supabase,
          input.mailbox
        );
        logInfo("tool:moveOutlookMessages", `Moved ${result.moved} messages`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:moveOutlookMessages", "Move failed", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createListOutlookFoldersTool(ctx: AgentContext) {
  return tool({
    description: "List the doctor's Outlook mail folders",
    inputSchema: z.object({
      mailbox: z.string().optional().describe("Mailbox address for shared mailboxes"),
    }),
    execute: async ({ mailbox }) => {
      logInfo("tool:listOutlookFolders", "Fetching folders", ctx.doctorId);
      try {
        const result = await listOutlookFolders(ctx.doctorId, ctx.supabase, mailbox);
        logInfo("tool:listOutlookFolders", `Retrieved ${result.folders.length} folders`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:listOutlookFolders", "Failed to fetch folders", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createCreateOutlookFolderTool(ctx: AgentContext) {
  return tool({
    description: "Create a new Outlook mail folder",
    inputSchema: z.object({
      displayName: z.string().describe("Folder name"),
      parentFolderId: z.string().optional().describe("Parent folder ID to create inside"),
      mailbox: z.string().optional().describe("Mailbox address for shared mailboxes"),
    }),
    execute: async ({ displayName, parentFolderId, mailbox }) => {
      logInfo("tool:createOutlookFolder", "Creating folder", ctx.doctorId, { displayName });
      try {
        const result = await createOutlookFolder(ctx.doctorId, displayName, parentFolderId, ctx.supabase, mailbox);
        logInfo("tool:createOutlookFolder", `Created folder: ${result.folderId}`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:createOutlookFolder", "Failed to create folder", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createListOutlookRulesTool(ctx: AgentContext) {
  return tool({
    description: "List the doctor's Outlook inbox rules",
    inputSchema: z.object({
      mailbox: z.string().optional().describe("Mailbox address for shared mailboxes"),
    }),
    execute: async ({ mailbox }) => {
      logInfo("tool:listOutlookRules", "Fetching rules", ctx.doctorId);
      try {
        const result = await listOutlookRules(ctx.doctorId, ctx.supabase, mailbox);
        logInfo("tool:listOutlookRules", `Retrieved ${result.rules.length} rules`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:listOutlookRules", "Failed to fetch rules", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createCreateOutlookRuleTool(ctx: AgentContext, needsApproval = false) {
  return tool({
    description:
      "Create an Outlook inbox rule. Conditions/actions use Graph messageRule fields (e.g. {from: {emailAddress:{address:...}}}, {moveToFolder: \"folderId\"}). Requires approval in automated sessions.",
    inputSchema: z.object({
      displayName: z.string().optional().describe("Rule name"),
      conditions: z.record(z.unknown()).default({}).describe("Rule conditions (messageRulePredicates)"),
      actions: z.record(z.unknown()).describe("Rule actions"),
      isEnabled: z.boolean().default(true).describe("Whether the rule is enabled"),
      sequence: z.number().optional().describe("Rule sequence"),
      mailbox: z.string().optional().describe("Mailbox address for shared mailboxes"),
    }),
    needsApproval,
    execute: async (input) => {
      if (ctx.sessionType !== "chat" && ctx.requestApproval) {
        const result = await ctx.requestApproval("send_email", { displayName: input.displayName });
        if (!result.approved) {
          throw new Error(result.reason ?? "Create rule was rejected by doctor");
        }
      }
      try {
        const result = await createOutlookRule(
          ctx.doctorId,
          {
            displayName: input.displayName,
            conditions: input.conditions,
            actions: input.actions,
            isEnabled: input.isEnabled,
            sequence: input.sequence,
          },
          ctx.supabase,
          input.mailbox
        );
        logInfo("tool:createOutlookRule", `Created rule: ${result.ruleId}`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:createOutlookRule", "Failed to create rule", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createGetOutlookFocusedInboxTool(ctx: AgentContext) {
  return tool({
    description: "Read the latest emails from the doctor's Outlook Focused inbox",
    inputSchema: z.object({
      count: z.number().default(10).describe("Number of emails to fetch"),
      mailbox: z.string().optional().describe("Mailbox address for shared mailboxes"),
    }),
    execute: async ({ count, mailbox }) => {
      logInfo("tool:getOutlookFocusedInbox", "Fetching focused inbox", ctx.doctorId);
      try {
        const result = await getOutlookFocusedInbox(ctx.doctorId, count ?? 10, ctx.supabase, mailbox);
        logInfo("tool:getOutlookFocusedInbox", `Retrieved ${result.messages.length} messages`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:getOutlookFocusedInbox", "Failed to fetch focused inbox", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createListOutlookCategoriesTool(ctx: AgentContext) {
  return tool({
    description: "List the doctor's Outlook master categories",
    inputSchema: z.object({}),
    execute: async () => {
      logInfo("tool:listOutlookCategories", "Fetching categories", ctx.doctorId);
      try {
        const result = await listOutlookCategories(ctx.doctorId, ctx.supabase);
        logInfo("tool:listOutlookCategories", `Retrieved ${result.categories.length} categories`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:listOutlookCategories", "Failed to fetch categories", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createCreateOutlookCategoryTool(ctx: AgentContext, needsApproval = false) {
  return tool({
    description: "Create an Outlook master category",
    inputSchema: z.object({
      displayName: z.string().describe("Category name"),
      color: z.string().default("preset0").describe("Preset color (preset0-preset24)"),
    }),
    needsApproval,
    execute: async ({ displayName, color }) => {
      try {
        const result = await createOutlookCategory(ctx.doctorId, displayName, color, ctx.supabase);
        logInfo("tool:createOutlookCategory", `Created category: ${result.categoryId}`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:createOutlookCategory", "Failed to create category", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createUpdateOutlookCategoryTool(ctx: AgentContext) {
  return tool({
    description: "Update an Outlook master category's name or color",
    inputSchema: z.object({
      categoryId: z.string().describe("Category ID"),
      displayName: z.string().optional().describe("New category name"),
      color: z.string().optional().describe("New preset color"),
    }),
    execute: async ({ categoryId, displayName, color }) => {
      logInfo("tool:updateOutlookCategory", "Updating category", ctx.doctorId, { categoryId });
      try {
        const result = await updateOutlookCategory(ctx.doctorId, categoryId, { displayName, color }, ctx.supabase);
        logInfo("tool:updateOutlookCategory", "Category updated", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:updateOutlookCategory", "Failed to update category", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createDeleteOutlookCategoryTool(ctx: AgentContext, needsApproval = false) {
  return tool({
    description: "Delete an Outlook master category",
    inputSchema: z.object({
      categoryId: z.string().describe("Category ID"),
    }),
    needsApproval,
    execute: async ({ categoryId }) => {
      try {
        const result = await deleteOutlookCategory(ctx.doctorId, categoryId, ctx.supabase);
        logInfo("tool:deleteOutlookCategory", "Category deleted", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:deleteOutlookCategory", "Failed to delete category", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createApplyOutlookCategoriesTool(ctx: AgentContext, needsApproval = false) {
  return tool({
    description: "Assign categories to an Outlook email",
    inputSchema: z.object({
      emailId: z.string().describe("Outlook message ID"),
      categories: z.array(z.string()).describe("Category names to assign"),
      mailbox: z.string().optional().describe("Mailbox address for shared mailboxes"),
    }),
    needsApproval,
    execute: async ({ emailId, categories, mailbox }) => {
      try {
        const result = await applyOutlookCategories(ctx.doctorId, emailId, categories, ctx.supabase, mailbox);
        logInfo("tool:applyOutlookCategories", "Categories applied", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:applyOutlookCategories", "Failed to apply categories", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createRemoveOutlookCategoriesTool(ctx: AgentContext, needsApproval = false) {
  return tool({
    description: "Remove categories from an Outlook email",
    inputSchema: z.object({
      emailId: z.string().describe("Outlook message ID"),
      categories: z.array(z.string()).describe("Category names to remove"),
      mailbox: z.string().optional().describe("Mailbox address for shared mailboxes"),
    }),
    needsApproval,
    execute: async ({ emailId, categories, mailbox }) => {
      try {
        const result = await removeOutlookCategories(ctx.doctorId, emailId, categories, ctx.supabase, mailbox);
        logInfo("tool:removeOutlookCategories", "Categories removed", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:removeOutlookCategories", "Failed to remove categories", err, ctx.doctorId);
        throw err;
      }
    },
  });
}