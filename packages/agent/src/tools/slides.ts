import { tool } from "ai";
import { z } from "zod";
import type { AgentContext } from "../context";
import {
  createPresentation,
  getPresentation,
  batchUpdatePresentation,
  getPage,
  getPageThumbnail,
  listPresentationComments,
} from "../google/slides";
import { logError, logInfo } from "../logger";

export function createCreatePresentationTool(ctx: AgentContext) {
  return tool({
    description: "Create a new Google Presentation",
    inputSchema: z.object({
      title: z.string().describe("Presentation title"),
    }),
    execute: async ({ title }) => {
      logInfo("tool:createPresentation", "Creating presentation", ctx.doctorId, { title });
      try {
        const result = await createPresentation(ctx.doctorId, title, ctx.supabase);
        logInfo("tool:createPresentation", "Created presentation", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:createPresentation", "Failed to create presentation", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createGetPresentationTool(ctx: AgentContext) {
  return tool({
    description: "Get a Google Presentation",
    inputSchema: z.object({
      presentationId: z.string().describe("Presentation ID"),
    }),
    execute: async ({ presentationId }) => {
      logInfo("tool:getPresentation", "Fetching presentation", ctx.doctorId, { presentationId });
      try {
        const result = await getPresentation(ctx.doctorId, presentationId, ctx.supabase);
        logInfo("tool:getPresentation", "Fetched presentation", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:getPresentation", "Failed to get presentation", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createBatchUpdatePresentationTool(ctx: AgentContext) {
  return tool({
    description: "Batch update a Google Presentation",
    inputSchema: z.object({
      presentationId: z.string().describe("Presentation ID"),
      requests: z.array(z.any()).describe("Array of batch update requests"),
    }),
    execute: async ({ presentationId, requests }) => {
      logInfo("tool:batchUpdatePresentation", "Batch updating presentation", ctx.doctorId, { presentationId });
      try {
        const result = await batchUpdatePresentation(ctx.doctorId, presentationId, requests, ctx.supabase);
        logInfo("tool:batchUpdatePresentation", "Batch updated presentation", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:batchUpdatePresentation", "Failed to batch update presentation", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createGetPageTool(ctx: AgentContext) {
  return tool({
    description: "Get a page from a Google Presentation",
    inputSchema: z.object({
      presentationId: z.string().describe("Presentation ID"),
      pageObjectId: z.string().describe("Page object ID"),
    }),
    execute: async ({ presentationId, pageObjectId }) => {
      logInfo("tool:getPage", "Fetching presentation page", ctx.doctorId, { presentationId, pageObjectId });
      try {
        const result = await getPage(ctx.doctorId, presentationId, pageObjectId, ctx.supabase);
        logInfo("tool:getPage", "Fetched presentation page", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:getPage", "Failed to get presentation page", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createGetPageThumbnailTool(ctx: AgentContext) {
  return tool({
    description: "Get thumbnail of a page from a Google Presentation",
    inputSchema: z.object({
      presentationId: z.string().describe("Presentation ID"),
      pageObjectId: z.string().describe("Page object ID"),
    }),
    execute: async ({ presentationId, pageObjectId }) => {
      logInfo("tool:getPageThumbnail", "Getting presentation page thumbnail", ctx.doctorId, { presentationId, pageObjectId });
      try {
        const result = await getPageThumbnail(ctx.doctorId, presentationId, pageObjectId, ctx.supabase);
        logInfo("tool:getPageThumbnail", "Got presentation page thumbnail", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:getPageThumbnail", "Failed to get presentation page thumbnail", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createListPresentationCommentsTool(ctx: AgentContext) {
  return tool({
    description: "List comments in a Google Presentation",
    inputSchema: z.object({
      presentationId: z.string().describe("Presentation ID"),
    }),
    execute: async ({ presentationId }) => {
      logInfo("tool:listPresentationComments", "Listing presentation comments", ctx.doctorId, { presentationId });
      try {
        const result = await listPresentationComments(ctx.doctorId, presentationId, ctx.supabase);
        logInfo("tool:listPresentationComments", `Found ${result.comments.length} comments`);
        return result;
      } catch (err) {
        logError("tool:listPresentationComments", "Failed to list presentation comments", err, ctx.doctorId);
        throw err;
      }
    },
  });
}






