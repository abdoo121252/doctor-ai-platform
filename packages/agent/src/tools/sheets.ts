import { tool } from "ai";
import { z } from "zod";
import type { AgentContext } from "../context";
import {
  getSheetValues,
  createSpreadsheet,
  listSpreadsheets,
  getSpreadsheetInfo,
  modifySheetValues,
  appendSheetValues,
  createSheet,
  batchUpdateSheet,
  listSheetTables,
  listSheetComments,
  moveSheetRows,
  resizeSheetDimensions,
  manageConditionalFormatting,
} from "../google/sheets";
import { logError, logInfo } from "../logger";

export function createReadSheetTool(ctx: AgentContext, needsApproval = false) {
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
    needsApproval: needsApproval,
    execute: async ({ spreadsheetId, range }) => {
      logInfo("tool:readSheet", "Reading sheet values", ctx.doctorId, { spreadsheetId, range });
      try {
        const result = await getSheetValues(ctx.doctorId, spreadsheetId, range ?? "A1:Z100", ctx.supabase);
        logInfo("tool:readSheet", "Read sheet values", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:readSheet", "Failed to read sheet values", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createCreateSpreadsheetTool(ctx: AgentContext) {
  return tool({
    description: "Create a new Google Spreadsheet",
    inputSchema: z.object({
      title: z.string().describe("Spreadsheet title"),
    }),
    execute: async ({ title }) => {
      logInfo("tool:createSpreadsheet", "Creating spreadsheet", ctx.doctorId, { title });
      try {
        const result = await createSpreadsheet(ctx.doctorId, title, ctx.supabase);
        logInfo("tool:createSpreadsheet", "Created spreadsheet", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:createSpreadsheet", "Failed to create spreadsheet", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createListSpreadsheetsTool(ctx: AgentContext) {
  return tool({
    description: "List the doctor's Google Spreadsheets",
    inputSchema: z.object({}),
    execute: async () => {
      logInfo("tool:listSpreadsheets", "Listing spreadsheets");
      try {
        const result = await listSpreadsheets(ctx.doctorId, ctx.supabase);
        logInfo("tool:listSpreadsheets", `Found ${result.spreadsheets.length} spreadsheets`);
        return result;
      } catch (err) {
        logError("tool:listSpreadsheets", "Failed to list spreadsheets", err);
        throw err;
      }
    },
  });
}

export function createGetSpreadsheetInfoTool(ctx: AgentContext) {
  return tool({
    description: "Get information about a Google Spreadsheet",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
    }),
    execute: async ({ spreadsheetId }) => {
      logInfo("tool:getSpreadsheetInfo", "Getting spreadsheet info", ctx.doctorId, { spreadsheetId });
      try {
        const result = await getSpreadsheetInfo(ctx.doctorId, spreadsheetId, ctx.supabase);
        logInfo("tool:getSpreadsheetInfo", "Got spreadsheet info", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:getSpreadsheetInfo", "Failed to get spreadsheet info", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createModifySheetValuesTool(ctx: AgentContext) {
  return tool({
    description: "Modify values in a Google Sheet range",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      range: z.string().describe("Cell range (e.g. A1:B10)"),
      values: z.array(z.array(z.unknown())).describe("2D array of values"),
    }),
    execute: async ({ spreadsheetId, range, values }) => {
      logInfo("tool:modifySheetValues", "Modifying sheet values", ctx.doctorId, { spreadsheetId, range });
      try {
        const result = await modifySheetValues(ctx.doctorId, spreadsheetId, range, values, ctx.supabase);
        logInfo("tool:modifySheetValues", "Modified sheet values", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:modifySheetValues", "Failed to modify sheet values", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createAppendSheetValuesTool(ctx: AgentContext) {
  return tool({
    description: "Append values to a Google Sheet",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      range: z.string().describe("Cell range (e.g. A:A)"),
      values: z.array(z.array(z.unknown())).describe("2D array of values to append"),
    }),
    execute: async ({ spreadsheetId, range, values }) => {
      logInfo("tool:appendSheetValues", "Appending sheet values", ctx.doctorId, { spreadsheetId, range });
      try {
        const result = await appendSheetValues(ctx.doctorId, spreadsheetId, range, values, ctx.supabase);
        logInfo("tool:appendSheetValues", "Appended sheet values", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:appendSheetValues", "Failed to append sheet values", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createCreateSheetTool(ctx: AgentContext) {
  return tool({
    description: "Create a new sheet in a Google Spreadsheet",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      title: z.string().describe("Sheet title"),
    }),
    execute: async ({ spreadsheetId, title }) => {
      logInfo("tool:createSheet", "Creating sheet", ctx.doctorId, { spreadsheetId, title });
      try {
        const result = await createSheet(ctx.doctorId, spreadsheetId, title, ctx.supabase);
        logInfo("tool:createSheet", "Created sheet", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:createSheet", "Failed to create sheet", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createBatchUpdateSheetTool(ctx: AgentContext) {
  return tool({
    description: "Batch update a Google Spreadsheet",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      requests: z.array(z.any()).describe("Array of batch update requests"),
    }),
    execute: async ({ spreadsheetId, requests }) => {
      logInfo("tool:batchUpdateSheet", "Batch updating spreadsheet", ctx.doctorId, { spreadsheetId });
      try {
        const result = await batchUpdateSheet(ctx.doctorId, spreadsheetId, requests, ctx.supabase);
        logInfo("tool:batchUpdateSheet", "Batch updated spreadsheet", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:batchUpdateSheet", "Failed to batch update spreadsheet", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createListSheetTablesTool(ctx: AgentContext) {
  return tool({
    description: "List tables in a Google Sheet",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetId: z.number().describe("Sheet ID"),
    }),
    execute: async ({ spreadsheetId, sheetId }) => {
      logInfo("tool:listSheetTables", "Listing sheet tables", ctx.doctorId, { spreadsheetId, sheetId });
      try {
        const result = await listSheetTables(ctx.doctorId, spreadsheetId, sheetId, ctx.supabase);
        logInfo("tool:listSheetTables", `Found ${result.tables.length} tables`);
        return result;
      } catch (err) {
        logError("tool:listSheetTables", "Failed to list sheet tables", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createListSheetCommentsTool(ctx: AgentContext) {
  return tool({
    description: "List comments in a Google Sheet",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
    }),
    execute: async ({ spreadsheetId }) => {
      logInfo("tool:listSheetComments", "Listing sheet comments", ctx.doctorId, { spreadsheetId });
      try {
        const result = await listSheetComments(ctx.doctorId, spreadsheetId, ctx.supabase);
        logInfo("tool:listSheetComments", `Found ${result.comments.length} comments`);
        return result;
      } catch (err) {
        logError("tool:listSheetComments", "Failed to list sheet comments", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createFormatSheetRangeTool(ctx: AgentContext) {
  return tool({
    description: "Format a range in a Google Sheet",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      range: z.string().describe("Cell range (e.g. A1:B10)"),
      format: z.any().describe("Format specification"),
    }),
    execute: async ({ spreadsheetId, range, format }) => {
      logInfo("tool:formatSheetRange", "Formatting sheet range", ctx.doctorId, { spreadsheetId, range });
      try {
        const result = await batchUpdateSheet(ctx.doctorId, spreadsheetId, [
          {
            repeatCell: {
              range: {
                sheetId: 0, // TODO: lookup sheetId from name if needed
                startRowIndex: 0,
                endRowIndex: 100,
                startColumnIndex: 0,
                endColumnIndex: 100,
              },
              cell: { userEnteredFormat: format },
              fields: "userEnteredFormat",
            },
          },
        ], ctx.supabase);
        logInfo("tool:formatSheetRange", "Formatted sheet range", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:formatSheetRange", "Failed to format sheet range", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createMoveSheetRowsTool(ctx: AgentContext) {
  return tool({
    description: "Move rows in a Google Sheet",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      startIndex: z.number().describe("Start row index (0-based)"),
      endIndex: z.number().describe("End row index (0-based, exclusive)"),
      destinationIndex: z.number().describe("Destination row index (0-based)"),
    }),
    execute: async ({ spreadsheetId, startIndex, endIndex, destinationIndex }) => {
      logInfo("tool:moveSheetRows", "Moving sheet rows", ctx.doctorId, { startIndex, endIndex, destinationIndex });
      try {
        const result = await moveSheetRows(ctx.doctorId, spreadsheetId, startIndex, endIndex, destinationIndex, ctx.supabase);
        logInfo("tool:moveSheetRows", "Moved sheet rows", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:moveSheetRows", "Failed to move sheet rows", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createResizeSheetDimensionsTool(ctx: AgentContext) {
  return tool({
    description: "Resize rows or columns in a Google Sheet",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      dimension: z.enum(["ROWS", "COLUMNS"]).describe("Dimension to resize"),
      startIndex: z.number().describe("Start index (0-based)"),
      endIndex: z.number().describe("End index (0-based, exclusive)"),
      pixelSize: z.number().describe("New size in pixels"),
    }),
    execute: async ({ spreadsheetId, dimension, startIndex, endIndex, pixelSize }) => {
      logInfo("tool:resizeSheetDimensions", "Resizing sheet dimensions", ctx.doctorId, { dimension, startIndex, endIndex, pixelSize });
      try {
        const result = await resizeSheetDimensions(ctx.doctorId, spreadsheetId, dimension, startIndex, endIndex, pixelSize, ctx.supabase);
        logInfo("tool:resizeSheetDimensions", "Resized sheet dimensions", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:resizeSheetDimensions", "Failed to resize sheet dimensions", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createManageConditionalFormattingTool(ctx: AgentContext) {
  return tool({
    description: "Manage conditional formatting rules in a Google Sheet",
    inputSchema: z.object({
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetId: z.number().optional().describe("Sheet ID (optional, defaults to first sheet)"),
      rules: z.array(z.any()).describe("Conditional formatting rules"),
    }),
    execute: async ({ spreadsheetId, sheetId, rules }) => {
      logInfo("tool:manageConditionalFormatting", "Managing conditional formatting", ctx.doctorId, { spreadsheetId, sheetId });
      try {
        const result = await manageConditionalFormatting(ctx.doctorId, spreadsheetId, sheetId ?? 0, rules, ctx.supabase);
        logInfo("tool:manageConditionalFormatting", "Managed conditional formatting", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:manageConditionalFormatting", "Failed to manage conditional formatting", err, ctx.doctorId);
        throw err;
      }
    },
  });
}














