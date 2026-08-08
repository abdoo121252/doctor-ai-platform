import { createClient } from "@supabase/supabase-js";

type LogLevel = "info" | "warn" | "error";

interface LogEntry {
  doctor_id?: string | null;
  level: LogLevel;
  source: string;
  message: string;
  details?: Record<string, unknown>;
}

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.warn("[Logger] Missing Supabase env vars, logging to console only");
    return null;
  }
  return createClient(url, key);
}

export async function log(entry: LogEntry) {
  const { doctor_id, level, source, message, details } = entry;

  const ts = new Date().toISOString();
  console.log(`[${level.toUpperCase()}] [${source}] ${message}`, details ?? "");

  const supabase = getServiceSupabase();
  if (!supabase) return;

  try {
    const { error } = await supabase.from("logs").insert({
      doctor_id: doctor_id ?? null,
      level,
      source,
      message,
      details: details ?? null,
      created_at: ts,
    });
    if (error) console.warn("[Logger] Insert failed:", error.message);
  } catch (err) {
    console.warn("[Logger] Insert exception:", err);
  }
}

export function logInfo(source: string, message: string, doctorId?: string, details?: Record<string, unknown>) {
  return log({ doctor_id: doctorId ?? null, level: "info", source, message, details });
}

export function logWarn(source: string, message: string, doctorId?: string, details?: Record<string, unknown>) {
  return log({ doctor_id: doctorId ?? null, level: "warn", source, message, details });
}

export function logError(source: string, message: string, error?: unknown, doctorId?: string) {
  const details: Record<string, unknown> = {};
  if (error instanceof Error) {
    details.error = error.message;
    details.stack = error.stack;
  } else if (error !== undefined) {
    details.error = String(error);
  }
  return log({ doctor_id: doctorId ?? null, level: "error", source, message, details });
}
