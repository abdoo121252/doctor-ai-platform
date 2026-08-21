import { tool } from "ai";
import { z } from "zod";
import type { AgentContext } from "../../context";
import { searchM365 } from "../search";
import { logError, logInfo } from "../../logger";

export function createSearchM365Tool(ctx: AgentContext) {
  return tool({
    description:
      "Unified Microsoft 365 search across mail messages, calendar events, OneDrive/SharePoint files, and people. Uses Microsoft Search.",
    inputSchema: z.object({
      query: z.string().optional().describe("Free-text search query"),
      peopleSearch: z.string().optional().describe("Search for a person by name"),
      entityTypes: z
        .array(z.enum(["message", "event", "driveItem", "listItem", "person"]))
        .optional()
        .describe("What to search (defaults to driveItem, listItem)"),
      maxResults: z.number().default(25).describe("Maximum results"),
      fileTypes: z.array(z.string()).optional().describe("Filter by file extensions (e.g. pdf, docx)"),
    }),
    execute: async (input) => {
      logInfo("tool:searchM365", "Searching Microsoft 365", ctx.doctorId, {
        query: input.query,
        entityTypes: input.entityTypes,
      });
      try {
        const result = await searchM365(ctx.doctorId, input, ctx.supabase);
        logInfo("tool:searchM365", `Found ${result.results.length} results`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:searchM365", "Search failed", err, ctx.doctorId);
        throw err;
      }
    },
  });
}