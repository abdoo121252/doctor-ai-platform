import { getMicrosoftAccessToken } from "./auth";
import { graphRequest, buildQuery, encodeGraphPath } from "./graph";

interface GraphTodoList {
  id: string;
  displayName?: string;
  isOwner?: boolean;
  isShared?: boolean;
  wellknownListName?: string;
}

interface GraphTodoTask {
  id: string;
  title?: string;
  status?: string;
  importance?: string;
  isReminderOn?: boolean;
  dueDateTime?: { dateTime?: string; timeZone?: string };
  completedDateTime?: { dateTime?: string } | null;
  body?: { content?: string };
  createdDateTime?: string;
  lastModifiedDateTime?: string;
}

interface GraphChecklistItem {
  id: string;
  displayName?: string;
  isChecked?: boolean;
  checkedDateTime?: string | null;
}

function formatList(l: GraphTodoList) {
  return {
    id: l.id,
    displayName: l.displayName ?? "(unnamed)",
    isOwner: l.isOwner ?? false,
    isShared: l.isShared ?? false,
    wellknownListName: l.wellknownListName ?? null,
  };
}

function formatTask(t: GraphTodoTask) {
  return {
    id: t.id,
    title: t.title ?? "(no title)",
    status: t.status ?? null,
    importance: t.importance ?? null,
    isReminderOn: t.isReminderOn ?? false,
    dueDateTime: t.dueDateTime?.dateTime ?? null,
    dueTimeZone: t.dueDateTime?.timeZone ?? null,
    completedDateTime: t.completedDateTime?.dateTime ?? null,
    body: t.body?.content ?? null,
    createdDateTime: t.createdDateTime ?? null,
    lastModifiedDateTime: t.lastModifiedDateTime ?? null,
  };
}

export async function listTodoLists(
  doctorId: string,
  maxResults: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);

  const path =
    "/me/todo/lists" +
    buildQuery({
      $top: maxResults,
    });

  const data = await graphRequest<{ value: GraphTodoList[] }>(token, path);
  const lists = (data.value ?? []).map(formatList);

  return { lists };
}

export async function createTodoList(
  doctorId: string,
  displayName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);

  const created = await graphRequest<GraphTodoList>(token, "/me/todo/lists", {
    method: "POST",
    body: JSON.stringify({ displayName }),
  });

  return { created: true, listId: created.id, displayName: created.displayName ?? displayName };
}

export async function getTodoList(
  doctorId: string,
  listId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);

  const list = await graphRequest<GraphTodoList>(
    token,
    `/me/todo/lists/${encodeGraphPath(listId)}`
  );

  return formatList(list);
}

export async function updateTodoList(
  doctorId: string,
  listId: string,
  displayName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);

  await graphRequest(token, `/me/todo/lists/${encodeGraphPath(listId)}`, {
    method: "PATCH",
    body: JSON.stringify({ displayName }),
  });

  return { updated: true, listId, displayName };
}

export async function deleteTodoList(
  doctorId: string,
  listId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);

  await graphRequest(token, `/me/todo/lists/${encodeGraphPath(listId)}`, {
    method: "DELETE",
  });

  return { deleted: true, listId };
}

export async function listTodoTasks(
  doctorId: string,
  listId: string,
  options: { maxResults?: number; status?: string } = {},
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);

  const path =
    `/me/todo/lists/${encodeGraphPath(listId)}/tasks` +
    buildQuery({
      $top: options.maxResults ?? 50,
      $filter: options.status ? `status eq '${options.status}'` : undefined,
    });

  const data = await graphRequest<{ value: GraphTodoTask[] }>(token, path);
  const tasks = (data.value ?? []).map(formatTask);

  return { tasks };
}

