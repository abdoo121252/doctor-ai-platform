import { getMicrosoftAccessToken } from "./auth";
import { graphRequest } from "./graph";

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
}

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
    `/me/events?$select=id,subject,start,end,location,body,attendees,webLink` +
    `&$orderby=start/dateTime` +
    `&$filter=${encodeURIComponent(`${startParam} and ${endParam}`)}` +
    `&$top=${maxResults}`;

  const data = await graphRequest<{ value: GraphEvent[] }>(token, path);
  const events = (data.value ?? []).map((e) => ({
    id: e.id,
    summary: e.subject ?? "(no title)",
    start: e.start?.dateTime ?? "",
    end: e.end?.dateTime ?? "",
    attendees: (e.attendees ?? []).map((a) => ({
      email: a.emailAddress?.address,
      responseStatus: a.status?.response,
    })),
    location: e.location?.displayName ?? null,
    description: e.body?.content ?? null,
  }));

  return { events };
}

export async function createOutlookEvent(
  doctorId: string,
  summary: string,
  start: string,
  end: string,
  attendees?: string[],
  description?: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);

  const body: Record<string, unknown> = {
    subject: summary,
    start: { dateTime: start },
    end: { dateTime: end },
    body: description ? { contentType: "html", content: description } : undefined,
    attendees: attendees?.map((email) => ({
      emailAddress: { address: email },
      type: "required",
    })),
  };

  const created = await graphRequest<GraphEvent>(token, "/me/events", {
    method: "POST",
    body: JSON.stringify(body),
  });

  return {
    created: true,
    eventId: created.id,
    htmlLink: created.webLink ?? null,
  };
}
