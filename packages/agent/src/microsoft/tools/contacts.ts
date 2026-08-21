import { tool } from "ai";
import { z } from "zod";
import type { AgentContext } from "../../context";
import {
  listOutlookContacts,
  searchOutlookContacts,
  getOutlookContact,
  createOutlookContact,
  updateOutlookContact,
  deleteOutlookContact,
  listOutlookContactFolders,
  createOutlookContactFolder,
} from "../contacts";
import { logError, logInfo } from "../../logger";

export function createListOutlookContactsTool(ctx: AgentContext) {
  return tool({
    description: "List the doctor's Outlook contacts",
    inputSchema: z.object({
      maxResults: z.number().default(50).describe("Maximum contacts"),
      folderId: z.string().optional().describe("Contact folder ID"),
    }),
    execute: async ({ maxResults, folderId }) => {
      logInfo("tool:listOutlookContacts", "Fetching contacts", ctx.doctorId);
      try {
        const result = await listOutlookContacts(ctx.doctorId, { maxResults, folderId }, ctx.supabase);
        logInfo("tool:listOutlookContacts", `Retrieved ${result.contacts.length} contacts`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:listOutlookContacts", "Failed to fetch contacts", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createSearchOutlookContactsTool(ctx: AgentContext) {
  return tool({
    description: "Search the doctor's Outlook contacts by name, email, company, or title",
    inputSchema: z.object({
      query: z.string().describe("Search query"),
    }),
    execute: async ({ query }) => {
      logInfo("tool:searchOutlookContacts", "Searching contacts", ctx.doctorId, { query });
      try {
        const result = await searchOutlookContacts(ctx.doctorId, query, ctx.supabase);
        logInfo("tool:searchOutlookContacts", `Found ${result.contacts.length} contacts`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:searchOutlookContacts", "Search failed", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createGetOutlookContactTool(ctx: AgentContext) {
  return tool({
    description: "Get a single Outlook contact by ID",
    inputSchema: z.object({
      contactId: z.string().describe("Contact ID"),
    }),
    execute: async ({ contactId }) => {
      logInfo("tool:getOutlookContact", "Fetching contact", ctx.doctorId, { contactId });
      try {
        const result = await getOutlookContact(ctx.doctorId, contactId, ctx.supabase);
        logInfo("tool:getOutlookContact", `Got contact: ${result.displayName}`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:getOutlookContact", "Failed to fetch contact", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createCreateOutlookContactTool(ctx: AgentContext, needsApproval = false) {
  return tool({
    description: "Create a new Outlook contact",
    inputSchema: z.object({
      givenName: z.string().optional().describe("First name"),
      surname: z.string().optional().describe("Last name"),
      displayName: z.string().optional().describe("Display name"),
      emailAddresses: z
        .union([z.string(), z.array(z.string()), z.array(z.object({ address: z.string(), name: z.string().optional() }))])
        .optional()
        .describe("Email address(es)"),
      businessPhones: z.union([z.string(), z.array(z.string())]).optional().describe("Business phone(s)"),
      homePhones: z.union([z.string(), z.array(z.string())]).optional().describe("Home phone(s)"),
      mobilePhone: z.string().optional().describe("Mobile phone"),
      companyName: z.string().optional(),
      jobTitle: z.string().optional(),
      department: z.string().optional(),
      officeLocation: z.string().optional(),
      businessAddress: z.record(z.unknown()).optional(),
      homeAddress: z.record(z.unknown()).optional(),
      birthday: z.string().optional(),
      personalNotes: z.string().optional(),
      categories: z.union([z.string(), z.array(z.string())]).optional(),
      folderId: z.string().optional().describe("Contact folder ID"),
    }),
    needsApproval,
    execute: async (input) => {
      const { folderId, ...contactData } = input;
      try {
        const result = await createOutlookContact(ctx.doctorId, contactData, ctx.supabase, folderId);
        logInfo("tool:createOutlookContact", `Created contact: ${result.contactId}`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:createOutlookContact", "Failed to create contact", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createUpdateOutlookContactTool(ctx: AgentContext, needsApproval = false) {
  return tool({
    description: "Update an existing Outlook contact",
    inputSchema: z.object({
      contactId: z.string().describe("Contact ID"),
      givenName: z.string().optional(),
      surname: z.string().optional(),
      displayName: z.string().optional(),
      emailAddresses: z
        .union([z.string(), z.array(z.string()), z.array(z.object({ address: z.string(), name: z.string().optional() }))])
        .optional(),
      businessPhones: z.union([z.string(), z.array(z.string())]).optional(),
      homePhones: z.union([z.string(), z.array(z.string())]).optional(),
      mobilePhone: z.string().optional(),
      companyName: z.string().optional(),
      jobTitle: z.string().optional(),
      department: z.string().optional(),
      officeLocation: z.string().optional(),
      personalNotes: z.string().optional(),
      categories: z.union([z.string(), z.array(z.string())]).optional(),
    }),
    needsApproval,
    execute: async (input) => {
      const { contactId, ...updateData } = input;
      try {
        const result = await updateOutlookContact(ctx.doctorId, contactId, updateData, ctx.supabase);
        logInfo("tool:updateOutlookContact", `Updated contact: ${result.contactId}`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:updateOutlookContact", "Failed to update contact", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createDeleteOutlookContactTool(ctx: AgentContext, needsApproval = false) {
  return tool({
    description: "Delete an Outlook contact",
    inputSchema: z.object({
      contactId: z.string().describe("Contact ID"),
    }),
    needsApproval,
    execute: async ({ contactId }) => {
      try {
        const result = await deleteOutlookContact(ctx.doctorId, contactId, ctx.supabase);
        logInfo("tool:deleteOutlookContact", "Contact deleted", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:deleteOutlookContact", "Failed to delete contact", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createListOutlookContactFoldersTool(ctx: AgentContext) {
  return tool({
    description: "List the doctor's Outlook contact folders",
    inputSchema: z.object({
      maxResults: z.number().default(50).describe("Maximum folders"),
    }),
    execute: async ({ maxResults }) => {
      logInfo("tool:listOutlookContactFolders", "Fetching contact folders", ctx.doctorId);
      try {
        const result = await listOutlookContactFolders(ctx.doctorId, maxResults ?? 50, ctx.supabase);
        logInfo("tool:listOutlookContactFolders", `Retrieved ${result.folders.length} folders`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:listOutlookContactFolders", "Failed to fetch folders", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createCreateOutlookContactFolderTool(ctx: AgentContext) {
  return tool({
    description: "Create a new Outlook contact folder",
    inputSchema: z.object({
      displayName: z.string().describe("Folder name"),
      parentFolderId: z.string().optional().describe("Parent folder ID"),
    }),
    execute: async ({ displayName, parentFolderId }) => {
      try {
        const result = await createOutlookContactFolder(ctx.doctorId, displayName, parentFolderId, ctx.supabase);
        logInfo("tool:createOutlookContactFolder", `Created folder: ${result.folderId}`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:createOutlookContactFolder", "Failed to create folder", err, ctx.doctorId);
        throw err;
      }
    },
  });
}