import { tool } from "ai";
import { z } from "zod";
import type { AgentContext } from "../../context";
import {
  listTodoLists,
  createTodoList,
  getTodoList,
  updateTodoList,
  deleteTodoList,
  listTodoTasks,
  createTodoTask,
  getTodoTask,
  updateTodoTask,
  deleteTodoTask,
  listTodoChecklist,
  addTodoChecklistItem,
  updateTodoChecklistItem,
} from "../todo";
import { logError, logInfo } from "../../logger";

export function createListTodoListsTool(ctx: AgentContext) {
  return tool({
    description: "List the doctor's Microsoft To Do lists",
    inputSchema: z.object({
      maxResults: z.number().default(50).describe("Maximum lists"),
    }),
    execute: async ({ maxResults }) => {
      logInfo("tool:listTodoLists", "Fetching To Do lists", ctx.doctorId);
      try {
        const result = await listTodoLists(ctx.doctorId, maxResults ?? 50, ctx.supabase);
        logInfo("tool:listTodoLists", `Retrieved ${result.lists.length} lists`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:listTodoLists", "Failed to fetch lists", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createCreateTodoListTool(ctx: AgentContext) {
  return tool({
    description: "Create a new Microsoft To Do list",
    inputSchema: z.object({
      displayName: z.string().describe("List name"),
    }),
    execute: async ({ displayName }) => {
      try {
        const result = await createTodoList(ctx.doctorId, displayName, ctx.supabase);
        logInfo("tool:createTodoList", `Created list: ${result.listId}`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:createTodoList", "Failed to create list", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createGetTodoListTool(ctx: AgentContext) {
  return tool({
    description: "Get a single Microsoft To Do list by ID",
    inputSchema: z.object({
      listId: z.string().describe("To Do list ID"),
    }),
    execute: async ({ listId }) => {
      try {
        const result = await getTodoList(ctx.doctorId, listId, ctx.supabase);
        logInfo("tool:getTodoList", `Got list: ${result.displayName}`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:getTodoList", "Failed to fetch list", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createUpdateTodoListTool(ctx: AgentContext) {
  return tool({
    description: "Rename a Microsoft To Do list",
    inputSchema: z.object({
      listId: z.string().describe("To Do list ID"),
      displayName: z.string().describe("New list name"),
    }),
    execute: async ({ listId, displayName }) => {
      try {
        const result = await updateTodoList(ctx.doctorId, listId, displayName, ctx.supabase);
        logInfo("tool:updateTodoList", "List renamed", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:updateTodoList", "Failed to rename list", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createDeleteTodoListTool(ctx: AgentContext, needsApproval = false) {
  return tool({
    description: "Delete a Microsoft To Do list (and its tasks)",
    inputSchema: z.object({
      listId: z.string().describe("To Do list ID"),
    }),
    needsApproval,
    execute: async ({ listId }) => {
      try {
        const result = await deleteTodoList(ctx.doctorId, listId, ctx.supabase);
        logInfo("tool:deleteTodoList", "List deleted", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:deleteTodoList", "Failed to delete list", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createListTodoTasksTool(ctx: AgentContext) {
  return tool({
    description: "List tasks in a Microsoft To Do list",
    inputSchema: z.object({
      listId: z.string().describe("To Do list ID"),
      maxResults: z.number().default(50).describe("Maximum tasks"),
      status: z.string().optional().describe("Filter by status (e.g. notStarted, inProgress, completed)"),
    }),
    execute: async ({ listId, maxResults, status }) => {
      logInfo("tool:listTodoTasks", "Fetching tasks", ctx.doctorId, { listId });
      try {
        const result = await listTodoTasks(ctx.doctorId, listId, { maxResults, status }, ctx.supabase);
        logInfo("tool:listTodoTasks", `Retrieved ${result.tasks.length} tasks`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:listTodoTasks", "Failed to fetch tasks", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createCreateTodoTaskTool(ctx: AgentContext, needsApproval = false) {
  return tool({
    description: "Create a task in a Microsoft To Do list",
    inputSchema: z.object({
      listId: z.string().describe("To Do list ID"),
      title: z.string().describe("Task title"),
      status: z.string().optional().describe("Status (default notStarted)"),
      importance: z.string().optional().describe("Importance (low, normal, high)"),
      dueDateTime: z.string().optional().describe("Due date (ISO 8601)"),
      body: z.string().optional().describe("Task notes"),
      reminderDateTime: z.string().optional().describe("Reminder time (ISO 8601)"),
      isReminderOn: z.boolean().optional().describe("Enable reminder"),
    }),
    needsApproval,
    execute: async (input) => {
      const { listId, ...task } = input;
      try {
        const result = await createTodoTask(ctx.doctorId, listId, task, ctx.supabase);
        logInfo("tool:createTodoTask", `Created task: ${result.taskId}`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:createTodoTask", "Failed to create task", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createGetTodoTaskTool(ctx: AgentContext) {
  return tool({
    description: "Get a single task from a Microsoft To Do list",
    inputSchema: z.object({
      listId: z.string().describe("To Do list ID"),
      taskId: z.string().describe("Task ID"),
    }),
    execute: async ({ listId, taskId }) => {
      try {
        const result = await getTodoTask(ctx.doctorId, listId, taskId, ctx.supabase);
        logInfo("tool:getTodoTask", `Got task: ${result.title}`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:getTodoTask", "Failed to fetch task", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createUpdateTodoTaskTool(ctx: AgentContext, needsApproval = false) {
  return tool({
    description: "Update a task in a Microsoft To Do list (title, status, due date, etc.)",
    inputSchema: z.object({
      listId: z.string().describe("To Do list ID"),
      taskId: z.string().describe("Task ID"),
      title: z.string().optional(),
      status: z.string().optional(),
      importance: z.string().optional(),
      dueDateTime: z.string().optional(),
      body: z.string().optional(),
      isReminderOn: z.boolean().optional(),
      completedDateTime: z.union([z.string(), z.null()]).optional(),
    }),
    needsApproval,
    execute: async ({ listId, taskId, ...updates }) => {
      try {
        const result = await updateTodoTask(ctx.doctorId, listId, taskId, updates, ctx.supabase);
        logInfo("tool:updateTodoTask", `Updated task: ${result.taskId}`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:updateTodoTask", "Failed to update task", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createDeleteTodoTaskTool(ctx: AgentContext, needsApproval = false) {
  return tool({
    description: "Delete a task from a Microsoft To Do list",
    inputSchema: z.object({
      listId: z.string().describe("To Do list ID"),
      taskId: z.string().describe("Task ID"),
    }),
    needsApproval,
    execute: async ({ listId, taskId }) => {
      try {
        const result = await deleteTodoTask(ctx.doctorId, listId, taskId, ctx.supabase);
        logInfo("tool:deleteTodoTask", "Task deleted", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:deleteTodoTask", "Failed to delete task", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createListTodoChecklistTool(ctx: AgentContext) {
  return tool({
    description: "List the checklist items of a Microsoft To Do task",
    inputSchema: z.object({
      listId: z.string().describe("To Do list ID"),
      taskId: z.string().describe("Task ID"),
    }),
    execute: async ({ listId, taskId }) => {
      try {
        const result = await listTodoChecklist(ctx.doctorId, listId, taskId, ctx.supabase);
        logInfo("tool:listTodoChecklist", `Retrieved ${result.items.length} checklist items`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:listTodoChecklist", "Failed to fetch checklist", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createAddTodoChecklistItemTool(ctx: AgentContext, needsApproval = false) {
  return tool({
    description: "Add a checklist item to a Microsoft To Do task",
    inputSchema: z.object({
      listId: z.string().describe("To Do list ID"),
      taskId: z.string().describe("Task ID"),
      displayName: z.string().describe("Checklist item text"),
    }),
    needsApproval,
    execute: async ({ listId, taskId, displayName }) => {
      try {
        const result = await addTodoChecklistItem(ctx.doctorId, listId, taskId, displayName, ctx.supabase);
        logInfo("tool:addTodoChecklistItem", `Added item: ${result.itemId}`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:addTodoChecklistItem", "Failed to add checklist item", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createUpdateTodoChecklistItemTool(ctx: AgentContext, needsApproval = false) {
  return tool({
    description: "Update (rename or check off) a checklist item on a Microsoft To Do task",
    inputSchema: z.object({
      listId: z.string().describe("To Do list ID"),
      taskId: z.string().describe("Task ID"),
      checklistItemId: z.string().describe("Checklist item ID"),
      displayName: z.string().optional().describe("New text"),
      isChecked: z.boolean().optional().describe("Check off or uncheck"),
    }),
    needsApproval,
    execute: async ({ listId, taskId, checklistItemId, ...updates }) => {
      try {
        const result = await updateTodoChecklistItem(ctx.doctorId, listId, taskId, checklistItemId, updates, ctx.supabase);
        logInfo("tool:updateTodoChecklistItem", "Checklist item updated", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:updateTodoChecklistItem", "Failed to update checklist item", err, ctx.doctorId);
        throw err;
      }
    },
  });
}