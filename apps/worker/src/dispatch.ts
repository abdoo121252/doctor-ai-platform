import { doesEventMatchFilter } from "@repo/shared";
import type { EventFilterRules, EventTriggerPath } from "@repo/shared";

function getAutomationConfig() {
  const baseUrl = (process.env.AUTOMATION_BASE_URL ?? "http://localhost:3000").replace(
    /\/$/,
    ""
  );
  const secret = process.env.AUTOMATION_SECRET ?? "";
  return { baseUrl, secret };
}

/**
 * Forward an automation payload to the Vercel agent runner. The worker never
 * runs the LLM itself — it only schedules/dispatches.
 */
export async function forwardToAutomation(
  payload: Record<string, unknown>
): Promise<{ ok: boolean; status?: number; result?: unknown }> {
  const { baseUrl, secret } = getAutomationConfig();
  if (!secret) {
    console.error("[dispatch] AUTOMATION_SECRET is not set");
    return { ok: false };
  }

  try {
    const res = await fetch(`${baseUrl}/api/automation/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(300_000),
    });
    const result = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, result };
  } catch (err) {
    console.error("[dispatch] Forward failed:", err);
    return { ok: false };
  }
}

/**
 * Ping the Vercel poll orchestrator. The 5-min trigger.dev task does nothing
 * else — all event polling / filtering / agent execution lives on Vercel.
 */
export async function pingAutomationPoll(): Promise<{
  ok: boolean;
  status?: number;
}> {
  const { baseUrl, secret } = getAutomationConfig();
  if (!secret) {
    console.error("[dispatch] AUTOMATION_SECRET is not set");
    return { ok: false };
  }

  try {
    const res = await fetch(`${baseUrl}/api/automation/poll`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(300_000),
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    console.error("[dispatch] Poll ping failed:", err);
    return { ok: false };
  }
}

interface EventTriggerRow {
  id: string;
  name: string;
  instructions: string;
  condition: string | null;
  filter_rules: EventFilterRules | Record<string, unknown> | null;
  paths: EventTriggerPath[] | null;
}

/**
 * Apply each enabled trigger's deterministic filter to a single provider item
 * and forward matches to Vercel (which handles the semantic pre-filter,
 * dedupe, and the agent run).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function dispatchEventItem(
  supabase: any,
  doctorId: string,
  eventSource: string,
  eventData: unknown,
  itemId: string
): Promise<number> {
  const { data: triggers, error } = await supabase
    .from("event_triggers")
    .select("*")
    .eq("doctor_id", doctorId)
    .eq("event_source", eventSource)
    .eq("enabled", true);

  if (error || !triggers || triggers.length === 0) return 0;

  let dispatched = 0;
  for (const t of triggers as EventTriggerRow[]) {
    if (!doesEventMatchFilter(eventData, t.filter_rules)) continue;

    const res = await forwardToAutomation({
      doctorId,
      sessionType: "event",
      eventSource,
      eventData,
      itemId,
      triggerId: t.id,
      name: t.name,
      instructions: t.instructions,
      condition: t.condition ?? undefined,
      ...(t.paths && t.paths.length > 0 ? { paths: t.paths } : {}),
    });
    if (res.ok) dispatched++;
  }
  return dispatched;
}
