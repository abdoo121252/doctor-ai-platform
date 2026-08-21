import { tool } from "ai";
import { z } from "zod";
import type { AgentContext } from "../context";
import {
  listContacts,
  getContact,
  searchContacts,
  manageContact,
  manageContactsBatch,
  listContactGroups,
  getContactGroup,
  manageContactGroup,
} from "../google/contacts";
import { logError, logInfo } from "../logger";

export function createListContactsTool(ctx: AgentContext) {
  return tool({
    description: "List the doctor's Google Contacts",
    inputSchema: z.object({
      pageSize: z.number().default(100).describe("Page size"),
    }),
    execute: async ({ pageSize }) => {
      logInfo("tool:listContacts", "Listing contacts", ctx.doctorId, { pageSize });
      try {
        const result = await listContacts(ctx.doctorId, pageSize ?? 100, ctx.supabase);
        logInfo("tool:listContacts", `Found ${result.contacts.length} contacts`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:listContacts", "Failed to list contacts", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createGetContactTool(ctx: AgentContext) {
  return tool({
    description: "Get a specific Google Contact",
    inputSchema: z.object({
      resourceName: z.string().describe("Contact resource name"),
    }),
    execute: async ({ resourceName }) => {
      logInfo("tool:getContact", "Fetching contact", ctx.doctorId, { resourceName });
      try {
        const result = await getContact(ctx.doctorId, resourceName, ctx.supabase);
        logInfo("tool:getContact", "Fetched contact", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:getContact", "Failed to get contact", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createSearchContactsTool(ctx: AgentContext) {
  return tool({
    description: "Search Google Contacts",
    inputSchema: z.object({
      query: z.string().describe("Search query"),
      pageSize: z.number().default(30).describe("Page size"),
    }),
    execute: async ({ query, pageSize }) => {
      logInfo("tool:searchContacts", "Searching contacts", ctx.doctorId, { query, pageSize });
      try {
        const result = await searchContacts(ctx.doctorId, query, pageSize ?? 30, ctx.supabase);
        logInfo("tool:searchContacts", `Found ${result.contacts.length} contacts`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:searchContacts", "Failed to search contacts", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createManageContactTool(ctx: AgentContext) {
  return tool({
    description: "Manage a Google Contact",
    inputSchema: z.object({
      action: z.enum(["create", "update", "delete"]).describe("Action to perform"),
      contact: z.object({
        givenName: z.string().optional(),
        familyName: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        organization: z.string().optional(),
      }).optional(),
      resourceName: z.string().optional(),
    }),
    execute: async ({ action, contact, resourceName }) => {
      logInfo("tool:manageContact", `Managing contact: ${action}`, ctx.doctorId, { action });
      try {
        const result = await manageContact(ctx.doctorId, action, contact, resourceName, ctx.supabase);
        logInfo("tool:manageContact", `Managed contact: ${action}`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:manageContact", "Failed to manage contact", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createManageContactsBatchTool(ctx: AgentContext) {
  return tool({
    description: "Manage multiple Google Contacts in batch",
    inputSchema: z.object({
      action: z.enum(["create", "update", "delete"]).describe("Action to perform"),
      contacts: z.array(z.any()).describe("Array of contact objects"),
    }),
    execute: async ({ action, contacts }) => {
      logInfo("tool:manageContactsBatch", `Managing contacts batch: ${action}`, ctx.doctorId, { count: contacts.length });
      try {
        const result = await manageContactsBatch(ctx.doctorId, action, contacts, ctx.supabase);
        logInfo("tool:manageContactsBatch", `Managed contacts batch: ${action}`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:manageContactsBatch", "Failed to manage contacts batch", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createListContactGroupsTool(ctx: AgentContext) {
  return tool({
    description: "List Google Contact groups",
    inputSchema: z.object({}),
    execute: async () => {
      logInfo("tool:listContactGroups", "Listing contact groups");
      try {
        const result = await listContactGroups(ctx.doctorId, ctx.supabase);
        logInfo("tool:listContactGroups", `Found ${result.groups.length} contact groups`);
        return result;
      } catch (err) {
        logError("tool:listContactGroups", "Failed to list contact groups", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createGetContactGroupTool(ctx: AgentContext) {
  return tool({
    description: "Get a specific Google Contact group",
    inputSchema: z.object({
      resourceName: z.string().describe("Contact group resource name"),
    }),
    execute: async ({ resourceName }) => {
      logInfo("tool:getContactGroup", "Fetching contact group", ctx.doctorId, { resourceName });
      try {
        const result = await getContactGroup(ctx.doctorId, resourceName, ctx.supabase);
        logInfo("tool:getContactGroup", "Fetched contact group", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:getContactGroup", "Failed to get contact group", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createManageContactGroupTool(ctx: AgentContext) {
  return tool({
    description: "Manage a Google Contact group",
    inputSchema: z.object({
      action: z.enum(["create", "update", "delete"]).describe("Action to perform"),
      name: z.string().optional().describe("Contact group name"),
      resourceName: z.string().optional().describe("Contact group resource name"),
    }),
    execute: async ({ action, name, resourceName }) => {
      logInfo("tool:manageContactGroup", `Managing contact group: ${action}`, ctx.doctorId, { action, name, resourceName });
      try {
        const result = await manageContactGroup(ctx.doctorId, action, name, resourceName, ctx.supabase);
        logInfo("tool:manageContactGroup", `Managed contact group: ${action}`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:manageContactGroup", "Failed to manage contact group", err, ctx.doctorId);
        throw err;
      }
    },
  });
}








