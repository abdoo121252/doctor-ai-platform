import { randomUUID } from "crypto";
import { appendFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

/**
 * DETAILED LOCAL REQUEST TRACE LOGGER
 * ==================================
 * Writes a per-request trace file capturing every phase, timing, and error
 * for localhost debugging. Only active in development (never in production).
 *
 * Output:
 *   apps/web/logs/traces/<requestId>.log    -> one pretty-printed file per request
 *   apps/web/logs/traces/errors.log         -> every error entry across all requests
 *   apps/web/logs/traces/index.log          -> one summary line per request
 */

const TRACE_ENABLED = process.env.NODE_ENV !== "production";
const LOG_DIR = join(process.cwd(), "logs", "traces");

type TraceEvent = {
  t: number;
  rel: number;
  phase: string;
  level: "info" | "warn" | "error" | "data";
  message: string;
  data?: unknown;
};

export interface Trace {
  requestId: string;
  /** Log a phase transition with timing. */
  phase(phase: string, data?: unknown): void;
  /** Log an informational detail. */
  info(message: string, data?: unknown): void;
  /** Log raw data (bodies, responses, tool results). */
  data(label: string, data: unknown): void;
  /** Log a warning. */
  warn(message: string, data?: unknown): void;
  /** Log an error with full context. */
  error(message: string, error?: unknown, data?: unknown): void;
  /** Finalize the trace, writing the file and summary line. */
  end(summary?: Record<string, unknown>): void;
}

function serialize(value: unknown): string {
  try {
    return JSON.stringify(value, (_key, val) => {
      if (typeof val === "string" && val.length > 2000) {
        return val.slice(0, 2000) + `… [truncated, total ${val.length} chars]`;
      }
      if (val instanceof Error) {
        return {
          name: val.name,
          message: val.message,
          stack: val.stack,
        };
      }
      return val;
    }, 2);
  } catch {
    return String(value);
  }
}

function ensureDir() {
  if (!existsSync(LOG_DIR)) {
    try {
      mkdirSync(LOG_DIR, { recursive: true });
    } catch {
      // ignore
    }
  }
}

export function createTrace(): Trace {
  const requestId = randomUUID();
  const startMs = Date.now();
  const startPerf = performance.now();
  const events: TraceEvent[] = [];
  let lastPhase = "start";
  let ended = false;

  function record(
    level: TraceEvent["level"],
    phase: string,
    message: string,
    data?: unknown
  ) {
    events.push({
      t: Date.now(),
      rel: Math.round(performance.now() - startPerf),
      phase,
      level,
      message,
      data,
    });
  }

  function emitError(error?: unknown, phase?: string, data?: unknown) {
    if (!TRACE_ENABLED) return;
    ensureDir();
    const errorLog = join(LOG_DIR, "errors.log");
    const line =
      `[${new Date().toISOString()}] request=${requestId} phase=${phase ?? lastPhase}\n` +
      serialize({ message: data ?? "error", error: error ?? null }) +
      "\n" +
      "─".repeat(80) +
      "\n";
    try {
      appendFileSync(errorLog, line);
    } catch {
      // ignore
    }
  }

  return {
    requestId,
    phase(phase: string, data?: unknown) {
      lastPhase = phase;
      record("info", phase, `phase → ${phase}`, data);
    },
    info(message: string, data?: unknown) {
      record("info", lastPhase, message, data);
    },
    data(label: string, data: unknown) {
      record("data", lastPhase, label, data);
    },
    warn(message: string, data?: unknown) {
      record("warn", lastPhase, message, data);
    },
    error(message: string, error?: unknown, data?: unknown) {
      record("error", lastPhase, message, {
        ...(data as object),
        error:
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : error,
      });
      emitError(error, lastPhase, { message, ...(data as object) });
    },
    end(summary?: Record<string, unknown>) {
      if (ended) return;
      ended = true;
      if (!TRACE_ENABLED) return;
      ensureDir();

      const duration = Date.now() - startMs;
      const filePath = join(LOG_DIR, `${requestId}.log`);

      const lines: string[] = [];
      lines.push(`REQUEST TRACE  ${requestId}`);
      lines.push(`Started: ${new Date(startMs).toISOString()}`);
      lines.push(`Duration: ${duration}ms`);
      if (summary && Object.keys(summary).length) {
        lines.push("Summary:");
        lines.push(serialize(summary));
      }
      lines.push("─".repeat(60));
      for (const ev of events) {
        lines.push(
          `[+${ev.rel}ms] ${ev.level.toUpperCase().padEnd(5)} ${ev.phase}: ${ev.message}`
        );
        if (ev.data !== undefined) {
          lines.push(serialize(ev.data));
        }
      }

      try {
        appendFileSync(filePath, lines.join("\n") + "\n");
        appendFileSync(
          join(LOG_DIR, "index.log"),
          `${new Date().toISOString()} ${duration}ms ${requestId} ${summary?.phase ?? lastPhase}\n`
        );
      } catch {
        // ignore
      }
    },
  };
}
