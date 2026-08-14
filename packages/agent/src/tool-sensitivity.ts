import {
  AGENT_TOOL_NAMES,
  TOOL_SENSITIVITY_DEFAULTS,
  type AgentToolName,
} from "@repo/shared";

/**
 * In-memory cache of tool-sensitivity settings, keyed by doctor id.
 * Settings rarely change, so we avoid a DB round-trip on every chat
 * message. Invalidated immediately when the doctor toggles a setting
 * (see `invalidateToolSensitivityCache`) and guarded by a short TTL as
 * a safety net for multi-instance deployments.
 */
const sensitivityCache = new Map<
  string,
  { settings: Record<AgentToolName, boolean>; at: number }
>();

/** How long a cached entry stays fresh before we re-fetch (ms). */
const CACHE_TTL_MS = 60_000;

/** Drop the cached settings for a doctor (call after a toggle/upsert). */
export function invalidateToolSensitivityCache(doctorId: string): void {
  sensitivityCache.delete(doctorId);
}

/**
 * Load the doctor's tool-sensitivity settings from the
 * `tool_sensitivity_settings` table and merge them over the defaults.
 *
 * Missing rows fall back to `TOOL_SENSITIVITY_DEFAULTS`. Returns a
 * complete map for every agent tool name.
 *
 * Pass the caller's Supabase client (the authenticated chat route
 * client) so RLS applies and no service key is needed. Falls back to a
 * service-key client when no client is supplied.
 */
export async function loadToolSensitivity(
  doctorId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase?: any
): Promise<Record<AgentToolName, boolean>> {
  const cached = sensitivityCache.get(doctorId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.settings;
  }

  const result = { ...TOOL_SENSITIVITY_DEFAULTS } as Record<
    AgentToolName,
    boolean
  >;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let client: any = supabase;
  if (!client) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createClient } = require("@supabase/supabase-js");
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
  }

  try {
    const query = client
      .from("tool_sensitivity_settings")
      .select("tool_name, sensitive")
      .eq("doctor_id", doctorId);

    const { data } = await Promise.race([
      query,
      new Promise<{ data: null }>((resolve) =>
        setTimeout(() => resolve({ data: null }), 5000)
      ),
    ]);

    if (Array.isArray(data)) {
      for (const row of data as Array<{ tool_name: string; sensitive: boolean }>) {
        if ((AGENT_TOOL_NAMES as readonly string[]).includes(row.tool_name)) {
          result[row.tool_name as AgentToolName] = row.sensitive;
        }
      }
      sensitivityCache.set(doctorId, { settings: result, at: Date.now() });
    }
  } catch (err) {
    console.error(
      "[tool-sensitivity] Failed to load settings, using defaults:",
      err instanceof Error ? err.message : String(err)
    );
  }

  return result;
}
