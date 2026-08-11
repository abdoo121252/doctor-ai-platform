import { tool } from "ai";
import { z } from "zod";
import type { AgentContext } from "../../context";
import { listOutlookEvents, createOutlookEvent } from "../calendar";
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
      "Create an Outlook calendar event. Needs approval in automated sessions if attendees are added.",
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
          throw new Error(
            result.reason ?? "Create event was rejected by doctor"
          );
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
          ctx.supabase
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
