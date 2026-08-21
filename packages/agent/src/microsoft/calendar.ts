import { getMicrosoftAccessToken } from "./auth";
import { graphRequest, buildQuery, encodeGraphPath } from "./graph";

interface GraphEvent {
  id: string;
  subject?: string;
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
  location?: { displayName?: string };
  body?: { content?: string };
  attendees?: Array<{
    emailAddress?: { address?: string };
    status?: { response?: string };
  }>;
  webLink?: string;
  recurrence?: {
    pattern?: {
      type?: string;
      interval?: number;
      daysOfWeek?: string[];
      dayOfMonth?: number;
    };
    range?: {
      type?: string;
      startDate?: string;
      endDate?: string;
      numberOfOccurrences?: number;
    };
  };
  isOnlineMeeting?: boolean;
  onlineMeeting?: { joinUrl?: string };
  isAllDay?: boolean;
  organizer?: { emailAddress?: { address?: string } };
  categories?: string[];
}

export interface OutlookRecurrenceInput {
  pattern: {
    type: "daily" | "weekly" | "absoluteMonthly" | "relativeMonthly" | "absoluteYearly" | "relativeYearly";
    interval?: number;
    daysOfWeek?: string[];
    dayOfMonth?: number;
    index?: string;
  };
  range: {
    type: "endDate" | "noEnd" | "numbered";
    startDate?: string;
    endDate?: string;
    numberOfOccurrences?: number;
  };
  recurrenceTimeZone?: string;
}

function normalizeDateTime(dateTime: string): { dateTime: string; timeZone?: string } {
  const tz = dateTime.trim();
  if (tz.endsWith("Z")) return { dateTime, timeZone: "UTC" };
  const offsetMatch = /([+-])(\d{2}):(\d{2})$/.exec(tz);
  if (offsetMatch) {
    const sign = offsetMatch[1] ?? "+";
    const hh = parseInt(offsetMatch[2] ?? "0", 10);
    const mm = parseInt(offsetMatch[3] ?? "0", 10);
    const offsetMin = (hh * 60 + mm) * (sign === "-" ? -1 : 1);
    const local = new Date(tz);
    if (!Number.isNaN(local.getTime())) {
      const utc = new Date(local.getTime() - offsetMin * 60000);
      return { dateTime: utc.toISOString(), timeZone: "UTC" };
    }
    return { dateTime, timeZone: "UTC" };
  }
  if (tz.includes(".")) return { dateTime, timeZone: "UTC" };
  // Bare local time — the doctor's account timezone is unknown here, so pass
  // it through without a zone and let Graph use the mailbox default.
  return { dateTime };
}

const CALENDAR_SELECT_FIELDS =
  "id,subject,start,end,location,body,attendees,webLink,recurrence,isOnlineMeeting,onlineMeeting,showAs,isAllDay,organizer,categories";

export async function listOutlookEvents(
  doctorId: string,
  days: number,
  maxResults: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);

  const now = new Date();
  const end = new Date(now.getTime() + days * 86400000);
  const startParam = `start/dateTime ge '${now.toISOString()}'`;
  const endParam = `end/dateTime le '${end.toISOString()}'`;

  const path =
    `/me/events` +
    buildQuery({
      $select: CALENDAR_SELECT_FIELDS,
      $orderby: "start/dateTime",
      $filter: `${startParam} and ${endParam}`,
      $top: maxResults,
    });

  const data = await graphRequest<{ value: GraphEvent[] }>(token, path);
  const events = (data.value ?? []).map((e) => formatEvent(e));

  return { events };
}

export async function getOutlookEvent(
  doctorId: string,
  eventId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);

  const event = await graphRequest<GraphEvent>(
    token,
    `/me/events/${encodeGraphPath(eventId)}` +
      buildQuery({ $select: CALENDAR_SELECT_FIELDS })
  );

  return formatEvent(event);
}

