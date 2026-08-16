/**
 * Pure 5-field cron builders/parsers shared by the agent tool and the web UI.
 * Convention (standard cron): `<minute> <hour> <day-of-month> <month> <day-of-week>`,
 * where day-of-week is 0=Sunday … 6=Saturday (7 also accepted as Sunday by the matcher).
 */

export type RecurrenceFrequency =
  | "hourly"
  | "daily"
  | "days_of_week"
  | "days_of_month";

export interface ScheduleSpec {
  frequency: RecurrenceFrequency;
  /** 24-hour "HH:mm", defaults to "09:00". */
  time?: string;
  /** Days of the week (0=Sunday … 6=Saturday) for `days_of_week`. */
  daysOfWeek?: number[];
  /** Days of the month (1-31) for `days_of_month`. */
  daysOfMonth?: number[];
}

export function splitTime(time?: string): { hour: number; minute: number } {
  const [hRaw, mRaw] = (time ?? "09:00").split(":");
  const hour = Number.isFinite(parseInt(hRaw ?? "", 10)) ? parseInt(hRaw ?? "", 10) : 9;
  const minute = Number.isFinite(parseInt(mRaw ?? "", 10)) ? parseInt(mRaw ?? "", 10) : 0;
  return { hour, minute };
}

function sorted(nums: number[]): number[] {
  return nums.slice().sort((a, b) => a - b);
}

export function buildHourlyCron(minute = 0): string {
  return `${minute} * * * *`;
}

export function buildDailyCron(time?: string): string {
  const { hour, minute } = splitTime(time);
  return `${minute} ${hour} * * *`;
}

/**
 * Build the cron for "every N hours starting at `startTime`" (HH:mm).
 *
 * Returns a normal enumerated cron (e.g. start 07:00 every 3h ->
 * "0 1,4,7,10,13,16,19,22 * * *") only when N divides 24. Returns `null`
 * when N does NOT divide 24 — that case cannot be expressed as a repeating
 * 5-field cron and must instead be fired from `interval_hours` +
 * `interval_anchor` + `last_run_at` (see the worker cron).
 */
export function buildEveryNHoursCron(
  startTime: string,
  intervalHours: number
): string | null {
  const { hour, minute } = splitTime(startTime);
  if (!Number.isInteger(intervalHours) || intervalHours < 1 || intervalHours > 23) {
    return null;
  }
  if (24 % intervalHours !== 0) return null;

  const count = 24 / intervalHours;
  const hours: number[] = [];
  let h = hour % 24;
  for (let i = 0; i < count; i++) {
    hours.push(h);
    h = (h + intervalHours) % 24;
  }
  hours.sort((a, b) => a - b);
  return `${minute} ${hours.join(",")} * * *`;
}

export function buildDaysOfWeekCron(time?: string, daysOfWeek: number[] = [1]): string {
  const { hour, minute } = splitTime(time);
  const dow = sorted(daysOfWeek).join(",");
  return `${minute} ${hour} * * ${dow}`;
}

export function buildDaysOfMonthCron(time?: string, daysOfMonth: number[] = []): string {
  const { hour, minute } = splitTime(time);
  const dom = sorted(daysOfMonth).join(",");
  return `${minute} ${hour} ${dom} * *`;
}

/** Build the cron for a structured schedule spec (used by the agent tool). */
export function buildCronFromSchedule(spec: ScheduleSpec): string {
  switch (spec.frequency) {
    case "hourly": {
      const { minute } = splitTime(spec.time);
      return buildHourlyCron(minute);
    }
    case "days_of_week":
      return buildDaysOfWeekCron(spec.time, spec.daysOfWeek ?? [1]);
    case "days_of_month":
      return buildDaysOfMonthCron(spec.time, spec.daysOfMonth ?? []);
    case "daily":
    default:
      return buildDailyCron(spec.time);
  }
}

const CRON_FIELD = "(\\d{1,2}|\\*(/\\d{1,2})?|[\\d,*-]+)";
const CRON_RE = new RegExp(
  `^\\s*${CRON_FIELD}\\s+${CRON_FIELD}\\s+${CRON_FIELD}\\s+${CRON_FIELD}\\s+${CRON_FIELD}\\s*$`
);

export function isValidCron(expr: string): boolean {
  return CRON_RE.test(expr);
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

/** Today's date (YYYY-MM-DD) in the given IANA `timezone`. */
export function dateStringInTimeZone(timezone: string, date = new Date()): string {
  let dtf: Intl.DateTimeFormat;
  try {
    dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }
  const parts = dtf.formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * The grid anchor (UTC) for an "every N hours" schedule: the chosen start
 * time (HH:mm) on today's date in `timezone`. Fires are computed as
 * `anchor + k * interval` — the anchor itself may be in the past (the worker
 * advances to the next slot on/after `now`).
 */
export function intervalAnchorUtc(
  startTime: string,
  timezone: string,
  date = new Date()
): Date {
  return zonedTimeToUtc(dateStringInTimeZone(timezone, date), startTime, timezone);
}

const DOW_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Human-readable description of a 5-field cron, for displaying existing tasks. */
export function parseCron(expr: string): string {
  if (!isValidCron(expr)) return expr;
  const [minute, hour, dom, month, dow] = expr.trim().split(/\s+/);
  if (!minute || !hour || !dom || !month || !dow) return expr;

  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  const time = `${hh}:${mm}`;

  // Every hour: hour field is `*`.
  if (hour === "*") return `Hourly at minute ${minute}`;

  if (dom === "*" && dow === "*") return `Daily at ${time}`;

  if (dom === "*" && dow !== "*") {
    const days = dow
      .split(",")
      .map((d) => {
        const n = parseInt(d, 10);
        return DOW_NAMES[n === 7 ? 0 : n] ?? d;
      });
    return `${days.join(", ")} at ${time}`;
  }

  if (dom !== "*") {
    return `Day${dom.includes(",") ? "s" : ""} ${dom} of month at ${time}`;
  }

  return expr;
}
