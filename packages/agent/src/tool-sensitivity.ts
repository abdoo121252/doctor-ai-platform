import {
  AGENT_TOOL_NAMES,
  TOOL_SENSITIVITY_DEFAULTS,
  type AgentToolName,
} from "@repo/shared";

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
    }
  } catch (err) {
    console.error(
      "[tool-sensitivity] Failed to load settings, using defaults:",
      err instanceof Error ? err.message : String(err)
    );
  }

  return result;
}
