import { tool } from "ai";
import { z } from "zod";
import type { AgentContext } from "../context";
import { searchFiles } from "../google/drive";

export function createSearchDriveTool(ctx: AgentContext, needsApproval = false) {
  return tool({
    description: "Search for files in the doctor's Google Drive",
    inputSchema: z.object({
      query: z.string().describe("Search query"),
      maxResults: z.number().default(10).describe("Maximum number of results"),
    }),
    needsApproval,
    execute: async ({ query, maxResults }) => {
      return searchFiles(ctx.doctorId, query, maxResults ?? 10, ctx.supabase);
    },
  });
}

export const searchDrive = createSearchDriveTool({
  doctorId: "",
  sessionType: "chat",
});
