import { tool } from "ai";
import { z } from "zod";
import type { AgentContext } from "../../context";
import {
  listOutlookEvents,
  createOutlookEvent,
  getOutlookEvent,
  updateOutlookEvent,
  deleteOutlookEvent,
} from "../calendar";
import { logError, logInfo } from "../../logger";

export function createReadOutlookCalendarTool(ctx: AgentContext) {
  return tool({
    description: "Read events from the doctor's Outlook calendar",
    inputSchema: z.object({
      days: z.number().default(7).describe("Number of days to look ahead"),
      maxResults: z.number().default(10).describe("Maximum number of events"),
    }),
    execute: async ({ days, maxResults }) => {
      logInfo("tool:readOutlookCalendar", "Fetching Outlook calendar", ctx.doctorId, { days });
      try {
        const result = await listOutlookEvents(ctx.doctorId, days ?? 7, maxResults ?? 10, ctx.supabase);
        logInfo("tool:readOutlookCalendar", `Retrieved ${result.events.length} events`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:readOutlookCalendar", "Failed to fetch Outlook calendar", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createCreateOutlookEventTool(ctx: AgentContext, needsApproval = false) {
  return tool({
    description:
      "Create an Outlook calendar event, optionally with location, online meeting, and recurrence. Needs approval in automated sessions.",
    inputSchema: z.object({
      summary: z.string().describe("Event title"),
      start: z.string().describe("Start time (ISO 8601)"),
      end: z.string().describe("End time (ISO 8601)"),
      attendees: z.array(z.string()).optional().describe("Attendee email addresses"),
      description: z.string().optional().describe("Event description"),
      location: z.string().optional().describe("Event location"),
      isOnlineMeeting: z.boolean().default(false).describe("Create an online meeting"),
      isAllDay: z.boolean().default(false).describe("All-day event"),
      timeZone: z.string().optional().describe("IANA timezone if start/end are local times"),
      recurrence: z
        .object({
          pattern: z.object({
            type: z.enum(["daily", "weekly", "absoluteMonthly", "relativeMonthly", "absoluteYearly", "relativeYearly"]),
            interval: z.number().optional(),
            daysOfWeek: z.array(z.string()).optional(),
            dayOfMonth: z.number().optional(),
            index: z.string().optional(),
          }),
          range: z.object({
            type: z.enum(["endDate", "noEnd", "numbered"]),
            startDate: z.string().optional(),
            endDate: z.string().optional(),
            numberOfOccurrences: z.number().optional(),
          }),
          recurrenceTimeZone: z.string().optional(),
        })
        .optional()
        .describe("Recurrence pattern and range"),
    }),
    needsApproval,
    execute: async (input) => {
      if (ctx.sessionType !== "chat" && ctx.requestApproval) {
        const result = await ctx.requestApproval("create_event", {
          summary: input.summary,
          start: input.start,
          end: input.end,
          attendees: input.attendees ?? [],
        });
        if (!result.approved) {
          throw new Error(result.reason ?? "Create event was rejected by doctor");
        }
      }
      try {
        const result = await createOutlookEvent(
          ctx.doctorId,
          input.summary,
          input.start,
          input.end,
          input.attendees,
          input.description,
          ctx.supabase,
          {
            location: input.location,
            isOnlineMeeting: input.isOnlineMeeting,
            isAllDay: input.isAllDay,
            timeZone: input.timeZone,
            recurrence: input.recurrence,
          }
        );
        logInfo("tool:createOutlookEvent", "Event created", ctx.doctorId, { eventId: result.eventId });
        return result;
      } catch (err) {
        logError("tool:createOutlookEvent", "Failed to create event", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createGetOutlookEventTool(ctx: AgentContext) {
  return tool({
    description: "Get a single Outlook calendar event by ID",
    inputSchema: z.object({
      eventId: z.string().describe("Outlook event ID"),
    }),
    execute: async ({ eventId }) => {
      logInfo("tool:getOutlookEvent", "Fetching event", ctx.doctorId, { eventId });
      try {
        const result = await getOutlookEvent(ctx.doctorId, eventId, ctx.supabase);
        logInfo("tool:getOutlookEvent", `Got event: ${result.summary}`, ctx.doctorId);
        return result;
      } catch (err) {
        logError("tool:getOutlookEvent", "Failed to fetch event", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createUpdateOutlookEventTool(ctx: AgentContext, needsApproval = false) {
  return tool({
    description: "Update an Outlook calendar event",
    inputSchema: z.object({
      eventId: z.string().describe("Outlook event ID"),
      summary: z.string().optional().describe("New title"),
      start: z.string().optional().describe("New start time (ISO 8601)"),
      end: z.string().optional().describe("New end time (ISO 8601)"),
      description: z.string().optional().describe("New description"),
      location: z.string().optional().describe("New location"),
      attendees: z.array(z.string()).optional().describe("Replace attendees"),
      isOnlineMeeting: z.boolean().optional(),
      isAllDay: z.boolean().optional(),
    }),
    needsApproval,
    execute: async (input) => {
      const { eventId, ...updates } = input;
      if (ctx.sessionType !== "chat" && ctx.requestApproval) {
        const result = await ctx.requestApproval("create_event", { eventId, ...updates });
        if (!result.approved) {
          throw new Error(result.reason ?? "Update event was rejected by doctor");
        }
      }
      try {
        const result = await updateOutlookEvent(ctx.doctorId, eventId, updates, ctx.supabase);
        logInfo("tool:updateOutlookEvent", "Event updated", ctx.doctorId, { eventId });
        return result;
      } catch (err) {
        logError("tool:updateOutlookEvent", "Failed to update event", err, ctx.doctorId);
        throw err;
      }
    },
  });
}

export function createDeleteOutlookEventTool(ctx: AgentContext, needsApproval = false) {
  return tool({
    description: "Delete an Outlook calendar event",
    inputSchema: z.object({
      eventId: z.string().describe("Outlook event ID"),
      sendCancellations: z.boolean().default(false).describe("Send cancellation to attendees"),
    }),
    needsApproval,
    execute: async ({ eventId, sendCancellations }) => {
      if (ctx.sessionType !== "chat" && ctx.requestApproval) {
        const result = await ctx.requestApproval("delete_event", { eventId });
        if (!result.approved) {
          throw new Error(result.reason ?? "Delete event was rejected by doctor");
        }
      }
      try {
        const result = await deleteOutlookEvent(ctx.doctorId, eventId, sendCancellations, ctx.supabase);
        logInfo("tool:deleteOutlookEvent", "Event deleted", ctx.doctorId, { eventId });
        return result;
      } catch (err) {
        logError("tool:deleteOutlookEvent", "Failed to delete event", err, ctx.doctorId);
        throw err;
      }
    },
  });
}