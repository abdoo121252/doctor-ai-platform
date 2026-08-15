import type { EventFilterRules } from "./types";

function matchText(haystack: unknown, needle: string | undefined): boolean {
  if (!needle) return true;
  const h = Array.isArray(haystack)
    ? haystack.map((x) => String(x)).join(" ")
    : String(haystack ?? "");
  return h.toLowerCase().includes(needle.toLowerCase());
}

/**
 * Match a normalized event payload against a trigger's filter rules.
 * Returns true when every populated rule matches (empty rules always match).
 *
 * Pure and dependency-free so it can run on the Edge runtime, in trigger.dev,
 * and in Node Serverless alike.
 */
export function doesEventMatchFilter(
  eventData: unknown,
  rules: EventFilterRules | Record<string, unknown> | null | undefined
): boolean {
  if (!rules) return true;
  const keys = Object.keys(rules);
  if (keys.length === 0) return true;

  const r = rules as EventFilterRules;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = (eventData ?? {}) as any;

  if (r.from && !matchText(d.from, r.from)) return false;
  if (r.to && !matchText(d.to ?? d.recipient, r.to)) return false;
  if (
    r.subjectContains &&
    !matchText(d.subject ?? d.summary ?? d.name ?? d.title, r.subjectContains)
  ) {
    return false;
  }
  if (
    r.bodyContains &&
    !matchText(d.body ?? d.snippet ?? d.content, r.bodyContains)
  ) {
    return false;
  }
  if (r.hasAttachment !== undefined && !!d.hasAttachment !== r.hasAttachment) {
    return false;
  }
  if (r.attendeeContains) {
    const atts = Array.isArray(d.attendees)
      ? d.attendees.map((a: unknown) =>
          typeof a === "object" && a !== null
            ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (a as any).email ?? a
            : a
        )
      : d.attendees;
    if (!matchText(atts, r.attendeeContains)) return false;
  }
  if (r.folderId && !matchText(d.folderId ?? d.parents, r.folderId)) {
    return false;
  }
  return true;
}
