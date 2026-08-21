import { generateText } from "ai";
import { getModel } from "./agent";
import type { EventTriggerPath } from "@repo/shared";

/**
 * Cheap semantic pre-filter for event triggers. When a trigger declares a
 * natural-language `condition`, evaluate it against the event payload with a
 * short, temperature-0 model call before running the full agent. This lets the
 * deterministic filter (filter_rules) pass most items for free and reserve the
 * model for the ambiguous cases only.
 */
export async function filterMatchesCondition(
  condition: string,
  eventData: unknown
): Promise<{ matches: boolean; reason: string }> {
  const model = getModel();

  const { text } = await generateText({
    model,
    temperature: 0,
    system:
      "You evaluate a single natural-language condition against an event payload. " +
      "Answer ONLY with a JSON object: {\"matches\": boolean, \"reason\": string}.",
    prompt: [
      "Condition:",
      condition,
      "",
      "Event data (JSON):",
      JSON.stringify(eventData ?? {}, null, 2),
      "",
      'Return only JSON like {"matches": true, "reason": "short explanation"}.',
    ].join("\n"),
  });

  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "");

  try {
    const parsed = JSON.parse(cleaned) as {
      matches?: boolean;
      reason?: string;
    };
    return {
      matches: parsed.matches === true,
      reason: typeof parsed.reason === "string" ? parsed.reason : "",
    };
  } catch {
    return { matches: true, reason: "unparseable filter result" };
  }
}

/**
 * Route an event payload to one of several AI-mode paths. ONE temperature-0
 * model call evaluates ALL conditions at once and returns the id of the first
 * (highest-priority) matching path, or `null` when none matches. This replaces
 * the per-condition yes/no filter with path selection.
 */
export async function routeEventToPath(
  paths: Array<Pick<EventTriggerPath, "id" | "name" | "filter">>,
  eventData: unknown
): Promise<{ pathId: string | null; reason: string }> {
  const model = getModel();

  const listing = paths
    .map((p, i) => {
      const name = p.name?.trim() || `Path ${i + 1}`;
      const condition = p.filter.mode === "ai" ? p.filter.condition : "";
      return `- [${i + 1}] id="${p.id}" name="${name}"\n  condition: ${condition || "(no condition — always matches)"}`;
    })
    .join("\n");

  const { text } = await generateText({
    model,
    temperature: 0,
    system:
      "You route an event payload to exactly one of several named paths by " +
      "evaluating their conditions. Choose the FIRST path whose condition is " +
      "satisfied (list order is priority). If none is satisfied, return null. " +
      "Answer ONLY with a JSON object: {\"pathId\": string | null, \"reason\": string}.",
    prompt: [
      "Paths (in priority order):",
      listing,
      "",
      "Event data (JSON):",
      JSON.stringify(eventData ?? {}, null, 2),
      "",
      'Return only JSON like {"pathId": "path_1", "reason": "short explanation"} ' +
        'or {"pathId": null, "reason": "no condition matched"}.',
    ].join("\n"),
  });

  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "");

  try {
    const parsed = JSON.parse(cleaned) as {
      pathId?: string | null;
      reason?: string;
    };
    return {
      pathId:
        typeof parsed.pathId === "string" && parsed.pathId.length > 0
          ? parsed.pathId
          : null,
      reason: typeof parsed.reason === "string" ? parsed.reason : "",
    };
  } catch {
    return { pathId: null, reason: "unparseable routing result" };
  }
}
