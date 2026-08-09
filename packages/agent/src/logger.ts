import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { appendFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  doctor_id?: string | null;
  level: LogLevel;
  source: string;
  message: string;
  details?: Record<string, unknown>;
}

const LOG_DIR = join(process.cwd(), "logs");
const LOG_FILE = join(LOG_DIR, "local-dev.log");

function writeLocalLog(entry: LogEntry) {
  const ts = new Date().toISOString();
  const line = JSON.stringify({ ts, ...entry }) + "\n";
  try {
    if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
    appendFileSync(LOG_FILE, line);
  } catch {
    // never crash on log write
  }
}

let _serviceSupabase: ReturnType<typeof createClient> | null | undefined;

function getServiceSupabase() {
  if (_serviceSupabase === undefined) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    _serviceSupabase = url && key ? createClient(url, key) : null;
  }
  return _serviceSupabase;
}

async function tryInsert(client: SupabaseClient, entry: LogEntry) {
  const { error } = await client.from("logs").insert({
    doctor_id: entry.doctor_id ?? null,
    level: entry.level,
    source: entry.source,
    message: entry.message,
    details: entry.details ?? null,
  } as Record<string, unknown>);
  if (error) console.warn("[Logger] Insert failed:", error.message);
}

export async function log(entry: LogEntry) {
  const { level, source, message, details } = entry;

  const prefix = level === "error" ? "[ERROR]" : level === "warn" ? "[WARN]" : "[INFO]";
  const dId = entry.doctor_id ? ` (${entry.doctor_id.slice(0, 8)})` : "";
  console.log(`${prefix} [${source}]${dId} ${message}`, details ?? "");

  writeLocalLog(entry);

  const serviceClient = getServiceSupabase();
  if (!serviceClient) return;

  try {
    await tryInsert(serviceClient, entry);
  } catch (err) {
    console.warn("[Logger] Insert exception:", err);
  }
}

export async function logWithClient(client: SupabaseClient, entry: LogEntry) {
  const { level, source, message, details } = entry;

  const prefix = level === "error" ? "[ERROR]" : level === "warn" ? "[WARN]" : "[INFO]";
  const dId = entry.doctor_id ? ` (${entry.doctor_id.slice(0, 8)})` : "";
  console.log(`${prefix} [${source}]${dId} ${message}`, details ?? "");

  writeLocalLog(entry);

  try {
    await tryInsert(client, entry);
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
