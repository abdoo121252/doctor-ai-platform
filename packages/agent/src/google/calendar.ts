import { google } from "googleapis";
import { getGoogleAuth } from "./auth";

export async function listEvents(
  doctorId: string,
  days: number,
  maxResults: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const calendar = google.calendar({ version: "v3", auth });

  const now = new Date();
  const end = new Date(now.getTime() + days * 86400000);

  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin: now.toISOString(),
    timeMax: end.toISOString(),
    maxResults,
    singleEvents: true,
    orderBy: "startTime",
  });

  const events = (res.data.items ?? []).map((e) => ({
    id: e.id,
    summary: e.summary ?? "(no title)",
    start: e.start?.dateTime ?? e.start?.date ?? "",
    end: e.end?.dateTime ?? e.end?.date ?? "",
    attendees: (e.attendees ?? []).map((a) => ({
      email: a.email,
      responseStatus: a.responseStatus,
    })),
    location: e.location ?? null,
    description: e.description ?? null,
  }));

  return { events };
}

export async function insertEvent(
  doctorId: string,
  summary: string,
  start: string,
  end: string,
  attendees?: string[],
  description?: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const calendar = google.calendar({ version: "v3", auth });

  const res = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary,
      start: { dateTime: start },
      end: { dateTime: end },
      attendees: attendees?.map((email) => ({ email })),
      description,
    },
  });

  return {
    created: true,
    eventId: res.data.id,
    htmlLink: res.data.htmlLink,
  };
}

export async function listCalendars(
  doctorId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const calendar = google.calendar({ version: "v3", auth });
  const res = await calendar.calendarList.list();
  return {
    calendars: (res.data.items ?? []).map((c) => ({
      id: c.id,
      summary: c.summary,
      description: c.description,
      primary: c.primary,
      timeZone: c.timeZone,
    })),
  };
}

export async function getEvents(
  doctorId: string,
  calendarId: string,
  timeMin?: string,
  timeMax?: string,
  query?: string,
  maxResults = 25,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const calendar = google.calendar({ version: "v3", auth });
  const res = await calendar.events.list({
    calendarId: calendarId || "primary",
    timeMin,
    timeMax,
    q: query,
    maxResults,
    singleEvents: true,
    orderBy: "startTime",
  });
  const events = (res.data.items ?? []).map((e) => ({
    id: e.id,
    summary: e.summary ?? "(no title)",
    start: e.start?.dateTime ?? e.start?.date ?? "",
    end: e.end?.dateTime ?? e.end?.date ?? "",
    location: e.location ?? null,
    description: e.description ?? null,
    attendees: (e.attendees ?? []).map((a) => ({ email: a.email, responseStatus: a.responseStatus })),
  }));
  return { calendarId: calendarId || "primary", events };
}

export async function updateEvent(
  doctorId: string,
  eventId: string,
  changes: {
    summary?: string;
    start?: string;
    end?: string;
    description?: string;
    attendees?: string[];
    location?: string;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const calendar = google.calendar({ version: "v3", auth });
  const res = await calendar.events.patch({
    calendarId: "primary",
    eventId,
    requestBody: {
      summary: changes.summary,
      start: changes.start ? { dateTime: changes.start } : undefined,
      end: changes.end ? { dateTime: changes.end } : undefined,
      description: changes.description,
      location: changes.location,
      attendees: changes.attendees?.map((email) => ({ email })),
    },
  });
  return { updated: true, eventId: res.data.id, htmlLink: res.data.htmlLink };
}

export async function deleteEvent(
  doctorId: string,
  eventId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const calendar = google.calendar({ version: "v3", auth });
  await calendar.events.delete({ calendarId: "primary", eventId });
  return { deleted: true, eventId };
}

export async function createCalendar(
  doctorId: string,
  summary: string,
  timeZone?: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const calendar = google.calendar({ version: "v3", auth });
  const res = await calendar.calendars.insert({
    requestBody: { summary, timeZone },
  });
  return { created: true, calendarId: res.data.id, summary: res.data.summary };
}

export async function queryFreebusy(
  doctorId: string,
  timeMin: string,
  timeMax: string,
  items: { id: string }[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const calendar = google.calendar({ version: "v3", auth });
  const res = await calendar.freebusy.query({
    requestBody: { timeMin, timeMax, items },
  });
  return res.data.calendars ?? {};
}

export async function manageOutOfOffice(
  doctorId: string,
  start: string,
  end: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const calendar = google.calendar({ version: "v3", auth });
  const res = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: "Out of office",
      start: { dateTime: start },
      end: { dateTime: end },
      eventType: "outOfOffice",
      transparency: "transparent",
    },
  });
  return { created: true, eventId: res.data.id, htmlLink: res.data.htmlLink };
}

export async function manageFocusTime(
  doctorId: string,
  start: string,
  end: string,
  title?: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const calendar = google.calendar({ version: "v3", auth });
  const res = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: title ?? "Focus time",
      start: { dateTime: start },
      end: { dateTime: end },
      eventType: "focusTime",
      transparency: "opaque",
    },
  });
  return { created: true, eventId: res.data.id, htmlLink: res.data.htmlLink };
}
