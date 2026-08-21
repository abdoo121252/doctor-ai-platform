import { tool } from "ai";
import { z } from "zod";
import type { AgentContext } from "../../context";
import {
  searchOneDrive,
  searchOneDriveAll,
  listOneDriveItems,
  getOneDriveItem,
  downloadOneDriveFile,
  uploadOneDriveFile,
  deleteOneDriveItem,
  shareOneDriveItem,
  moveOneDriveItem,
  copyOneDriveItem,
  createOneDriveFolder,
} from "../drive";
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

export function createSearchOneDriveAllTool(ctx: AgentContext) {
  return tool({
    description:
      "Search for files across ALL drives the doctor can access (OneDrive + SharePoint) using Microsoft Search",
    inputSchema: z.object({
      query: z.string().describe("Search query"),
      maxResults: z.number().default(20).describe("Maximum results"),
    }),
    execute: async ({ query, maxResults }) => {
      logInfo("tool:searchOneDriveAll", "Searching all drives", ctx.doctorId, { query });
      try {
        const result = await searchOneDriveAll(ctx.doctorId, query, maxResults ?? 20, ctx.supabase);
        logInfo("tool:searchOneDriveAll", `Found ${result.items.length} items`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:searchOneDriveAll", "Failed to search all drives", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createListOneDriveItemsTool(ctx: AgentContext) {
  return tool({
    description: "List files and folders in a OneDrive folder",
    inputSchema: z.object({
      folderId: z.string().optional().describe("Folder item ID (defaults to root)"),
      path: z.string().optional().describe("Folder path (e.g. 'Lecture Notes/Semester 1')"),
      driveId: z.string().optional().describe("Drive ID for a different drive"),
      maxResults: z.number().default(50).describe("Maximum items"),
    }),
    execute: async ({ folderId, path, driveId, maxResults }) => {
      logInfo("tool:listOneDriveItems", "Listing OneDrive items", ctx.doctorId, { folderId, path });
      try {
        const result = await listOneDriveItems(
          ctx.doctorId,
          { folderId, path, driveId, maxResults },
          ctx.supabase
        );
        logInfo("tool:listOneDriveItems", `Retrieved ${result.items.length} items`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:listOneDriveItems", "Failed to list items", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createGetOneDriveItemTool(ctx: AgentContext) {
  return tool({
    description: "Get metadata for a single OneDrive item by ID or path",
    inputSchema: z.object({
      fileId: z.string().optional().describe("OneDrive item ID"),
      path: z.string().optional().describe("Item path (e.g. 'Folder/file.pdf')"),
      driveId: z.string().optional().describe("Drive ID"),
    }),
    execute: async ({ fileId, path, driveId }) => {
      logInfo("tool:getOneDriveItem", "Fetching OneDrive item", ctx.doctorId, { fileId, path });
      try {
        const result = await getOneDriveItem(ctx.doctorId, { fileId, path, driveId }, ctx.supabase);
        logInfo("tool:getOneDriveItem", `Got item: ${result.name}`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:getOneDriveItem", "Failed to fetch item", err, ctx.doctorId);
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
        const result = await downloadOneDriveFile(ctx.doctorId, { fileId: itemId }, ctx.supabase);
        logInfo("tool:readOneDriveFile", `Read file: ${result.name}`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:readOneDriveFile", "Failed to read OneDrive file", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createDownloadOneDriveFileTool(ctx: AgentContext) {
  return tool({
    description:
      "Download a OneDrive file's content (text or base64) by ID or path, without saving it locally",
    inputSchema: z.object({
      fileId: z.string().optional().describe("OneDrive item ID"),
      path: z.string().optional().describe("Item path"),
      driveId: z.string().optional().describe("Drive ID"),
    }),
    execute: async ({ fileId, path, driveId }) => {
      logInfo("tool:downloadOneDriveFile", "Downloading OneDrive file", ctx.doctorId, { fileId, path });
      try {
        const result = await downloadOneDriveFile(ctx.doctorId, { fileId, path, driveId }, ctx.supabase);
        logInfo("tool:downloadOneDriveFile", `Downloaded: ${result.name}`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:downloadOneDriveFile", "Failed to download file", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createUploadOneDriveFileTool(ctx: AgentContext, needsApproval = false) {
  return tool({
    description:
      "Upload a file (base64 content, max ~250 KB) to OneDrive. Requires approval in automated sessions.",
    inputSchema: z.object({
      name: z.string().describe("File name"),
      contentBase64: z.string().describe("File content base64-encoded"),
      contentType: z.string().optional().describe("MIME content type"),
      parentId: z.string().optional().describe("Parent folder item ID (defaults to root)"),
      parentPath: z.string().optional().describe("Parent folder path"),
      driveId: z.string().optional().describe("Drive ID"),
      conflictBehavior: z.enum(["fail", "rename", "replace"]).default("fail").describe("Conflict behavior"),
    }),
    needsApproval,
    execute: async ({ name, contentBase64, contentType, parentId, parentPath, driveId, conflictBehavior }) => {
      try {
        const result = await uploadOneDriveFile(
          ctx.doctorId,
          { name, content: contentBase64, contentType },
          { parentId, parentPath, driveId, conflictBehavior },
          ctx.supabase
        );
        logInfo("tool:uploadOneDriveFile", `Uploaded: ${result.name}`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:uploadOneDriveFile", "Failed to upload file", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createDeleteOneDriveItemTool(ctx: AgentContext, needsApproval = false) {
  return tool({
    description: "Delete a file or folder from OneDrive. Requires approval in automated sessions.",
    inputSchema: z.object({
      fileId: z.string().optional().describe("OneDrive item ID"),
      path: z.string().optional().describe("Item path"),
      driveId: z.string().optional().describe("Drive ID"),
    }),
    needsApproval,
    execute: async ({ fileId, path, driveId }) => {
      if (ctx.sessionType !== "chat" && ctx.requestApproval) {
        const result = await ctx.requestApproval("delete_file", { fileId, path });
        if (!result.approved) {
          throw new Error(result.reason ?? "Delete was rejected by doctor");
        }
      }
      try {
        const result = await deleteOneDriveItem(ctx.doctorId, { fileId, path, driveId }, ctx.supabase);
        logInfo("tool:deleteOneDriveItem", "Item deleted", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:deleteOneDriveItem", "Failed to delete item", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createShareOneDriveItemTool(ctx: AgentContext, needsApproval = false) {
  return tool({
    description: "Create a sharing link for a OneDrive item. Requires approval in automated sessions.",
    inputSchema: z.object({
      fileId: z.string().optional().describe("OneDrive item ID"),
      path: z.string().optional().describe("Item path"),
      driveId: z.string().optional().describe("Drive ID"),
      type: z.enum(["view", "edit", "embed"]).default("view").describe("Link type"),
      scope: z.enum(["anonymous", "organization"]).default("organization").describe("Link scope"),
      password: z.string().optional().describe("Link password"),
      expirationDateTime: z.string().optional().describe("Link expiry (ISO 8601)"),
    }),
    needsApproval,
    execute: async ({ fileId, path, driveId, type, scope, password, expirationDateTime }) => {
      if (ctx.sessionType !== "chat" && ctx.requestApproval) {
        const result = await ctx.requestApproval("share_file", { fileId, path });
        if (!result.approved) {
          throw new Error(result.reason ?? "Share was rejected by doctor");
        }
      }
      try {
        const result = await shareOneDriveItem(
          ctx.doctorId,
          { fileId, path, driveId, type, scope, password, expirationDateTime },
          ctx.supabase
        );
        logInfo("tool:shareOneDriveItem", "Share link created", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:shareOneDriveItem", "Failed to share item", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createMoveOneDriveItemTool(ctx: AgentContext, needsApproval = false) {
  return tool({
    description: "Move a OneDrive item into another folder",
    inputSchema: z.object({
      fileId: z.string().describe("OneDrive item ID"),
      destinationId: z.string().describe("Destination folder item ID"),
      newName: z.string().optional().describe("Rename the item while moving"),
      driveId: z.string().optional().describe("Drive ID"),
    }),
    needsApproval,
    execute: async (input) => {
      try {
        const result = await moveOneDriveItem(ctx.doctorId, input, ctx.supabase);
        logInfo("tool:moveOneDriveItem", `Moved to ${result.name}`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:moveOneDriveItem", "Failed to move item", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createCopyOneDriveItemTool(ctx: AgentContext) {
  return tool({
    description: "Copy a OneDrive item into a folder (completes asynchronously)",
    inputSchema: z.object({
      fileId: z.string().describe("OneDrive item ID"),
      destinationId: z.string().describe("Destination folder item ID"),
      newName: z.string().optional().describe("Name for the copy"),
      driveId: z.string().optional().describe("Drive ID"),
    }),
    execute: async (input) => {
      try {
        const result = await copyOneDriveItem(ctx.doctorId, input, ctx.supabase);
        logInfo("tool:copyOneDriveItem", "Copy started", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:copyOneDriveItem", "Failed to copy item", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createCreateOneDriveFolderTool(ctx: AgentContext) {
  return tool({
    description: "Create a new folder in OneDrive",
    inputSchema: z.object({
      name: z.string().describe("Folder name"),
      parentId: z.string().optional().describe("Parent folder item ID (defaults to root)"),
      parentPath: z.string().optional().describe("Parent folder path"),
      driveId: z.string().optional().describe("Drive ID"),
    }),
    execute: async ({ name, parentId, parentPath, driveId }) => {
      try {
        const result = await createOneDriveFolder(ctx.doctorId, name, { parentId, parentPath, driveId }, ctx.supabase);
        logInfo("tool:createOneDriveFolder", `Created folder: ${result.name}`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:createOneDriveFolder", "Failed to create folder", err, ctx.doctorId);
        throw err;
      }
    },
  });
}