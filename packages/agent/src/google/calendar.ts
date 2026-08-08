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
