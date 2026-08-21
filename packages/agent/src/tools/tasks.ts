import { tool } from "ai";
import { z } from "zod";
import type { AgentContext } from "../context";
import {
  listTaskLists,
  getTaskList,
  manageTaskList,
  listTasks,
  getTask,
  manageTask,
} from "../google/tasks";
import { logError, logInfo } from "../logger";

export function createListTaskListsTool(ctx: AgentContext) {
  return tool({
    description: "List the doctor's Google Task lists",
    inputSchema: z.object({}),
    execute: async () => {
      logInfo("tool:listTaskLists", "Listing task lists");
      try {
        const result = await listTaskLists(ctx.doctorId, ctx.supabase);
        logInfo("tool:listTaskLists", `Found ${result.taskLists.length} task lists`);
        return result;
      } catch (err) {
        logError("tool:listTaskLists", "Failed to list task lists", err);
        throw err;
      }
    },
  });
}

export function createGetTaskListTool(ctx: AgentContext) {
  return tool({
    description: "Get a Google Task list",
    inputSchema: z.object({
      taskListId: z.string().describe("Task list ID"),
    }),
    execute: async ({ taskListId }) => {
      logInfo("tool:getTaskList", "Fetching task list", ctx.doctorId, { taskListId });
      try {
        const result = await getTaskList(ctx.doctorId, taskListId, ctx.supabase);
        logInfo("tool:getTaskList", "Fetched task list", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:getTaskList", "Failed to get task list", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createManageTaskListTool(ctx: AgentContext) {
  return tool({
    description: "Manage a Google Task list",
    inputSchema: z.object({
      action: z.enum(["create", "update", "delete"]).describe("Action to perform"),
      title: z.string().optional().describe("Task list title"),
      taskListId: z.string().optional().describe("Task list ID"),
    }),
    execute: async ({ action, title, taskListId }) => {
      logInfo("tool:manageTaskList", `Managing task list: ${action}`, ctx.doctorId, { action, title, taskListId });
      try {
        const result = await manageTaskList(ctx.doctorId, action, title, taskListId, ctx.supabase);
        logInfo("tool:manageTaskList", `Managed task list: ${action}`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:manageTaskList", "Failed to manage task list", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createListTasksTool(ctx: AgentContext) {
  return tool({
    description: "List tasks in a Google Task list",
    inputSchema: z.object({
      taskListId: z.string().optional().default("@default").describe("Task list ID (defaults to @default)"),
      maxResults: z.number().default(100).describe("Maximum number of results"),
    }),
    execute: async ({ taskListId, maxResults }) => {
      logInfo("tool:listTasks", "Listing tasks", ctx.doctorId, { taskListId, maxResults });
      try {
        const result = await listTasks(ctx.doctorId, taskListId ?? "@default", maxResults ?? 100, ctx.supabase);
        logInfo("tool:listTasks", `Found ${result.tasks.length} tasks`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:listTasks", "Failed to list tasks", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createGetTaskTool(ctx: AgentContext) {
  return tool({
    description: "Get a specific Google Task",
    inputSchema: z.object({
      taskListId: z.string().optional().default("@default").describe("Task list ID (defaults to @default)"),
      taskId: z.string().describe("Task ID"),
    }),
    execute: async ({ taskListId, taskId }) => {
      logInfo("tool:getTask", "Fetching task", ctx.doctorId, { taskListId, taskId });
      try {
        const result = await getTask(ctx.doctorId, taskListId ?? "@default", taskId, ctx.supabase);
        logInfo("tool:getTask", "Fetched task", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:getTask", "Failed to get task", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createManageTaskTool(ctx: AgentContext) {
  return tool({
    description: "Manage a Google Task",
    inputSchema: z.object({
      action: z.enum(["create", "update", "delete"]).describe("Action to perform"),
      taskListId: z.string().optional().default("@default").describe("Task list ID (defaults to @default)"),
      task: z.any().optional().describe("Task object (for create)"),
      taskId: z.string().optional().describe("Task ID (for update/delete)"),
    }),
    execute: async ({ action, taskListId, task, taskId }) => {
      logInfo("tool:manageTask", `Managing task: ${action}`, ctx.doctorId, { action, taskListId, task, taskId });
      try {
        const result = await manageTask(ctx.doctorId, action, taskListId, task, taskId, ctx.supabase);
        logInfo("tool:manageTask", `Managed task: ${action}`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:manageTask", "Failed to manage task", err, ctx.doctorId);
        throw err;
      }
    },
  });
}