export async function createOutlookEvent(
  doctorId: string,
  summary: string,
  start: string,
  end: string,
  attendees?: string[],
  description?: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any,
  options?: {
    location?: string;
    isOnlineMeeting?: boolean;
    recurrence?: OutlookRecurrenceInput;
    isAllDay?: boolean;
    timeZone?: string;
  }
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);

  const body: Record<string, unknown> = {
    subject: summary,
    start: normalizeDateTime(start),
    end: normalizeDateTime(end),
    body: description ? { contentType: "html", content: description } : undefined,
    attendees: attendees?.map((email) => ({
      emailAddress: { address: email },
      type: "required",
    })),
    location: options?.location ? { displayName: options.location } : undefined,
    isOnlineMeeting: options?.isOnlineMeeting ?? false,
    isAllDay: options?.isAllDay ?? false,
    recurrence: options?.recurrence ?? undefined,
  };

  if (options?.timeZone) {
    body.start = { dateTime: start, timeZone: options.timeZone };
    body.end = { dateTime: end, timeZone: options.timeZone };
  }

  for (const key of Object.keys(body)) {
    if (body[key] === undefined) delete body[key];
  }

  const created = await graphRequest<GraphEvent>(token, "/me/events", {
    method: "POST",
    body: JSON.stringify(body),
  });

  return {
    created: true,
    eventId: created.id,
    htmlLink: created.webLink ?? null,
    joinUrl: created.onlineMeeting?.joinUrl ?? null,
  };
}

export async function updateOutlookEvent(
  doctorId: string,
  eventId: string,
  updates: {
    summary?: string;
    start?: string;
    end?: string;
    description?: string;
    location?: string;
    attendees?: string[];
    isOnlineMeeting?: boolean;
    isAllDay?: boolean;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);

  const body: Record<string, unknown> = {
    subject: updates.summary,
    start: updates.start ? normalizeDateTime(updates.start) : undefined,
    end: updates.end ? normalizeDateTime(updates.end) : undefined,
    body: updates.description !== undefined ? { contentType: "html", content: updates.description } : undefined,
    location: updates.location !== undefined ? { displayName: updates.location } : undefined,
    attendees: updates.attendees
      ? updates.attendees.map((email) => ({ emailAddress: { address: email }, type: "required" }))
      : undefined,
    isOnlineMeeting: updates.isOnlineMeeting,
    isAllDay: updates.isAllDay,
  };

  for (const key of Object.keys(body)) {
    if (body[key] === undefined) delete body[key];
  }

  const updated = await graphRequest<GraphEvent>(
    token,
    `/me/events/${encodeGraphPath(eventId)}`,
    { method: "PATCH", body: JSON.stringify(body) }
  );

  return { updated: true, eventId: updated.id, htmlLink: updated.webLink ?? null };
}

export async function deleteOutlookEvent(
  doctorId: string,
  eventId: string,
  sendCancellations = false,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);

  await graphRequest(token, `/me/events/${encodeGraphPath(eventId)}`, {
    method: "DELETE",
    headers: sendCancellations
      ? { Prefer: 'outlook.timezone="UTC"', "X-MS-Notifications": "1" }
      : undefined,
  });

  return { deleted: true, eventId };
}

function formatEvent(e: GraphEvent) {
  return {
    id: e.id,
    summary: e.subject ?? "(no title)",
    start: e.start?.dateTime ?? "",
    startTimeZone: e.start?.timeZone ?? null,
    end: e.end?.dateTime ?? "",
    endTimeZone: e.end?.timeZone ?? null,
    attendees: (e.attendees ?? []).map((a) => ({
      email: a.emailAddress?.address,
      responseStatus: a.status?.response,
    })),
    location: e.location?.displayName ?? null,
    description: e.body?.content ?? null,
    recurrence: e.recurrence
      ? {
          patternType: e.recurrence.pattern?.type ?? null,
          interval: e.recurrence.pattern?.interval ?? null,
          daysOfWeek: e.recurrence.pattern?.daysOfWeek ?? [],
          dayOfMonth: e.recurrence.pattern?.dayOfMonth ?? null,
          rangeType: e.recurrence.range?.type ?? null,
          endDate: e.recurrence.range?.endDate ?? null,
          occurrences: e.recurrence.range?.numberOfOccurrences ?? null,
        }
      : null,
    isOnlineMeeting: e.isOnlineMeeting ?? false,
    joinUrl: e.onlineMeeting?.joinUrl ?? null,
    isAllDay: e.isAllDay ?? false,
    organizer: e.organizer?.emailAddress?.address ?? null,
    categories: e.categories ?? [],
    htmlLink: e.webLink ?? null,
  };
}