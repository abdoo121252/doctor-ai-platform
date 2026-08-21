import { tool } from "ai";
import { z } from "zod";
import type { AgentContext } from "../context";
import {
  searchFiles,
  getFileContent,
  getDownloadUrl,
  createFile,
  createFolder,
  importFile,
  getShareableLink,
  listItems,
  copyFile,
  updateFile,
  deleteFile,
  getPermissions,
  setPermissions,
  checkPublicAccess,
} from "../google/drive";
import { logError, logInfo } from "../logger";

export function createSearchDriveTool(ctx: AgentContext, needsApproval = false) {
  return tool({
    description: "Search for files in the doctor's Google Drive",
    inputSchema: z.object({
      query: z.string().describe("Search query"),
      maxResults: z.number().default(10).describe("Maximum number of results"),
    }),
    needsApproval: needsApproval,
    execute: async ({ query, maxResults }) => {
      logInfo("tool:searchDrive", "Searching Drive", ctx.doctorId, { query, maxResults });
      try {
        const result = await searchFiles(ctx.doctorId, query, maxResults ?? 10, ctx.supabase);
        logInfo("tool:searchDrive", `Found ${result.files.length} files`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:searchDrive", "Failed to search Drive", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createGetDriveFileContentTool(ctx: AgentContext) {
  return tool({
    description: "Get content of a Google Drive file",
    inputSchema: z.object({
      fileId: z.string().describe("Google Drive file ID"),
    }),
    execute: async ({ fileId }) => {
      logInfo("tool:getDriveFileContent", "Fetching Drive file content", ctx.doctorId, { fileId });
      try {
        const result = await getFileContent(ctx.doctorId, fileId, ctx.supabase);
        logInfo("tool:getDriveFileContent", "Fetched Drive file content", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:getDriveFileContent", "Failed to fetch Drive file content", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createGetDriveDownloadUrlTool(ctx: AgentContext) {
  return tool({
    description: "Get download URL for a Google Drive file",
    inputSchema: z.object({
      fileId: z.string().describe("Google Drive file ID"),
    }),
    execute: async ({ fileId }) => {
      logInfo("tool:getDriveDownloadUrl", "Getting Drive download URL", ctx.doctorId, { fileId });
      try {
        const result = await getDownloadUrl(ctx.doctorId, fileId, ctx.supabase);
        logInfo("tool:getDriveDownloadUrl", "Got Drive download URL", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:getDriveDownloadUrl", "Failed to get Drive download URL", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createCreateDriveFileTool(ctx: AgentContext) {
  return tool({
    description: "Create a new Google Drive file",
    inputSchema: z.object({
      name: z.string().describe("File name"),
      mimeType: z.string().describe("File MIME type"),
      content: z.string().optional().describe("File content (for text-based files)"),
      folderId: z.string().optional().describe("Parent folder ID"),
    }),
    execute: async ({ name, mimeType, content, folderId }) => {
      logInfo("tool:createDriveFile", "Creating Drive file", ctx.doctorId, { name, mimeType, folderId });
      try {
        const result = await createFile(ctx.doctorId, name, mimeType, content, folderId, ctx.supabase);
        logInfo("tool:createDriveFile", "Created Drive file", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:createDriveFile", "Failed to create Drive file", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createCreateDriveFolderTool(ctx: AgentContext) {
  return tool({
    description: "Create a new Google Drive folder",
    inputSchema: z.object({
      name: z.string().describe("Folder name"),
      parentFolderId: z.string().optional().describe("Parent folder ID"),
    }),
    execute: async ({ name, parentFolderId }) => {
      logInfo("tool:createDriveFolder", "Creating Drive folder", ctx.doctorId, { name, parentFolderId });
      try {
        const result = await createFolder(ctx.doctorId, name, parentFolderId, ctx.supabase);
        logInfo("tool:createDriveFolder", "Created Drive folder", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:createDriveFolder", "Failed to create Drive folder", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createImportDriveFileTool(ctx: AgentContext) {
  return tool({
    description: "Import a file to Google Drive as Docs/Sheets/Slides",
    inputSchema: z.object({
      name: z.string().describe("File name"),
      mimeType: z.string().describe("Source file MIME type"),
      content: z.string().describe("File content"),
      targetType: z.enum(["doc", "slides", "sheets"]).describe("Target Google Workspace type"),
    }),
    execute: async ({ name, mimeType, content, targetType }) => {
      logInfo("tool:importDriveFile", "Importing file to Drive", ctx.doctorId, { name, mimeType, targetType });
      try {
        const result = await importFile(ctx.doctorId, name, mimeType, content, targetType, ctx.supabase);
        logInfo("tool:importDriveFile", "Imported file to Drive", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:importDriveFile", "Failed to import file to Drive", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createGetDriveShareableLinkTool(ctx: AgentContext) {
  return tool({
    description: "Get shareable link for a Google Drive file",
    inputSchema: z.object({
      fileId: z.string().describe("Google Drive file ID"),
    }),
    execute: async ({ fileId }) => {
      logInfo("tool:getDriveShareableLink", "Getting Drive shareable link", ctx.doctorId, { fileId });
      try {
        const result = await getShareableLink(ctx.doctorId, fileId, ctx.supabase);
        logInfo("tool:getDriveShareableLink", "Got Drive shareable link", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:getDriveShareableLink", "Failed to get Drive shareable link", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createListDriveItemsTool(ctx: AgentContext) {
  return tool({
    description: "List items in Google Drive",
    inputSchema: z.object({
      folderId: z.string().optional().describe("Folder ID to list (optional, defaults to root)"),
      maxResults: z.number().default(100).describe("Maximum number of results"),
    }),
    execute: async ({ folderId, maxResults }) => {
      logInfo("tool:listDriveItems", "Listing Drive items", ctx.doctorId, { folderId, maxResults });
      try {
        const result = await listItems(ctx.doctorId, folderId, maxResults ?? 100, ctx.supabase);
        logInfo("tool:listDriveItems", `Found ${result.files.length} items`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:listDriveItems", "Failed to list Drive items", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createCopyDriveFileTool(ctx: AgentContext) {
  return tool({
    description: "Copy a Google Drive file",
    inputSchema: z.object({
      fileId: z.string().describe("Google Drive file ID to copy"),
      newName: z.string().optional().describe("New file name (optional)"),
    }),
    execute: async ({ fileId, newName }) => {
      logInfo("tool:copyDriveFile", "Copying Drive file", ctx.doctorId, { fileId, newName });
      try {
        const result = await copyFile(ctx.doctorId, fileId, newName, ctx.supabase);
        logInfo("tool:copyDriveFile", "Copied Drive file", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:copyDriveFile", "Failed to copy Drive file", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createUpdateDriveFileTool(ctx: AgentContext) {
  return tool({
    description: "Update a Google Drive file",
    inputSchema: z.object({
      fileId: z.string().describe("Google Drive file ID"),
      name: z.string().optional().describe("New file name"),
      content: z.string().optional().describe("New file content"),
    }),
    execute: async ({ fileId, name, content }) => {
      logInfo("tool:updateDriveFile", "Updating Drive file", ctx.doctorId, { fileId, name, content });
      try {
        const result = await updateFile(ctx.doctorId, fileId, name, content, ctx.supabase);
        logInfo("tool:updateDriveFile", "Updated Drive file", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:updateDriveFile", "Failed to update Drive file", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createDeleteDriveFileTool(ctx: AgentContext) {
  return tool({
    description: "Delete a Google Drive file",
    inputSchema: z.object({
      fileId: z.string().describe("Google Drive file ID"),
    }),
    execute: async ({ fileId }) => {
      logInfo("tool:deleteDriveFile", "Deleting Drive file", ctx.doctorId, { fileId });
      try {
        const result = await deleteFile(ctx.doctorId, fileId, ctx.supabase);
        logInfo("tool:deleteDriveFile", "Deleted Drive file", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:deleteDriveFile", "Failed to delete Drive file", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createGetDrivePermissionsTool(ctx: AgentContext) {
  return tool({
    description: "Get permissions for a Google Drive file",
    inputSchema: z.object({
      fileId: z.string().describe("Google Drive file ID"),
    }),
    execute: async ({ fileId }) => {
      logInfo("tool:getDrivePermissions", "Getting Drive file permissions", ctx.doctorId, { fileId });
      try {
        const result = await getPermissions(ctx.doctorId, fileId, ctx.supabase);
        logInfo("tool:getDrivePermissions", "Got Drive file permissions", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:getDrivePermissions", "Failed to get Drive file permissions", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createSetDrivePermissionsTool(ctx: AgentContext) {
  return tool({
    description: "Set permissions for a Google Drive file",
    inputSchema: z.object({
      fileId: z.string().describe("Google Drive file ID"),
      role: z.string().describe("Permission role (e.g., 'reader', 'writer', 'owner')"),
      type: z.string().describe("Permission type (e.g., 'user', 'group', 'domain', 'anyone')"),
      emailAddress: z.string().optional().describe("Email address (for user/type)"),
    }),
    execute: async ({ fileId, role, type, emailAddress }) => {
      logInfo("tool:setDrivePermissions", "Setting Drive file permissions", ctx.doctorId, { fileId, role, type, emailAddress });
      try {
        const result = await setPermissions(ctx.doctorId, fileId, role, type, emailAddress, ctx.supabase);
        logInfo("tool:setDrivePermissions", "Set Drive file permissions", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:setDrivePermissions", "Failed to set Drive file permissions", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createCheckDrivePublicAccessTool(ctx: AgentContext) {
  return tool({
    description: "Check if a Google Drive file is publicly accessible",
    inputSchema: z.object({
      fileId: z.string().describe("Google Drive file ID"),
    }),
    execute: async ({ fileId }) => {
      logInfo("tool:checkDrivePublicAccess", "Checking Drive file public access", ctx.doctorId, { fileId });
      try {
        const result = await checkPublicAccess(ctx.doctorId, fileId, ctx.supabase);
        logInfo("tool:checkDrivePublicAccess", "Checked Drive file public access", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:checkDrivePublicAccess", "Failed to check Drive file public access", err, ctx.doctorId);
        throw err;
      }
    },
  });
}
