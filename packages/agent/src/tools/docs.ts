import { tool } from "ai";
import { z } from "zod";
import type { AgentContext } from "../context";
import {
  searchDocs,
  getDocContent,
  getDocAsMarkdown,
  createDoc,
  batchUpdateDoc,
  exportDocToPdf,
  listDocsInFolder,
  listDocComments,
  insertDocImage,
  findAndReplaceDoc,
  updateParagraphStyle,
  updateDocHeadersFooters,
  inspectDocStructure,
  createTableWithData,
  convertFileToGoogleDoc,
  readPdfContent,
} from "../google/docs";
import { logError, logInfo } from "../logger";

export function createSearchDocsTool(ctx: AgentContext) {
  return tool({
    description: "Search Google Docs by name or content",
    inputSchema: z.object({
      query: z.string().describe("Search query"),
      maxResults: z.number().default(20).describe("Maximum number of results"),
    }),
    execute: async ({ query, maxResults }) => {
      logInfo("tool:searchDocs", "Searching Docs", ctx.doctorId, { query, maxResults });
      try {
        const result = await searchDocs(ctx.doctorId, query, maxResults ?? 20, ctx.supabase);
        logInfo("tool:searchDocs", `Found ${result.docs.length} docs`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:searchDocs", "Failed to search Docs", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createGetDocContentTool(ctx: AgentContext) {
  return tool({
    description: "Get content of a Google Doc",
    inputSchema: z.object({
      documentId: z.string().describe("Google Doc ID"),
    }),
    execute: async ({ documentId }) => {
      logInfo("tool:getDocContent", "Fetching Doc content", ctx.doctorId, { documentId });
      try {
        const result = await getDocContent(ctx.doctorId, documentId, ctx.supabase);
        logInfo("tool:getDocContent", "Fetched Doc content", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:getDocContent", "Failed to fetch Doc content", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createGetDocAsMarkdownTool(ctx: AgentContext) {
  return tool({
    description: "Get Google Doc as Markdown",
    inputSchema: z.object({
      documentId: z.string().describe("Google Doc ID"),
    }),
    execute: async ({ documentId }) => {
      logInfo("tool:getDocAsMarkdown", "Converting Doc to Markdown", ctx.doctorId, { documentId });
      try {
        const result = await getDocAsMarkdown(ctx.doctorId, documentId, ctx.supabase);
        logInfo("tool:getDocAsMarkdown", "Converted Doc to Markdown", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:getDocAsMarkdown", "Failed to convert Doc to Markdown", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createCreateDocTool(ctx: AgentContext) {
  return tool({
    description: "Create a new Google Doc",
    inputSchema: z.object({
      title: z.string().describe("Document title"),
      content: z.string().optional().describe("Initial document content"),
    }),
    execute: async ({ title, content }) => {
      logInfo("tool:createDoc", "Creating Doc", ctx.doctorId, { title });
      try {
        const result = await createDoc(ctx.doctorId, title, content, ctx.supabase);
        logInfo("tool:createDoc", "Created Doc", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:createDoc", "Failed to create Doc", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createBatchUpdateDocTool(ctx: AgentContext) {
  return tool({
    description: "Batch update a Google Doc",
    inputSchema: z.object({
      documentId: z.string().describe("Google Doc ID"),
      requests: z.array(z.any()).describe("Array of batch update requests"),
    }),
    execute: async ({ documentId, requests }) => {
      logInfo("tool:batchUpdateDoc", "Batch updating Doc", ctx.doctorId, { documentId });
      try {
        const result = await batchUpdateDoc(ctx.doctorId, documentId, requests, ctx.supabase);
        logInfo("tool:batchUpdateDoc", "Batch updated Doc", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:batchUpdateDoc", "Failed to batch update Doc", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createExportDocToPdfTool(ctx: AgentContext) {
  return tool({
    description: "Export a Google Doc as PDF",
    inputSchema: z.object({
      documentId: z.string().describe("Google Doc ID"),
    }),
    execute: async ({ documentId }) => {
      logInfo("tool:exportDocToPdf", "Exporting Doc to PDF", ctx.doctorId, { documentId });
      try {
        const result = await exportDocToPdf(ctx.doctorId, documentId, ctx.supabase);
        logInfo("tool:exportDocToPdf", "Exported Doc to PDF", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:exportDocToPdf", "Failed to export Doc to PDF", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createListDocsInFolderTool(ctx: AgentContext) {
  return tool({
    description: "List Google Docs in a folder",
    inputSchema: z.object({
      folderId: z.string().describe("Folder ID"),
      maxResults: z.number().default(100).describe("Maximum number of results"),
    }),
    execute: async ({ folderId, maxResults }) => {
      logInfo("tool:listDocsInFolder", "Listing Docs in folder", ctx.doctorId, { folderId, maxResults });
      try {
        const result = await listDocsInFolder(ctx.doctorId, folderId, maxResults ?? 100, ctx.supabase);
        logInfo("tool:listDocsInFolder", `Found ${result.docs.length} docs`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:listDocsInFolder", "Failed to list Docs in folder", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createListDocCommentsTool(ctx: AgentContext) {
  return tool({
    description: "List comments in a Google Doc",
    inputSchema: z.object({
      documentId: z.string().describe("Google Doc ID"),
    }),
    execute: async ({ documentId }) => {
      logInfo("tool:listDocComments", "Listing Doc comments", ctx.doctorId, { documentId });
      try {
        const result = await listDocComments(ctx.doctorId, documentId, ctx.supabase);
        logInfo("tool:listDocComments", `Found ${result.comments.length} comments`);
        return result;
      } catch (err) {
        logError("tool:listDocComments", "Failed to list Doc comments", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createInsertDocImageTool(ctx: AgentContext) {
  return tool({
    description: "Insert an image into a Google Doc",
    inputSchema: z.object({
      documentId: z.string().describe("Google Doc ID"),
      imageUrl: z.string().describe("Image URL (publicly accessible)"),
      width: z.number().optional().describe("Width in pixels"),
      height: z.number().optional().describe("Height in pixels"),
    }),
    execute: async ({ documentId, imageUrl, width, height }) => {
      logInfo("tool:insertDocImage", "Inserting image into Doc", ctx.doctorId, { documentId });
      try {
        const result = await insertDocImage(ctx.doctorId, documentId, imageUrl, width, height, ctx.supabase);
        logInfo("tool:insertDocImage", "Inserted image into Doc", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:insertDocImage", "Failed to insert image into Doc", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createFindAndReplaceDocTool(ctx: AgentContext) {
  return tool({
    description: "Find and replace text in a Google Doc",
    inputSchema: z.object({
      documentId: z.string().describe("Google Doc ID"),
      findText: z.string().describe("Text to find"),
      replaceText: z.string().describe("Text to replace with"),
      matchCase: z.boolean().optional().default(false).describe("Match case"),
    }),
    execute: async ({ documentId, findText, replaceText, matchCase }) => {
      logInfo("tool:findAndReplaceDoc", "Finding and replacing in Doc", ctx.doctorId, { findText, replaceText });
      try {
        const result = await findAndReplaceDoc(ctx.doctorId, documentId, findText, replaceText, matchCase, ctx.supabase);
        logInfo("tool:findAndReplaceDoc", "Found and replaced in Doc", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:findAndReplaceDoc", "Failed to find and replace in Doc", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createUpdateParagraphStyleTool(ctx: AgentContext) {
  return tool({
    description: "Update paragraph style in a Google Doc",
    inputSchema: z.object({
      documentId: z.string().describe("Google Doc ID"),
      range: z.object({
        startIndex: z.number().describe("Start index"),
        endIndex: z.number().describe("End index"),
      }).optional(),
      style: z.any().describe("Paragraph style"),
    }),
    execute: async ({ documentId, range, style }) => {
      logInfo("tool:updateParagraphStyle", "Updating paragraph style", ctx.doctorId, { documentId });
      try {
        const result = await updateParagraphStyle(ctx.doctorId, documentId, range, style, ctx.supabase);
        logInfo("tool:updateParagraphStyle", "Updated paragraph style", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:updateParagraphStyle", "Failed to update paragraph style", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createUpdateDocHeadersFootersTool(ctx: AgentContext) {
  return tool({
    description: "Update headers and footers in a Google Doc",
    inputSchema: z.object({
      documentId: z.string().describe("Google Doc ID"),
      header: z.any().optional().describe("Header content"),
      footer: z.any().optional().describe("Footer content"),
    }),
    execute: async ({ documentId, header, footer }) => {
      logInfo("tool:updateDocHeadersFooters", "Updating Doc headers/footers", ctx.doctorId, { documentId });
      try {
        const result = await updateDocHeadersFooters(ctx.doctorId, documentId, header, footer, ctx.supabase);
        logInfo("tool:updateDocHeadersFooters", "Updated Doc headers/footers", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:updateDocHeadersFooters", "Failed to update Doc headers/footers", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createInspectDocStructureTool(ctx: AgentContext) {
  return tool({
    description: "Inspect the structure of a Google Doc",
    inputSchema: z.object({
      documentId: z.string().describe("Google Doc ID"),
    }),
    execute: async ({ documentId }) => {
      logInfo("tool:inspectDocStructure", "Inspecting Doc structure", ctx.doctorId, { documentId });
      try {
        const result = await inspectDocStructure(ctx.doctorId, documentId, ctx.supabase);
        logInfo("tool:inspectDocStructure", "Inspected Doc structure", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:inspectDocStructure", "Failed to inspect Doc structure", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createCreateTableWithDataTool(ctx: AgentContext) {
  return tool({
    description: "Create a table with data in a Google Doc",
    inputSchema: z.object({
      documentId: z.string().describe("Google Doc ID"),
      endIndex: z.number().describe("Insertion index"),
      data: z.array(z.array(z.string())).describe("2D array of cell data"),
    }),
    execute: async ({ documentId, endIndex, data }) => {
      logInfo("tool:createTableWithData", "Creating table with data in Doc", ctx.doctorId, { documentId });
      try {
        const result = await createTableWithData(ctx.doctorId, documentId, endIndex, data, ctx.supabase);
        logInfo("tool:createTableWithData", "Created table with data in Doc", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:createTableWithData", "Failed to create table with data in Doc", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createConvertFileToGoogleDocTool(ctx: AgentContext, needsApproval = false) {
  return tool({
    description:
      "Convert an uploaded Word (.docx) or other Office file in Google Drive into a native Google Doc so it can be read or edited with the Docs tools. Call this whenever the file you need to read or edit is a .docx or other Office format, then use the returned newDocumentId with the Google Docs tools.",
    inputSchema: z.object({
      fileId: z.string().describe("Google Drive file ID of the .docx (or other Office file) to convert"),
    }),
    needsApproval: needsApproval,
    execute: async ({ fileId }) => {
      logInfo("tool:convertFileToGoogleDoc", "Converting file to Google Doc", ctx.doctorId, { fileId });
      try {
        const result = await convertFileToGoogleDoc(ctx.doctorId, fileId, ctx.supabase);
        logInfo("tool:convertFileToGoogleDoc", "Converted file to Google Doc", ctx.doctorId, { newDocumentId: result.newDocumentId });
        return result;
      } catch (err) {
        logError("tool:convertFileToGoogleDoc", "Failed to convert file to Google Doc", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createReadPdfContentTool(ctx: AgentContext, needsApproval = false) {
  return tool({
    description:
      "Read the raw text content of a PDF file (Google Drive fileId or public URL) directly without converting it to Google Docs. Use this for PDF files instead of the Docs tools, which warp PDF formatting.",
    inputSchema: z.object({
      fileIdOrUrl: z.string().describe("Google Drive file ID of the PDF, or a public HTTP(S) URL to the PDF"),
    }),
    needsApproval: needsApproval,
    execute: async ({ fileIdOrUrl }) => {
      logInfo("tool:readPdfContent", "Reading PDF content", ctx.doctorId, { fileIdOrUrl });
      try {
        const result = await readPdfContent(ctx.doctorId, fileIdOrUrl, ctx.supabase);
        logInfo("tool:readPdfContent", "Read PDF content", ctx.doctorId, { length: result.text.length });
        return result;
      } catch (err) {
        logError("tool:readPdfContent", "Failed to read PDF content", err, ctx.doctorId);
        throw err;
      }
    },
  });
}
