import { tool } from "ai";
import { z } from "zod";
import type { AgentContext } from "../../context";
import { searchOneDrive, readOneDriveFile } from "../drive";
import { logError, logInfo } from "../../logger";

export function createSearchOneDriveTool(ctx: AgentContext, needsApproval = false) {
  return tool({
    description: "Search for files in the doctor's OneDrive",
    inputSchema: z.object({
      query: z.string().describe("Search query"),
    }),
    needsApproval,
    execute: async ({ query }) => {
      logInfo("tool:searchOneDrive", "Searching OneDrive", ctx.doctorId, { query });
      try {
        const result = await searchOneDrive(ctx.doctorId, query, ctx.supabase);
        logInfo("tool:searchOneDrive", `Found ${result.items.length} items`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:searchOneDrive", "Failed to search OneDrive", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createReadOneDriveFileTool(ctx: AgentContext, needsApproval = false) {
  return tool({
    description: "Read the content of a file in the doctor's OneDrive by item ID",
    inputSchema: z.object({
      itemId: z.string().describe("OneDrive item ID"),
    }),
    needsApproval,
    execute: async ({ itemId }) => {
      logInfo("tool:readOneDriveFile", "Reading OneDrive file", ctx.doctorId, { itemId });
      try {
        const result = await readOneDriveFile(ctx.doctorId, itemId, ctx.supabase);
        logInfo("tool:readOneDriveFile", `Read file: ${result.name}`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:readOneDriveFile", "Failed to read OneDrive file", err, ctx.doctorId);
        throw err;
      }
    },
  });
}
