import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { convertToMarkdown } from "@/lib/parser/markitdown-ts";
import { ConversionError, UnsupportedFormatError } from "@/lib/parser/types";
import type { FileInput } from "@/lib/parser/types";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const runtime = "nodejs";

/** Vercel's serverless function body limit (~4.5 MB) for direct uploads. */
const DIRECT_UPLOAD_LIMIT = 4.5 * 1024 * 1024;
/** Safety cap for URL downloads so a bad/malicious link cannot exhaust memory. */
const MAX_URL_DOWNLOAD = 200 * 1024 * 1024;
/**
 * Memory-heavy office formats (xlsx/pptx) build full worksheet/DOM trees in
 * memory, so a large one can OOM a serverless function. 30MB keeps peak RAM
 * safely inside a 1GB function budget.
 */
const EXCEL_ZIP_LIMIT = 30 * 1024 * 1024;

/** True when the target format parses into an in-memory tree (OOM-sensitive). */
function isMemoryHeavyFormat(fileName: string): boolean {
  return /\.(xlsx|pptx)$/i.test(fileName);
}

/**
 * Best-effort page/slide/sheet count for the response payload. Converters
 * already report these counts in metadata (num_pages / slide_count /
 * sheet_count); non-paginated formats return null.
 */
function pageCountFromMetadata(
  metadata: Record<string, unknown> | null | undefined
): number | null {
  if (!metadata) return null;
  for (const key of ["num_pages", "slide_count", "sheet_count"]) {
    const value = metadata[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return value;
    }
  }
  return null;
}

/**
 * SSRF guard: only http(s), and never loopback / private / link-local /
 * metadata (169.254.x.x) / CGNAT / multicast literal addresses or obvious
 * local-only hostnames. DNS-rebinding tricks are outside this synchronous check.
 */
function isSafeUrl(urlStr: string): boolean {
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return false;
  }

  const hostname = url.hostname.toLowerCase();
  const bare =
    hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;

  // IPv4 private / loopback / link-local / CGNAT / multicast + reserved ranges.
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(bare);
  if (ipv4) {
    const octets = ipv4.slice(1).map(Number);
    if (octets.some((n) => n > 255)) {
      return false; // not a valid IP literal
    }
    const [a = 0, b = 0] = octets;
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    ) {
      return false;
    }
    return true;
  }

  // IPv6 loopback / link-local / unique-local; re-check IPv4-mapped addresses.
  if (bare.includes(":")) {
    const lower = bare.toLowerCase();
    if (lower.startsWith("::ffff:")) {
      return isSafeUrl(`http://${lower.slice(7)}/`);
    }
    return !(
      lower === "::" ||
      lower === "::1" ||
      lower.startsWith("fe80:") ||
      lower.startsWith("fc") ||
      lower.startsWith("fd")
    );
  }

  // Hostnames: block obvious local/private names (real DNS resolution is out of scope).
  return !(
    hostname === "localhost" ||
    hostname === "localhost.localdomain" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  );
}

function parseOptionalFlags(form: FormData): {
  ocr?: boolean;
  prompt?: string;
  maxOcrPages?: number;
} {
  const ocr = form.get("ocr") === "true";
  const promptValue = form.get("prompt");
  const maxValue = form.get("maxOcrPages");

  let maxOcrPages: number | undefined;
  const parsedMax = Number(maxValue);
  if (maxValue && Number.isInteger(parsedMax) && parsedMax > 0) {
    maxOcrPages = parsedMax;
  }

  return {
    ocr: ocr || undefined,
    prompt: typeof promptValue === "string" && promptValue.length > 0 ? promptValue : undefined,
    maxOcrPages,
  };
}

function normalizeFileUrl(url: string): string {
  const driveMatch = /^https:\/\/drive\.google\.com\/file\/d\/([^/]+)\/view/i.exec(url);
  if (driveMatch?.[1]) {
    return `https://drive.google.com/uc?export=download&id=${driveMatch[1]}`;
  }
  return url;
}

function fileNameFromUrl(url: string): string {
  try {
    const name = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
    return name || "download";
  } catch {
    return "download";
  }
}

/**
 * Stream a URL download into a temporary file under /tmp (never buffering the
 * whole body in memory), enforcing the 200MB cap while streaming. Returns the
 * temp file path plus the number of bytes written. The caller owns the file
 * and must delete it (see the finally block in POST).
 */
