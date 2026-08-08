import { tool } from "ai";
import { z } from "zod";
import type { AgentContext } from "../context";
import { getSheetValues } from "../google/sheets";

export function createReadSheetTool(ctx: AgentContext) {
  return tool({
    description: "Read data from a Google Sheet",
    inputSchema: z.object({
      spreadsheetId: z
        .string()
        .describe("The Google Sheets spreadsheet ID"),
      range: z
        .string()
        .default("A1:Z100")
        .describe("Cell range to read (e.g. A1:D10)"),
    }),
    execute: async ({ spreadsheetId, range }) => {
      return getSheetValues(ctx.doctorId, spreadsheetId, range ?? "A1:Z100", ctx.supabase);
    },
  });
}

export const readSheet = createReadSheetTool({
  doctorId: "",
  sessionType: "chat",
});
