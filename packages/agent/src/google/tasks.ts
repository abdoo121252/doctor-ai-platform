import { google } from "googleapis";
import { getGoogleAuth } from "./auth";

export async function listTaskLists(
  doctorId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const tasks = google.tasks({ version: "v1", auth });
  const res = await tasks.tasklists.list();
  return { taskLists: res.data.items ?? [] };
}

export async function getTaskList(
  doctorId: string,
  taskListId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const tasks = google.tasks({ version: "v1", auth });
  const res = await tasks.tasklists.get({ tasklist: taskListId });
  return res.data;
}

export async function manageTaskList(
  doctorId: string,
  action: "create" | "update" | "delete",
  title?: string,
  taskListId?: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const tasks = google.tasks({ version: "v1", auth });
  if (action === "create" && title) {
    const res = await tasks.tasklists.insert({ requestBody: { title } });
    return { created: true, taskList: res.data };
  }
  if (action === "update" && taskListId) {
    const res = await tasks.tasklists.update({
      tasklist: taskListId,
      requestBody: title ? { title } : undefined,
    });
    return { updated: true, taskList: res.data };
  }
  if (action === "delete" && taskListId) {
    await tasks.tasklists.delete({ tasklist: taskListId });
    return { deleted: true, taskListId };
  }
  throw new Error(`Invalid task list action: ${action}`);
}

export async function listTasks(
  doctorId: string,
  taskListId = "@default",
  maxResults = 100,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const tasks = google.tasks({ version: "v1", auth });
  const res = await tasks.tasks.list({ tasklist: taskListId, maxResults });
  return { taskListId, tasks: res.data.items ?? [] };
}

export async function getTask(
  doctorId: string,
  taskId: string,
  taskListId = "@default",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const tasks = google.tasks({ version: "v1", auth });
  const res = await tasks.tasks.get({ tasklist: taskListId, task: taskId });
  return res.data;
}

export async function manageTask(
  doctorId: string,
  action: "create" | "update" | "delete",
  taskListId = "@default",
  task?: Record<string, unknown>,
  taskId?: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const tasks = google.tasks({ version: "v1", auth });
  if (action === "create" && task) {
    const res = await tasks.tasks.insert({ tasklist: taskListId, requestBody: task });
    return { created: true, task: res.data };
  }
  if (action === "update" && taskId) {
    const res = await tasks.tasks.update({
      tasklist: taskListId,
      task: taskId,
      requestBody: task ?? {},
    });
    return { updated: true, task: res.data };
  }
  if (action === "delete" && taskId) {
    await tasks.tasks.delete({ tasklist: taskListId, task: taskId });
    return { deleted: true, taskId };
  }
  throw new Error(`Invalid task action: ${action}`);
}
