type RequestLogLevel = "info" | "warn" | "error";

interface EdgeLogEntry {
  level: RequestLogLevel;
  source: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Edge-safe request logger for middleware. Middleware runs on the Edge runtime,
 * which has no access to server-only env (SUPABASE_SERVICE_KEY) or the `fs`
 * module, so this does a fire-and-forget POST straight to the Supabase REST API
 * using the public anon key. Rows are written with doctor_id = NULL (allowed by
 * the `logs_self_access` RLS policy), and the real user id rides in `details`.
 */
export function logEdgeRequest(entry: EdgeLogEntry) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return;

  const body = {
    doctor_id: null,
    level: entry.level,
    source: entry.source,
    message: entry.message.slice(0, 2000),
    details: entry.details ?? null,
  };

  fetch(`${url}/rest/v1/logs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anon,
      Authorization: `Bearer ${anon}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  }).catch(() => {});
}
