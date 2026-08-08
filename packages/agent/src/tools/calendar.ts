import { tool } from "ai";
import { z } from "zod";
import type { AgentContext } from "../context";
import { listEvents, insertEvent } from "../google/calendar";

export function createReadCalendarTool(ctx: AgentContext) {
  return tool({
    description: "Read events from the doctor's Google Calendar",
    inputSchema: z.object({
      days: z.number().default(7).describe("Number of days to look ahead"),
      maxResults: z.number().default(10).describe("Maximum number of events"),
    }),
    execute: async ({ days, maxResults }) => {
      return listEvents(ctx.doctorId, days ?? 7, maxResults ?? 10, ctx.supabase);
    },
  });
}

export function createCreateEventTool(ctx: AgentContext) {
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
      return insertEvent(
        ctx.doctorId,
        input.summary,
        input.start,
        input.end,
        input.attendees,
        input.description,
        ctx.supabase
      );
    },
  });
}

export const readCalendar = createReadCalendarTool({
  doctorId: "",
  sessionType: "chat",
});

export const createEvent = createCreateEventTool({
  doctorId: "",
  sessionType: "chat",
});
