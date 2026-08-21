import { tool } from "ai";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import {
  buildCronFromSchedule,
  buildDaysOfMonthCron,
  buildEveryNHoursCron,
  intervalAnchorUtc,
  isValidCron,
  zonedTimeToUtc,
} from "@repo/shared";
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

const timeField = z
  .string()
  .regex(/^\d{2}:\d{2}$/)
  .optional()
  .describe('24-hour time, e.g. "09:00". Defaults to 09:00.');

const scheduleSpec = z.union([
  z.object({
    frequency: z.literal("daily"),
    time: timeField,
  }),
  z.object({
    frequency: z.literal("days_of_week"),
    time: timeField,
    daysOfWeek: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .describe("Days of the week that recur. 0=Sunday … 6=Saturday. Multi-select."),
  }),
  z.object({
    frequency: z.literal("days_of_month"),
    time: timeField,
    daysOfMonth: z
      .array(z.number().int().min(1).max(31))
      .min(1)
      .describe("Days of the month that recur, e.g. [1, 15, 28]."),
  }),
  z.object({
    frequency: z.literal("hourly"),
    time: timeField.describe("Only the minute is used for hourly; the hour is ignored."),
  }),
  z.object({
    frequency: z.literal("every_n_hours"),
    time: timeField.describe(
      "Start time (HH:mm) that anchors the N-hour grid; both hour and minute are used."
    ),
    intervalHours: z
      .number()
      .int()
      .min(1)
      .max(23)
      .describe("Run every N hours (e.g. 3 = every 3 hours)."),
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
    time: timeField,
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

const pathFilterSchema = z.union([
  z.object({
    mode: z.literal("fields"),
    fields: filterRulesSchema.optional(),
  }),
  z.object({
    mode: z.literal("ai"),
    condition: z.string().describe("Natural-language condition evaluated by the AI"),
  }),
]);

const pathSchema = z.object({
  id: z.string().optional().describe("Auto-generated if omitted"),
  name: z.string().optional().describe("Short label for this path (e.g. 'Manager reprimand')"),
  filter: pathFilterSchema.optional().describe("Condition for this path; omit for always-match fallback"),
  instructions: z.string().describe("What the agent should do when this path is selected"),
});

/**
 * Build a 5-field cron string from a structured schedule spec.
 */
export function buildCronFromSpec(
  frequency: "hourly" | "daily" | "days_of_week" | "days_of_month",
  time?: string,
  days?: number[]
): string {
  return buildCronFromSchedule({
    frequency,
    time,
    daysOfWeek: frequency === "days_of_week" ? days : undefined,
    daysOfMonth: frequency === "days_of_month" ? days : undefined,
  });
}

/** Alias kept for callers using the old "monthly days" name. */
export function buildMonthlyCron(time: string | undefined, daysOfMonth: number[]): string {
  return buildDaysOfMonthCron(time, daysOfMonth);
}

export function createScheduleTaskTool(ctx: AgentContext) {
  return tool({
    description:
      "Schedule an automated agent session for the professor. Recurrence types: " +
      "`daily` (a single time), `days_of_week` (multi-select 0=Sunday … 6=Saturday + " +
      "time), `days_of_month` (multi-select 1-31 + time), `hourly` (minute only), " +
      "`every_n_hours` (start time + intervalHours, e.g. \"every 3 hours from 7am\"), " +
      "a raw `cron_expression`, or `dates` for one-off (non-recurring) dates. " +
      "IMPORTANT: when the professor gives day numbers (e.g. \"the 13th and 16th\") " +
      "without saying whether they mean every month or just this month, you MUST " +
      "ask them to clarify before calling this tool — never guess, because the two " +
      "meanings are stored completely differently. Use the `dates` field ONLY for " +
      "explicit one-off dates; use `frequency: days_of_month` for \"every month\"." +
      "For \"every N hours\" the professor gives an interval (e.g. every 3, 4, 6 " +
      "hours) and a start time; use `frequency: every_n_hours` with `intervalHours` " +
      "and `time` set to the start time.",
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

      // Every N hours from a start time. Enumerated cron when N divides 24;
      // otherwise store interval_hours + interval_anchor so the worker fires
      // from `last_run_at + interval`.
      if ("frequency" in schedule && schedule.frequency === "every_n_hours") {
        const startTime = schedule.time ?? "09:00";
        const cronExpression = buildEveryNHoursCron(startTime, schedule.intervalHours);
        const anchor = intervalAnchorUtc(startTime, tz).toISOString();

        const { data, error } = await supabase
          .from("scheduled_tasks")
          .insert({
            doctor_id: ctx.doctorId,
            name,
            cron_expression: cronExpression,
            schedule_type: "every_n_hours",
            instructions,
            timezone: tz,
            enabled: true,
            interval_hours: schedule.intervalHours,
            interval_anchor: anchor,
          })
          .select()
          .single();

        if (error || !data) {
          logError("tool:scheduleTask", "Failed to create every-n-hours task", error, ctx.doctorId);
          throw new Error(error?.message ?? "Failed to create scheduled task");
        }

        logInfo("tool:scheduleTask", "Every-N-hours task created", ctx.doctorId, {
          taskId: (data as { id: string }).id,
          intervalHours: schedule.intervalHours,
          cron: cronExpression,
        });

        return { created: true, task: data };
      }

      // Recurring (hourly/daily/days_of_week/days_of_month/raw cron).
      const cronExpression =
        "cron_expression" in schedule
          ? schedule.cron_expression
          : buildCronFromSchedule({
              frequency: schedule.frequency,
              time: "time" in schedule ? schedule.time : undefined,
              daysOfWeek: "daysOfWeek" in schedule ? schedule.daysOfWeek : undefined,
              daysOfMonth: "daysOfMonth" in schedule ? schedule.daysOfMonth : undefined,
            });

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
      "Create an event trigger with one or more paths. Each path has its own " +
      "filter (either deterministic fields OR an AI natural-language condition) " +
      "and its own agent instructions. When an event arrives, the system evaluates " +
      "paths in order: fields-mode paths match deterministically (cheap, no AI call); " +
      "ai-mode paths are evaluated by ONE AI call that picks the matching path (not yes/no). " +
      "The selected path's instructions run. If no path matches, the event is skipped. " +
      "Use this for routing: e.g. path 1: fields {from: 'manager@univ.edu'} -> summarize; " +
      "path 2: ai condition 'email contains congratulations' -> send thank-you note. " +
      "Fields within a path are ANDed; multiple paths give OR semantics.",
    inputSchema: z.object({
      name: z.string().describe("Short label for the trigger"),
      event_source: z
        .enum(EVENT_SOURCES)
        .describe("The event source this trigger reacts to"),
      // Legacy single-instruction mode (kept for backward compatibility)
      instructions: z
        .string()
        .optional()
        .describe("Legacy: what the agent should do when the event matches"),
      filter_rules: filterRulesSchema
        .optional()
        .describe("Legacy: detailed filter conditions; omit for no filtering"),
      condition: z
        .string()
        .optional()
        .describe("Legacy: natural-language condition for AI pre-filter"),
      // New multi-path mode
      paths: z
        .array(pathSchema)
        .min(1)
        .optional()
        .describe(
          "Multiple paths, each with its own filter + instructions. " +
          "If provided, legacy fields are ignored."
        ),
    }),
    execute: async ({
      name,
      event_source,
      instructions,
      filter_rules,
      condition,
      paths,
    }) => {
      const supabase = getSupabase(ctx);

      let insertInstructions = instructions ?? "";
      let insertPaths: any[] = [];

      if (paths && paths.length > 0) {
        // Multi-path mode: normalize paths
        insertPaths = paths.map((p) => ({
          id: p.id ?? crypto.randomUUID(),
          name: p.name,
          filter:
            p.filter && p.filter.mode
              ? p.filter
              : ({ mode: "fields", fields: (p.filter as any)?.fields ?? {} } as any),
          instructions: p.instructions,
        }));
        insertInstructions = insertPaths[0].instructions;
      } else if (instructions) {
        // Legacy single-instruction mode
        insertInstructions = instructions;
      } else {
        throw new Error("Either paths or instructions must be provided");
      }

      const { data, error } = await supabase
        .from("event_triggers")
        .insert({
          doctor_id: ctx.doctorId,
          name,
          event_source,
          instructions: insertInstructions,
          filter_rules: filter_rules ?? {},
          condition: condition ?? null,
          paths: insertPaths,
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
        pathCount: insertPaths.length,
      });

      return { created: true, trigger: data };
    },
  });
}
