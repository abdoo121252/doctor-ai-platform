import { tool } from "ai";
import { z } from "zod";
import type { AgentContext } from "../context";
import {
  listEvents,
  insertEvent,
  listCalendars,
  getEvents,
  updateEvent,
  deleteEvent,
  createCalendar,
  queryFreebusy,
  manageOutOfOffice,
  manageFocusTime,
} from "../google/calendar";
import { logError, logInfo } from "../logger";

export function createReadCalendarTool(ctx: AgentContext) {
  return tool({
    description: "Read events from the doctor's Google Calendar",
    inputSchema: z.object({
      days: z.number().default(7).describe("Number of days to look ahead"),
      maxResults: z.number().default(10).describe("Maximum number of events"),
    }),
    execute: async ({ days, maxResults }) => {
      logInfo("tool:readCalendar", "Fetching calendar events", ctx.doctorId, { days, maxResults });
      try {
        const result = await listEvents(ctx.doctorId, days ?? 7, maxResults ?? 10, ctx.supabase);
        logInfo("tool:readCalendar", `Retrieved ${result.events.length} events`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:readCalendar", "Failed to fetch calendar events", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createCreateEventTool(ctx: AgentContext, needsApproval = false) {
  return tool({
    description:
      "Create a calendar event. Needs approval in automated sessions if attendees are added.",
    inputSchema: z.object({
      summary: z.string().describe("Event title"),
      start: z.string().describe("Start time (ISO 8601)"),
      end: z.string().describe("End time (ISO 8601)"),
      attendees: z
        .array(z.string())
        .optional()
        .describe("Attendee email addresses"),
      description: z.string().optional().describe("Event description"),
    }),
    needsApproval: needsApproval,
    execute: async (input) => {
      logInfo("tool:createEvent", "Preparing to create event", ctx.doctorId, { summary: input.summary });
      if (ctx.sessionType !== "chat" && ctx.requestApproval) {
        const result = await ctx.requestApproval("create_event", {
          summary: input.summary,
          start: input.start,
          end: input.end,
          attendees: input.attendees ?? [],
        });
        if (!result.approved) {
          logInfo("tool:createEvent", "Rejected by doctor", ctx.doctorId);
          throw new Error(
            result.reason ?? "Create event was rejected by doctor"
          );
        }
      }
      try {
        const result = await insertEvent(
          ctx.doctorId,
          input.summary,
          input.start,
          input.end,
          input.attendees,
          input.description,
          ctx.supabase
        );
        logInfo("tool:createEvent", "Created event", ctx.doctorId, { eventId: result.eventId });
        return result;
      } catch (err) {
        logError("tool:createEvent", "Failed to create event", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createListCalendarsTool(ctx: AgentContext) {
  return tool({
    description: "List the doctor's Google Calendars",
    inputSchema: z.object({}),
    execute: async () => {
      logInfo("tool:listCalendars", "Listing calendars");
      try {
        const result = await listCalendars(ctx.doctorId, ctx.supabase);
        logInfo("tool:listCalendars", `Found ${result.calendars.length} calendars`);
        return result;
      } catch (err) {
        logError("tool:listCalendars", "Failed to list calendars", err);
        throw err;
      }
    },
  });
}

export function createGetEventsTool(ctx: AgentContext) {
  return tool({
    description: "Get events from a specific Google Calendar",
    inputSchema: z.object({
      calendarId: z.string().optional().describe("Calendar ID (defaults to primary)"),
      timeMin: z.string().optional().describe("Start time (ISO 8601)"),
      timeMax: z.string().optional().describe("End time (ISO 8601)"),
      query: z.string().optional().describe("Search query"),
      maxResults: z.number().default(25).describe("Maximum number of events"),
    }),
    execute: async ({ calendarId, timeMin, timeMax, query, maxResults }) => {
      logInfo("tool:getEvents", "Fetching calendar events", ctx.doctorId, { calendarId, timeMin, timeMax, query, maxResults });
      try {
        const result = await getEvents(ctx.doctorId, calendarId ?? "primary", timeMin, timeMax, query, maxResults ?? 25, ctx.supabase);
        logInfo("tool:getEvents", `Retrieved ${result.events.length} events`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:getEvents", "Failed to fetch calendar events", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createUpdateEventTool(ctx: AgentContext) {
  return tool({
    description: "Update a Google Calendar event",
    inputSchema: z.object({
      eventId: z.string().describe("Event ID"),
      changes: z.object({
        summary: z.string().optional().describe("New event title"),
        start: z.string().optional().describe("New start time (ISO 8601)"),
        end: z.string().optional().describe("New end time (ISO 8601)"),
        description: z.string().optional().describe("New event description"),
        attendees: z.array(z.string()).optional().describe("New attendee email addresses"),
        location: z.string().optional().describe("New event location"),
      }),
    }),
    execute: async ({ eventId, changes }) => {
      logInfo("tool:updateEvent", "Updating calendar event", ctx.doctorId, { eventId });
      try {
        const result = await updateEvent(ctx.doctorId, eventId, changes, ctx.supabase);
        logInfo("tool:updateEvent", "Updated event", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:updateEvent", "Failed to update calendar event", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createDeleteEventTool(ctx: AgentContext) {
  return tool({
    description: "Delete a Google Calendar event",
    inputSchema: z.object({
      eventId: z.string().describe("Event ID"),
    }),
    execute: async ({ eventId }) => {
      logInfo("tool:deleteEvent", "Deleting calendar event", ctx.doctorId, { eventId });
      try {
        await deleteEvent(ctx.doctorId, eventId, ctx.supabase);
        logInfo("tool:deleteEvent", "Deleted event", ctx.doctorId);
        return { deleted: true, eventId };
      } catch (err) {
        logError("tool:deleteEvent", "Failed to delete calendar event", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createCreateCalendarTool(ctx: AgentContext) {
  return tool({
    description: "Create a new Google Calendar",
    inputSchema: z.object({
      summary: z.string().describe("Calendar name"),
      timeZone: z.string().optional().describe("Time zone (e.g., 'America/New_York')"),
    }),
    execute: async ({ summary, timeZone }) => {
      logInfo("tool:createCalendar", "Creating calendar", ctx.doctorId, { summary, timeZone });
      try {
        const result = await createCalendar(ctx.doctorId, summary, timeZone, ctx.supabase);
        logInfo("tool:createCalendar", "Created calendar", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:createCalendar", "Failed to create calendar", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createQueryFreebusyTool(ctx: AgentContext) {
  return tool({
    description: "Query free/busy information for calendars",
    inputSchema: z.object({
      timeMin: z.string().describe("Start time (ISO 8601)"),
      timeMax: z.string().describe("End time (ISO 8601)"),
      items: z.array(z.object({ id: z.string() })).describe("Calendar items to check"),
    }),
    execute: async ({ timeMin, timeMax, items }) => {
      logInfo("tool:queryFreebusy", "Querying free/busy", ctx.doctorId, { timeMin, timeMax, items: items.length });
      try {
        const result = await queryFreebusy(ctx.doctorId, timeMin, timeMax, items, ctx.supabase);
        logInfo("tool:queryFreebusy", "Queried free/busy", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:queryFreebusy", "Failed to query free/busy", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createManageOutOfOfficeTool(ctx: AgentContext) {
  return tool({
    description: "Manage out of office settings",
    inputSchema: z.object({
      start: z.string().describe("Start time (ISO 8601)"),
      end: z.string().describe("End time (ISO 8601)"),
    }),
    execute: async ({ start, end }) => {
      logInfo("tool:manageOutOfOffice", "Setting out of office", ctx.doctorId, { start, end });
      try {
        const result = await manageOutOfOffice(ctx.doctorId, start, end, ctx.supabase);
        logInfo("tool:manageOutOfOffice", "Set out of office", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:manageOutOfOffice", "Failed to manage out of office", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createManageFocusTimeTool(ctx: AgentContext) {
  return tool({
    description: "Manage focus time settings",
    inputSchema: z.object({
      start: z.string().describe("Start time (ISO 8601)"),
      end: z.string().describe("End time (ISO 8601)"),
      title: z.string().optional().describe("Focus time title"),
    }),
    execute: async ({ start, end, title }) => {
      logInfo("tool:manageFocusTime", "Setting focus time", ctx.doctorId, { start, end, title });
      try {
        const result = await manageFocusTime(ctx.doctorId, start, end, title, ctx.supabase);
        logInfo("tool:manageFocusTime", "Set focus time", ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:manageFocusTime", "Failed to manage focus time", err, ctx.doctorId);
        throw err;
      }
    },
  });
}