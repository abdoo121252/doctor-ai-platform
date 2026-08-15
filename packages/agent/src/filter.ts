import { generateText } from "ai";
import { getModel } from "./agent";

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
