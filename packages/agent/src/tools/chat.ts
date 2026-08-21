import { tool } from "ai";
import { z } from "zod";
import type { AgentContext } from "../context";
import {
  listSpaces,
  getMessages,
  sendMessage,
  searchMessages,
  createReaction,
} from "../google/chat";
import { logError, logInfo } from "../logger";

export function createListSpacesTool(ctx: AgentContext) {
  return tool({
    description: "List Google Chat spaces",
    inputSchema: z.object({}),
    execute: async () => {
      logInfo("tool:listSpaces", "Listing chat spaces");
      try {
        const result = await listSpaces(ctx.doctorId, ctx.supabase);
        logInfo("tool:listSpaces", `Found ${result.spaces.length} spaces`);
        return result;
      } catch (err) {
        logError("tool:listSpaces", "Failed to list chat spaces", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createGetMessagesTool(ctx: AgentContext) {
  return tool({
    description: "Get messages from a Google Chat space",
    inputSchema: z.object({
      spaceName: z.string().describe("Space name"),
      pageSize: z.number().default(50).describe("Page size"),
    }),
    execute: async ({ spaceName, pageSize }) => {
      logInfo("tool:getMessages", "Fetching chat messages", ctx.doctorId, { spaceName, pageSize });
      try {
        const result = await getMessages(ctx.doctorId, spaceName, pageSize ?? 50, ctx.supabase);
        logInfo("tool:getMessages", `Found ${result.messages.length} messages`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:getMessages", "Failed to fetch chat messages", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createSendMessageTool(ctx: AgentContext) {
  return tool({
    description: "Send a message to a Google Chat space",
    inputSchema: z.object({
      spaceName: z.string().describe("Space name"),
      text: z.string().describe("Message text"),
    }),
    execute: async ({ spaceName, text }) => {
      logInfo("tool:sendMessage", "Sending chat message", ctx.doctorId, { spaceName });
      try {
        const result = await sendMessage(ctx.doctorId, spaceName, text, ctx.supabase);
        logInfo("tool:sendMessage", "Sent chat message", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:sendMessage", "Failed to send chat message", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createSearchMessagesTool(ctx: AgentContext) {
  return tool({
    description: "Search messages in a Google Chat space",
    inputSchema: z.object({
      spaceName: z.string().describe("Space name"),
      query: z.string().describe("Search query"),
    }),
    execute: async ({ spaceName, query }) => {
      logInfo("tool:searchMessages", "Searching chat messages", ctx.doctorId, { spaceName, query });
      try {
        const result = await searchMessages(ctx.doctorId, spaceName, query, ctx.supabase);
        logInfo("tool:searchMessages", `Found ${result.messages.length} messages`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:searchMessages", "Failed to search chat messages", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createCreateReactionTool(ctx: AgentContext) {
  return tool({
    description: "Create a reaction to a Google Chat message",
    inputSchema: z.object({
      messageName: z.string().describe("Message name"),
      emoji: z.string().describe("Emoji unicode"),
    }),
    execute: async ({ messageName, emoji }) => {
      logInfo("tool:createReaction", "Creating chat reaction", ctx.doctorId, { messageName, emoji });
      try {
        const result = await createReaction(ctx.doctorId, messageName, emoji, ctx.supabase);
        logInfo("tool:createReation", "Created chat reaction", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:createReation", "Failed to create chat reaction", err, ctx.doctorId);
        throw err;
      }
    },
  });
}





