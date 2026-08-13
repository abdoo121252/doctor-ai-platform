import { log } from "@repo/agent";

let initialized = false;

function safeStringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function safeUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return url;
  }
}

/**
 * Captures everything the Node server does that isn't already explicitly logged:
 *  - uncaught exceptions / unhandled rejections
 *  - console.error output from any library (AI SDK, Supabase, Next internals)
 *  - every outbound fetch (Supabase, OpenAI-compatible model, Google/Microsoft)
 *
 * All entries go through the same `log()` used everywhere, so they land in the
 * `logs` table AND `logs/local-dev.log`.
 */
export function initServerLogging() {
  if (initialized) return;
  initialized = true;

  const origError = console.error.bind(console);

  console.error = (...args: unknown[]) => {
    origError(...args);
    try {
      const message = args.map(safeStringify).join(" ").slice(0, 2000);
      log({
        level: "error",
        source: "console",
        message,
      }).catch(() => {});
    } catch {
      // never throw from a console patch
    }
  };

  process.on("uncaughtException", (err: Error) => {
    origError("[uncaughtException]", err);
    log({
      level: "error",
      source: "uncaughtException",
      message: err?.message ?? String(err),
      details: { stack: err?.stack },
    }).catch(() => {});
  });

  process.on("unhandledRejection", (reason: unknown) => {
    origError("[unhandledRejection]", reason);
    const err = reason instanceof Error ? reason : new Error(String(reason));
    log({
      level: "error",
      source: "unhandledRejection",
      message: err.message,
      details: { stack: err.stack },
    }).catch(() => {});
  });

  patchFetch(origError);
}

function patchFetch(origError: (...args: unknown[]) => void) {
  const origFetch = globalThis.fetch;
  if (typeof origFetch !== "function") return;

  const skip = (url: string) =>
    url.startsWith("file:") ||
    url.startsWith("data:") ||
    url.includes("/rest/v1/logs") ||
    url.includes("/rest/v1/tool_execution_log") ||
    url.includes("/auth/v1/token");

  globalThis.fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (skip(url)) {
      return origFetch(input as never, init);
    }

    const method = (init?.method ?? (init?.body ? "POST" : "GET")).toUpperCase();
    const target = safeUrl(url);
    const started = Date.now();

    try {
      const res = await origFetch(input as never, init);
      const ms = Date.now() - started;
      const level = res.status >= 500 ? "error" : res.status >= 400 ? "warn" : "info";
      log({
        level,
        source: "fetch",
        message: `${method} ${target} -> ${res.status} (${ms}ms)`,
      }).catch(() => {});
      return res;
    } catch (err) {
      const ms = Date.now() - started;
      origError("[fetch]", err);
      log({
        level: "error",
        source: "fetch",
        message: `${method} ${target} FAILED after ${ms}ms: ${
          err instanceof Error ? err.message : String(err)
        }`,
      }).catch(() => {});
      throw err;
    }
  }) as typeof fetch;
}
