import { tool } from "ai";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { AgentContext } from "../context";
import { logInfo, logError } from "../logger";

const EVENT_SOURCES = [
  "gmail_new_message",
  "calendar_event_soon",
  "drive_new_file",
] as const;

function getSupabase(
  ctx: AgentContext
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  if (ctx.supabase) return ctx.supabase;
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

const scheduleSpec = z.union([
  z.object({
    frequency: z.enum(["hourly", "daily", "weekly"]),
    time: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional()
      .describe("24-hour time, e.g. \"09:00\". Defaults to 09:00."),
    dayOfWeek: z
      .number()
      .int()
      .min(0)
      .max(6)
      .optional()
      .describe("0=Sunday … 6=Saturday. Defaults to 1 (Monday)."),
  }),
  z.object({
    cron_expression: z
      .string()
      .describe("A raw 5-field cron expression, e.g. \"0 9 * * 1\"."),
  }),
]);

const filterRulesSchema = z.object({
  from: z.string().optional().describe("Sender email address to match (exact)"),
  to: z.string().optional().describe("Recipient email address to match (exact)"),
  subjectContains: z
    .string()
    .optional()
    .describe("Substring that must appear in the subject / title / file name"),
  bodyContains: z
    .string()
    .optional()
    .describe("Substring that must appear in the email body"),
  hasAttachment: z
    .boolean()
    .optional()
    .describe("Only match emails that have attachments"),
  attendeeContains: z
    .string()
    .optional()
    .describe("Substring that must appear in an attendee's email"),
  folderId: z
    .string()
    .optional()
    .describe("Only match files inside this Drive folder id"),
});

/**
 * Build a 5-field cron string from a friendly schedule spec. Falls back to
 * a daily 09:00 schedule when time/day are omitted.
 */
export function buildCronFromSpec(
  frequency: "hourly" | "daily" | "weekly",
  time?: string,
  dayOfWeek?: number
): string {
  const [hour, minute] = (time ?? "09:00").split(":").map((n) => parseInt(n, 10));
  const h = Number.isFinite(hour) ? hour : 9;
  const m = Number.isFinite(minute) ? minute : 0;

  if (frequency === "hourly") return `${m} * * * *`;
  if (frequency === "weekly") {
    const d = dayOfWeek ?? 1;
    return `${m} ${h} * * ${d}`;
  }
  return `${m} ${h} * * *`;
}

const CRON_FIELD = "(\\d{1,2}|\\*(/\\d{1,2})?|[\\d,*-]+)";
const CRON_RE = new RegExp(
  `^\\s*${CRON_FIELD}\\s+${CRON_FIELD}\\s+${CRON_FIELD}\\s+${CRON_FIELD}\\s+${CRON_FIELD}\\s*$`
);

export function isValidCron(expr: string): boolean {
  return CRON_RE.test(expr);
}

export function createScheduleTaskTool(ctx: AgentContext) {
  return tool({
    description:
      "Schedule a recurring automated agent session for the professor. " +
      "Use this when the professor wants a task to run on a schedule, e.g. " +
      "\"every Monday at 9am summarize my inbox\". The agent will run the given " +
      "instructions at the scheduled times.",
    inputSchema: z.object({
      name: z.string().describe("Short label for the task"),
      instructions: z
        .string()
        .describe("What the agent should do each run (plain-language instructions)"),
      schedule: scheduleSpec,
      timezone: z
        .string()
        .optional()
        .describe("IANA timezone, e.g. \"America/New_York\". Defaults to UTC."),
    }),
    execute: async ({ name, instructions, schedule, timezone }) => {
      const cronExpression =
        "cron_expression" in schedule
          ? schedule.cron_expression
          : buildCronFromSpec(
              schedule.frequency,
              schedule.time,
              schedule.dayOfWeek
            );

      if (!isValidCron(cronExpression)) {
        throw new Error(`Invalid cron expression: "${cronExpression}"`);
      }

      const supabase = getSupabase(ctx);
      const { data, error } = await supabase
        .from("scheduled_tasks")
        .insert({
          doctor_id: ctx.doctorId,
          name,
          cron_expression: cronExpression,
          instructions,
          timezone: timezone ?? "UTC",
          enabled: true,
        })
        .select()
        .single();

      if (error || !data) {
        logError("tool:scheduleTask", "Failed to create scheduled task", error, ctx.doctorId);
        throw new Error(error?.message ?? "Failed to create scheduled task");
      }

      logInfo("tool:scheduleTask", "Scheduled task created", ctx.doctorId, {
        taskId: (data as { id: string }).id,
        cron: cronExpression,
      });

      return { created: true, task: data };
    },
  });
}

export function createEventTriggerTool(ctx: AgentContext) {
  return tool({
    description:
      "Create an event trigger that reacts to a specific event with detailed " +
      "filters. Use this when the professor wants to be notified / act when " +
      "something happens, e.g. \"when I get an email from admissions@univ.edu " +
      "containing 'appeal', summarize it\". Filter fields vary by source: " +
      "gmail_new_message supports from/to/subjectContains/bodyContains/hasAttachment; " +
      "calendar_event_soon supports subjectContains/attendeeContains; " +
      "drive_new_file supports subjectContains/folderId.",
    inputSchema: z.object({
      name: z.string().describe("Short label for the trigger"),
      event_source: z
        .enum(EVENT_SOURCES)
        .describe("The event source this trigger reacts to"),
      instructions: z
        .string()
        .describe("What the agent should do when the event matches"),
      filter_rules: filterRulesSchema
        .optional()
        .describe("Detailed filter conditions; omit for no filtering"),
    }),
    execute: async ({ name, event_source, instructions, filter_rules }) => {
      const supabase = getSupabase(ctx);
      const { data, error } = await supabase
        .from("event_triggers")
        .insert({
          doctor_id: ctx.doctorId,
          name,
          event_source,
          instructions,
          filter_rules: filter_rules ?? {},
          enabled: true,
        })
        .select()
        .single();

      if (error || !data) {
        logError("tool:createEventTrigger", "Failed to create event trigger", error, ctx.doctorId);
        throw new Error(error?.message ?? "Failed to create event trigger");
      }

      logInfo("tool:createEventTrigger", "Event trigger created", ctx.doctorId, {
        triggerId: (data as { id: string }).id,
        eventSource: event_source,
      });

      return { created: true, trigger: data };
    },
  });
}