async function downloadFile(fileUrl: string): Promise<{ path: string; size: number }> {
  const resp = await fetch(normalizeFileUrl(fileUrl));
  if (!resp.ok) {
    throw new ConversionError(`Failed to download ${fileUrl}: HTTP ${resp.status}`);
  }
  if (!resp.body) {
    throw new ConversionError("Downloaded response has no body");
  }

  const contentLength = Number(resp.headers.get("content-length") ?? 0);
  if (contentLength > MAX_URL_DOWNLOAD) {
    throw new ConversionError("Downloaded file exceeds the 200MB size limit");
  }

  const tmpPath = join(tmpdir(), `parse-${randomUUID()}`);
  const out = createWriteStream(tmpPath, { flags: "w", mode: 0o600 });
  let total = 0;

  // Enforce the cap while streaming so a mis-sized body never sits in memory.
  const counter = new Transform({
    transform(chunk, _encoding, callback) {
      total += chunk.length;
      if (total > MAX_URL_DOWNLOAD) {
        callback(new ConversionError("Downloaded file exceeds the 200MB size limit"));
        return;
      }
      callback(null, chunk);
    },
  });

  try {
    await pipeline(
      Readable.fromWeb(resp.body as unknown as import("node:stream/web").ReadableStream),
      counter,
      out
    );
    return { path: tmpPath, size: total };
  } catch (err) {
    await rm(tmpPath, { force: true }).catch(() => {});
    if (err instanceof ConversionError) throw err;
    throw new ConversionError(
      `Failed to download ${fileUrl}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentType = request.headers.get("content-type") ?? "";

  let input: FileInput;
  let ocr: boolean | undefined;
  let prompt: string | undefined;
  let maxOcrPages: number | undefined;

  if (contentType.includes("multipart/form-data")) {
    // Mode 1: direct file upload.
    const form = await request.formData().catch(() => null);
    if (!form) {
      return NextResponse.json({ error: "Could not read multipart form data" }, { status: 400 });
    }
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    if (file.size > DIRECT_UPLOAD_LIMIT) {
      return NextResponse.json(
        {
          error: "File exceeds 4.5MB direct upload limit. Please provide a fileUrl instead.",
        },
        { status: 413 }
      );
    }
    const flags = parseOptionalFlags(form);
    ocr = flags.ocr;
    prompt = flags.prompt;
    maxOcrPages = flags.maxOcrPages;
    input = {
      buffer: Buffer.from(await file.arrayBuffer()),
      fileName: file.name || "upload",
      mimeType: file.type || undefined,
    };
  } else {
    // Mode 2: JSON payload with a hosted file URL.
    const body = await request.json().catch(() => null);
    const fileUrl = typeof body?.fileUrl === "string" ? body.fileUrl.trim() : "";
    if (!fileUrl) {
      return NextResponse.json(
        { error: "fileUrl (or a multipart 'file') is required" },
        { status: 400 }
      );
    }
    if (!/^https?:\/\//i.test(fileUrl)) {
      return NextResponse.json(
        { error: "fileUrl must be an http(s) URL" },
        { status: 400 }
      );
    }
    if (!isSafeUrl(fileUrl)) {
      return NextResponse.json(
        { error: "Invalid or unsafe URL provided." },
        { status: 400 }
      );
    }

    const fileName =
      typeof body?.fileName === "string" && body.fileName.trim().length > 0
        ? body.fileName.trim()
        : fileNameFromUrl(fileUrl);
    const mimeType =
      typeof body?.mimeType === "string" && body.mimeType.trim().length > 0
        ? body.mimeType.trim()
        : undefined;

    ocr = body?.ocr === true;
    prompt = typeof body?.prompt === "string" && body.prompt.length > 0 ? body.prompt : undefined;
    const parsedMax = Number(body?.maxOcrPages);
    if (Number.isInteger(parsedMax) && parsedMax > 0) {
      maxOcrPages = parsedMax;
    }

    // Stream the download to a temp file (never buffering the whole body in
    // memory), enforce the 200MB cap during streaming, then materialize the
    // Buffer just-in-time for the parser. The temp file is always removed once
    // conversion completes, including on early 413/422 returns.
    let tmp: { path: string; size: number } | null = null;
    try {
      tmp = await downloadFile(fileUrl);

      // OOM guard: xlsx/pptx build full worksheet/DOM trees in memory, so cap
      // them BEFORE reading the file into a Buffer.
      if (isMemoryHeavyFormat(fileName) && tmp.size > EXCEL_ZIP_LIMIT) {
        return NextResponse.json(
          { error: "Excel/PPTX files over 30MB are not supported due to memory constraints." },
          { status: 413 }
        );
      }

      input = { buffer: await readFile(tmp.path), fileName, mimeType };
    } catch (err) {
      if (err instanceof ConversionError) {
        return NextResponse.json({ error: err.message }, { status: 422 });
      }
      throw err;
    } finally {
      if (tmp) {
        await rm(tmp.path, { force: true }).catch(() => {});
      }
    }
  }

  // OOM guard: xlsx/pptx build full worksheet/DOM trees in memory, so cap them.
  if (isMemoryHeavyFormat(input.fileName) && input.buffer.length > EXCEL_ZIP_LIMIT) {
    return NextResponse.json(
      { error: "Excel/PPTX files over 30MB are not supported due to memory constraints." },
      { status: 413 }
    );
  }

  try {
    const started = Date.now();
    const result = await convertToMarkdown(input, { ocr, prompt, maxOcrPages });
    const processingTimeMs = Date.now() - started;
    return NextResponse.json({
      ...result,
      processingTimeMs,
      pageCount: pageCountFromMetadata(result.metadata),
    });
  } catch (err) {
    if (err instanceof UnsupportedFormatError) {
      return NextResponse.json({ error: err.message }, { status: 415 });
    }
    if (err instanceof ConversionError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error("[api/parse] Unexpected error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}