import { tool } from "ai";
import { z } from "zod";
import type { AgentContext } from "../context";
import {
  createForm,
  getForm,
  batchUpdateForm,
  listFormResponses,
  getFormResponse,
  setPublishSettings,
} from "../google/forms";
import { logError, logInfo } from "../logger";

export function createCreateFormTool(ctx: AgentContext) {
  return tool({
    description: "Create a new Google Form",
    inputSchema: z.object({
      title: z.string().describe("Form title"),
    }),
    execute: async ({ title }) => {
      logInfo("tool:createForm", "Creating form", ctx.doctorId, { title });
      try {
        const result = await createForm(ctx.doctorId, title, ctx.supabase);
        logInfo("tool:createForm", "Created form", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:createForm", "Failed to create form", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createGetFormTool(ctx: AgentContext) {
  return tool({
    description: "Get a Google Form",
    inputSchema: z.object({
      formId: z.string().describe("Form ID"),
    }),
    execute: async ({ formId }) => {
      logInfo("tool:getForm", "Fetching form", ctx.doctorId, { formId });
      try {
        const result = await getForm(ctx.doctorId, formId, ctx.supabase);
        logInfo("tool:getForm", "Fetched form", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:getForm", "Failed to get form", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createBatchUpdateFormTool(ctx: AgentContext) {
  return tool({
    description: "Batch update a Google Form",
    inputSchema: z.object({
      formId: z.string().describe("Form ID"),
      requests: z.array(z.any()).describe("Array of batch update requests"),
    }),
    execute: async ({ formId, requests }) => {
      logInfo("tool:batchUpdateForm", "Batch updating form", ctx.doctorId, { formId });
      try {
        const result = await batchUpdateForm(ctx.doctorId, formId, requests, ctx.supabase);
        logInfo("tool:batchUpdateForm", "Batch updated form", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:batchUpdateForm", "Failed to batch update form", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createListFormResponsesTool(ctx: AgentContext) {
  return tool({
    description: "List responses to a Google Form",
    inputSchema: z.object({
      formId: z.string().describe("Form ID"),
      pageSize: z.number().default(100).describe("Page size"),
    }),
    execute: async ({ formId, pageSize }) => {
      logInfo("tool:listFormResponses", "Listing form responses", ctx.doctorId, { formId, pageSize });
      try {
        const result = await listFormResponses(ctx.doctorId, formId, pageSize ?? 100, ctx.supabase);
        logInfo("tool:listFormResponses", `Found ${result.responses.length} responses`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:listFormResponses", "Failed to list form responses", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createGetFormResponseTool(ctx: AgentContext) {
  return tool({
    description: "Get a specific response to a Google Form",
    inputSchema: z.object({
      formId: z.string().describe("Form ID"),
      responseId: z.string().describe("Response ID"),
    }),
    execute: async ({ formId, responseId }) => {
      logInfo("tool:getFormResponse", "Fetching form response", ctx.doctorId, { formId, responseId });
      try {
        const result = await getFormResponse(ctx.doctorId, formId, responseId, ctx.supabase);
        logInfo("tool:getFormResponse", "Fetched form response", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:getFormResponse", "Failed to get form response", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createSetPublishSettingsTool(ctx: AgentContext) {
  return tool({
    description: "Set publish settings for a Google Form",
    inputSchema: z.object({
      formId: z.string().describe("Form ID"),
      settings: z.any().describe("Publish settings"),
    }),
    execute: async ({ formId, settings }) => {
      logInfo("tool:setPublishSettings", "Setting form publish settings", ctx.doctorId, { formId });
      try {
        const result = await setPublishSettings(ctx.doctorId, formId, settings, ctx.supabase);
        logInfo("tool:setPublishSettings", "Set form publish settings", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:setPublishSettings", "Failed to set form publish settings", err, ctx.doctorId);
        throw err;
      }
    },
  });
}