export async function createTodoTask(
  doctorId: string,
  listId: string,
  task: {
    title: string;
    status?: string;
    importance?: string;
    dueDateTime?: string;
    body?: string;
    reminderDateTime?: string;
    isReminderOn?: boolean;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);

  const payload: Record<string, unknown> = {
    title: task.title,
    status: task.status ?? "notStarted",
    importance: task.importance ?? "normal",
    body: task.body ? { contentType: "text", content: task.body } : undefined,
    isReminderOn: task.isReminderOn ?? false,
    reminderDateTime: task.reminderDateTime ? { dateTime: task.reminderDateTime, timeZone: "UTC" } : undefined,
    dueDateTime: task.dueDateTime ? { dateTime: task.dueDateTime, timeZone: "UTC" } : undefined,
  };
  for (const key of Object.keys(payload)) {
    if (payload[key] === undefined) delete payload[key];
  }

  const created = await graphRequest<GraphTodoTask>(
    token,
    `/me/todo/lists/${encodeGraphPath(listId)}/tasks`,
    { method: "POST", body: JSON.stringify(payload) }
  );

  return { created: true, taskId: created.id, title: created.title ?? task.title };
}

export async function getTodoTask(
  doctorId: string,
  listId: string,
  taskId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);

  const task = await graphRequest<GraphTodoTask>(
    token,
    `/me/todo/lists/${encodeGraphPath(listId)}/tasks/${encodeGraphPath(taskId)}`
  );

  return formatTask(task);
}

export async function updateTodoTask(
  doctorId: string,
  listId: string,
  taskId: string,
  updates: {
    title?: string;
    status?: string;
    importance?: string;
    dueDateTime?: string;
    body?: string;
    isReminderOn?: boolean;
    completedDateTime?: string | null;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);

  const payload: Record<string, unknown> = {
    title: updates.title,
    status: updates.status,
    importance: updates.importance,
    isReminderOn: updates.isReminderOn,
    body: updates.body !== undefined ? { contentType: "text", content: updates.body } : undefined,
    dueDateTime: updates.dueDateTime ? { dateTime: updates.dueDateTime, timeZone: "UTC" } : undefined,
    completedDateTime:
      updates.completedDateTime !== undefined
        ? updates.completedDateTime
          ? { dateTime: updates.completedDateTime, timeZone: "UTC" }
          : null
        : undefined,
  };
  for (const key of Object.keys(payload)) {
    if (payload[key] === undefined) delete payload[key];
  }

  const updated = await graphRequest<GraphTodoTask>(
    token,
    `/me/todo/lists/${encodeGraphPath(listId)}/tasks/${encodeGraphPath(taskId)}`,
    { method: "PATCH", body: JSON.stringify(payload) }
  );

  return { updated: true, taskId: updated.id, title: updated.title ?? null };
}

export async function deleteTodoTask(
  doctorId: string,
  listId: string,
  taskId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);

  await graphRequest(
    token,
    `/me/todo/lists/${encodeGraphPath(listId)}/tasks/${encodeGraphPath(taskId)}`,
    { method: "DELETE" }
  );

  return { deleted: true, taskId };
}

export async function listTodoChecklist(
  doctorId: string,
  listId: string,
  taskId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);

  const data = await graphRequest<{ value: GraphChecklistItem[] }>(
    token,
    `/me/todo/lists/${encodeGraphPath(listId)}/tasks/${encodeGraphPath(taskId)}/checklistItems`
  );

  const items = (data.value ?? []).map((i) => ({
    id: i.id,
    displayName: i.displayName ?? "(unnamed)",
    isChecked: i.isChecked ?? false,
    checkedDateTime: i.checkedDateTime ?? null,
  }));

  return { items };
}

export async function addTodoChecklistItem(
  doctorId: string,
  listId: string,
  taskId: string,
  displayName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);

  const created = await graphRequest<GraphChecklistItem>(
    token,
    `/me/todo/lists/${encodeGraphPath(listId)}/tasks/${encodeGraphPath(taskId)}/checklistItems`,
    { method: "POST", body: JSON.stringify({ displayName }) }
  );

  return { created: true, itemId: created.id, displayName: created.displayName ?? displayName };
}

export async function updateTodoChecklistItem(
  doctorId: string,
  listId: string,
  taskId: string,
  checklistItemId: string,
  updates: { displayName?: string; isChecked?: boolean },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);

  const updated = await graphRequest<GraphChecklistItem>(
    token,
    `/me/todo/lists/${encodeGraphPath(listId)}/tasks/${encodeGraphPath(taskId)}/checklistItems/${encodeGraphPath(checklistItemId)}`,
    { method: "PATCH", body: JSON.stringify(updates) }
  );

  return { updated: true, itemId: updated.id, displayName: updated.displayName ?? null, isChecked: updated.isChecked ?? false };
}