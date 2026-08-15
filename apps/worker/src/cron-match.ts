const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/**
 * Parse the local time fields of `date` in `timezone` (IANA). Uses
 * `Intl.DateTimeFormat.formatToParts` so it works without a cron library.
 */
function getTimeParts(
  date: Date,
  timezone: string
): { minute: number; hour: number; day: number; month: number; dayOfWeek: number } {
  let dtf: Intl.DateTimeFormat;
  try {
    dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    });
  } catch {
    // Fall back to UTC when the timezone string is invalid.
    dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    });
  }

  const parts = dtf.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";

  const weekday = get("weekday").toLowerCase();
  const dayOfWeek = DAYS.indexOf(weekday);

  return {
    minute: parseInt(get("minute"), 10),
    hour: parseInt(get("hour"), 10),
    day: parseInt(get("day"), 10),
    month: parseInt(get("month"), 10),
    dayOfWeek: dayOfWeek < 0 ? 0 : dayOfWeek,
  };
}

/** Match one cron field (star, number, range, list, or step) against a value. */
function fieldMatches(field: string, value: number, isDayOfWeek: boolean): boolean {
  for (const raw of field.split(",")) {
    const token = raw.trim();
    if (token === "") continue;

    let base = token;
    let step = 1;
    if (token.includes("/")) {
      const idx = token.indexOf("/");
      base = token.slice(0, idx);
      step = parseInt(token.slice(idx + 1), 10) || 1;
    }

    if (base === "*") {
      if (value % step === 0) return true;
      continue;
    }

    if (base.includes("-")) {
      const [loStr, hiStr] = base.split("-");
      const lo = parseInt(loStr ?? "", 10);
      const hi = parseInt(hiStr ?? "", 10);
      if (Number.isNaN(lo) || Number.isNaN(hi)) continue;
      if (value >= lo && value <= hi && (value - lo) % step === 0) return true;
      continue;
    }

    const n = parseInt(base, 10);
    if (Number.isNaN(n)) continue;
    if (isDayOfWeek && n === 7 && value === 0) return true; // 7 = Sunday
    if (n === value) return true;
  }
  return false;
}

/**
 * Return true if a 5-field cron expression (`minute hour dayOfMonth month
 * dayOfWeek`) matches `date`, evaluated in `timezone` (IANA, default UTC).
 */
export function cronMatches(expression: string, date: Date, timezone = "UTC"): boolean {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return false;

  const t = getTimeParts(date, timezone);

  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;

  if (!minute || !hour || !dayOfMonth || !month || !dayOfWeek) return false;

  return (
    fieldMatches(minute, t.minute, false) &&
    fieldMatches(hour, t.hour, false) &&
    fieldMatches(dayOfMonth, t.day, false) &&
    fieldMatches(month, t.month, false) &&
    fieldMatches(dayOfWeek, t.dayOfWeek, true)
  );
}
