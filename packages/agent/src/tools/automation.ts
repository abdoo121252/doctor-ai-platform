import { tool } from "ai";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { AgentContext } from "../context";
import { logInfo, logError } from "../logger";

const EVENT_SOURCES = [
  "gmail_new_message",
  "calendar_event_soon",
  "drive_new_file",
  "outlook_new_message",
  "outlook_calendar_soon",
  "onedrive_new_file",
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
    frequency: z.literal("monthly"),
    time: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional()
      .describe("24-hour time, e.g. \"09:00\". Defaults to 09:00."),
    daysOfMonth: z
      .array(z.number().int().min(1).max(31))
      .min(1)
      .describe("Days of the month that recur, e.g. [13, 16, 18]."),
  }),
  z.object({
    cron_expression: z
      .string()
      .describe("A raw 5-field cron expression, e.g. \"0 9 * * 1\"."),
  }),
  z.object({
    dates: z
      .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
      .min(1)
      .describe(
        "One-off (non-recurring) dates as YYYY-MM-DD. Use ONLY when the " +
          "professor explicitly means these exact dates and not a monthly recurrence."
      ),
    time: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional()
      .describe("24-hour time, e.g. \"09:00\". Defaults to 09:00."),
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
  locationContains: z
    .string()
    .optional()
    .describe("Substring that must appear in the event location"),
  folderId: z
    .string()
    .optional()
    .describe("Only match files inside this Drive / OneDrive folder id"),
  mimeType: z
    .string()
    .optional()
    .describe("Only match files of this MIME type (e.g. application/pdf)"),
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

/**
 * Build a monthly recurring cron, e.g. daysOfMonth [13,16,18] at 09:00 →
 * "0 9 13,16,18 * *".
 */
export function buildMonthlyCron(time: string | undefined, daysOfMonth: number[]): string {
  const [hour, minute] = (time ?? "09:00").split(":").map((n) => parseInt(n, 10));
  const h = Number.isFinite(hour) ? hour : 9;
  const m = Number.isFinite(minute) ? minute : 0;
  const dom = daysOfMonth
    .slice()
    .sort((a, b) => a - b)
    .join(",");
  return `${m} ${h} ${dom} * *`;
}

/**
 * Convert a wall-clock `YYYY-MM-DD` + `HH:mm` in `timezone` (IANA) to a UTC
 * Date, honoring DST. Uses the Intl offset trick so no tz library is needed.
 */
export function zonedTimeToUtc(dateStr: string, time: string, timezone: string): Date {
  const tz = timezone || "UTC";
  const naive = new Date(`${dateStr}T${time}:00Z`);

  let dtf: Intl.DateTimeFormat;
  try {
    dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    return naive;
  }

  const parts = dtf.formatToParts(naive);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const asUtc = Date.UTC(
    parseInt(get("year"), 10),
    parseInt(get("month"), 10) - 1,
    parseInt(get("day"), 10),
    parseInt(get("hour"), 10),
    parseInt(get("minute"), 10),
    parseInt(get("second"), 10)
  );
  return new Date(naive.getTime() - (asUtc - naive.getTime()));
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
      "Schedule an automated agent session for the professor. Supports daily " +
      "at a fixed time, weekly on a specific day, monthly on specific days of " +
      "the month, and one-off (non-recurring) dates. " +
      "IMPORTANT: when the professor gives day numbers (e.g. \"the 13th and 16th\") " +
      "without saying whether they mean every month or just this month, you MUST " +
      "ask them to clarify before calling this tool — never guess, because the two " +
      "meanings are stored completely differently. Use the `dates` field ONLY for " +
      "explicit one-off dates; use `frequency: monthly` for \"every month\".",
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
      const supabase = getSupabase(ctx);
      const tz = timezone ?? "UTC";

      // One-off dates → schedule_type='one_off_dates', no cron.
      if ("dates" in schedule) {
        const runAtDates = schedule.dates.map((d) =>
          zonedTimeToUtc(d, schedule.time ?? "09:00", tz).toISOString()
        );

        const { data, error } = await supabase
          .from("scheduled_tasks")
          .insert({
            doctor_id: ctx.doctorId,
            name,
            cron_expression: null,
            schedule_type: "one_off_dates",
            instructions,
            timezone: tz,
            enabled: true,
          })
          .select()
          .single();

        if (error || !data) {
          logError("tool:scheduleTask", "Failed to create one-off task", error, ctx.doctorId);
          throw new Error(error?.message ?? "Failed to create scheduled task");
        }

        const taskId = (data as { id: string }).id;
        const { error: dateErr } = await supabase
          .from("scheduled_task_dates")
          .insert(
            runAtDates.map((runAt) => ({ task_id: taskId, run_at: runAt }))
          );

        if (dateErr) {
          logError("tool:scheduleTask", "Failed to insert one-off dates", dateErr, ctx.doctorId);
          throw new Error(dateErr.message ?? "Failed to insert one-off dates");
        }

        logInfo("tool:scheduleTask", "One-off task created", ctx.doctorId, {
          taskId,
          dates: runAtDates,
        });
        return { created: true, task: data, dates: runAtDates };
      }

      // Recurring (hourly/daily/weekly/monthly/raw cron).
      const cronExpression =
        "cron_expression" in schedule
          ? schedule.cron_expression
          : schedule.frequency === "monthly"
            ? buildMonthlyCron(schedule.time, schedule.daysOfMonth)
            : buildCronFromSpec(
                schedule.frequency,
                schedule.time,
                schedule.dayOfWeek
              );

      if (!isValidCron(cronExpression)) {
        throw new Error(`Invalid cron expression: "${cronExpression}"`);
      }

      const { data, error } = await supabase
        .from("scheduled_tasks")
        .insert({
          doctor_id: ctx.doctorId,
          name,
          cron_expression: cronExpression,
          schedule_type: "recurring",
          instructions,
          timezone: tz,
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
      "gmail_new_message / outlook_new_message support from/to/subjectContains/bodyContains/hasAttachment; " +
      "calendar_event_soon / outlook_calendar_soon support subjectContains/attendeeContains/locationContains; " +
      "drive_new_file / onedrive_new_file support subjectContains/folderId/mimeType.",
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
