const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

const RETRY_CONFIG = {
  maxRetries: 3,
  retryDelay: 1000,
  retryableErrors: [429, 503, 504],
};

const ERROR_SUGGESTIONS: Record<number, string> = {
  401: "Authentication token may have expired. Please re-authenticate.",
  403: "Insufficient permissions. Check if the app has the required Microsoft Graph permissions.",
  404: "Resource not found. Verify the ID or path is correct.",
  429: "Rate limit exceeded. The request will be retried automatically.",
  500: "Microsoft Graph service error. Please try again later.",
  503: "Service temporarily unavailable. The request will be retried automatically.",
};

export interface GraphError extends Error {
  statusCode?: number;
  graphError?: {
    code: string | null;
    message: string | null;
    requestId: string | null;
  };
}

function createGraphError(
  statusCode: number,
  responseData: string,
  parsedError: unknown,
  responseHeaders: Headers
): GraphError {
  const graphBody =
    (parsedError as { error?: Record<string, unknown> })?.error ||
    (parsedError as Record<string, unknown> | null) ||
    {};
  const innerError =
    (graphBody.innerError as Record<string, unknown>) ||
    (graphBody.innererror as Record<string, unknown>) ||
    null;
  const requestId =
    (innerError?.["request-id"] as string) ||
    (innerError?.requestId as string) ||
    responseHeaders.get("request-id") ||
    responseHeaders.get("client-request-id") ||
    null;

  const message = (graphBody.message as string) || responseData;
  const suggestion = ERROR_SUGGESTIONS[statusCode] ?? "";
  const fullMessage = suggestion
    ? `Microsoft Graph ${statusCode}: ${message}\nSuggestion: ${suggestion}`
    : `Microsoft Graph ${statusCode}: ${message}`;

  const error = new Error(fullMessage) as GraphError;
  error.statusCode = statusCode;
  error.graphError = {
    code: (graphBody.code as string) || null,
    message,
    requestId,
  };
  return error;
}

const BINARY_MAGICS: Array<{ name: string; bytes: number[] }> = [
  { name: "zip", bytes: [0x50, 0x4b, 0x03, 0x04] },
  { name: "pdf", bytes: [0x25, 0x50, 0x44, 0x46] },
  { name: "ole", bytes: [0xd0, 0xcf, 0x11, 0xe0] },
  { name: "png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { name: "jpeg", bytes: [0xff, 0xd8, 0xff] },
  { name: "gzip", bytes: [0x1f, 0x8b] },
];

export function looksBinary(buf: Uint8Array): boolean {
  for (const magic of BINARY_MAGICS) {
    if (
      buf.length >= magic.bytes.length &&
      buf.subarray(0, magic.bytes.length).every((b, i) => b === magic.bytes[i])
    ) {
      return true;
    }
  }
  return buf.subarray(0, 8192).includes(0x00);
}

const BINARY_CONTENT_PREFIXES = [
  "application/octet-stream",
  "image/",
  "audio/",
  "video/",
  "application/pdf",
  "application/vnd.openxmlformats",
  "application/vnd.ms-excel",
  "application/msword",
  "application/vnd.ms-powerpoint",
  "application/zip",
];

const TEXT_CONTENT_PREFIXES = [
  "application/json",
  "text/",
  "application/xml",
  "text/xml",
  "text/csv",
  "application/x-www-form-urlencoded",
];

function contentTypeIsText(contentType: string): boolean {
  const ct = contentType.toLowerCase();
  return (
    TEXT_CONTENT_PREFIXES.some((p) => ct.includes(p)) &&
    !BINARY_CONTENT_PREFIXES.some((p) => ct.includes(p))
  );
}

/**
 * Microsoft Graph request with retry/backoff on transient errors, structured
 * error normalization, and automatic binary-vs-JSON response handling.
 *
 * Returns parsed JSON when the response is JSON, a string when it is plain
 * text, and an ArrayBuffer when it is binary.
 */
export async function graphRequest<T>(
  accessToken: string,
  path: string,
  init?: RequestInit & { retryCount?: number }
): Promise<T> {
  const url = /^https?:\/\//i.test(path) ? path : `${GRAPH_BASE}${path}`;
  const retryCount = init?.retryCount ?? 0;

  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (res.status >= 200 && res.status < 300) {
    if (res.status === 204) {
      return undefined as T;
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (contentTypeIsText(contentType)) {
      const text = await res.text();
      if (contentType.includes("json")) {
        return JSON.parse(text) as T;
      }
      return text as unknown as T;
    }
    // Binary — return raw bytes so callers can base64-encode or save them.
    return (await res.arrayBuffer()) as unknown as T;
  }

  const rawBody = await res.text();

  if (
    RETRY_CONFIG.retryableErrors.includes(res.status) &&
    retryCount < RETRY_CONFIG.maxRetries
  ) {
    const delay = RETRY_CONFIG.retryDelay * Math.pow(2, retryCount);
    await new Promise((r) => setTimeout(r, delay));
    return graphRequest<T>(accessToken, path, {
      ...init,
      retryCount: retryCount + 1,
    });
  }

  let parsedError: unknown = null;
  try {
    parsedError = JSON.parse(rawBody);
  } catch {
    // non-JSON error body — keep rawBody
  }

  throw createGraphError(res.status, rawBody, parsedError, res.headers);
}

/**
 * Build a query string from a params object. `$filter` and `$search`
 * values are encoded whole (Graph expects them as single encoded tokens);
 * everything else is encoded per key/value.
 */
export function buildQuery(
  params: Record<string, string | number | boolean | undefined>
): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== ""
  );
  if (entries.length === 0) return "";
  return (
    "?" +
    entries
      .map(([k, v]) => {
        const value = String(v);
        if (k === "$filter" || k === "$search") {
          return `${k}=${encodeURIComponent(value)}`;
        }
        return `${encodeURIComponent(k)}=${encodeURIComponent(value)}`;
      })
      .join("&")
  );
}

/**
 * Encode a Graph path segment. Preserves colon-suffixed function call
 * wrappers (`search(q='...')`, `root:`, path segments) that Graph treats
 * as part of the URL grammar, while encoding the user-supplied values
 * inside them.
 */
export function encodeGraphPath(path: string): string {
  return path
    .split("/")
    .map((segment) => {
      // Function-call wrapper like search(q='foo bar') — encode inner value.
      const fnMatch = segment.match(/^([a-zA-Z]+)\((.*)\)$/);
      if (fnMatch && fnMatch[2] !== undefined) {
        const inner = fnMatch[2].replace(
          /'([^']*)'/g,
          (_m, val: string) => `'${encodeURIComponent(val)}'`
        );
        return `${fnMatch[1]}(${inner})`;
      }
      // Colon path grammar (e.g. `root:Folder/Sub` or `id:/content`).
      if (segment.includes(":")) {
        return segment
          .split(":")
          .map((part) => (part ? encodeURIComponent(part) : ""))
          .join(":");
      }
      return encodeURIComponent(segment);
    })
    .join("/");
}