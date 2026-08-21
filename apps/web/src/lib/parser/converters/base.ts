import type { Converter, ConvertedDocument, FileInput } from "../types";

export abstract class DocumentConverter implements Converter {
  abstract accepts(input: FileInput): boolean;
  abstract convert(input: FileInput): Promise<ConvertedDocument>;

  protected getExtension(fileName: string): string {
    const idx = fileName.lastIndexOf(".");
    return idx >= 0 ? fileName.slice(idx + 1).toLowerCase() : "";
  }

  protected getCharset(input: FileInput): string {
    const match = /charset=([^;]+)/i.exec(input.mimeType ?? "");
    if (match?.[1]) return match[1].trim().toLowerCase();
    return "utf-8";
  }
}

/** Decode a Buffer to text, honoring BOMs and charset; falls back to UTF-8. */
export function decodeText(buffer: Buffer, charset = "utf-8"): string {
  const bom = buffer.subarray(0, 3);
  if (bom[0] === 0xef && bom[1] === 0xbb && bom[2] === 0xbf) {
    return buffer.toString("utf8").replace(/^\uFEFF/, "");
  }
  if (bom[0] === 0xff && bom[1] === 0xfe) {
    return buffer.toString("utf16le");
  }
  if (bom[0] === 0xfe && bom[1] === 0xff) {
    return swapUtf16(buffer);
  }

  const normalized = charset.toLowerCase().replace(/["']/g, "").replace("_", "-");
  if (normalized === "utf-16" || normalized === "utf-16le") {
    return buffer.toString("utf16le");
  }
  if (normalized === "utf-16be") {
    return swapUtf16(buffer);
  }
  if (normalized === "utf-8" || normalized === "utf8" || normalized === "" || normalized === "us-ascii" || normalized === "ascii") {
    return buffer.toString("utf8");
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const iconv = require("iconv-lite");
    const decoded = iconv.decode(buffer, normalized);
    if (typeof decoded === "string") return decoded;
  } catch {
    // fall through to UTF-8
  }
  return buffer.toString("utf8");
}

function swapUtf16(buffer: Buffer): string {
  const bytes = Buffer.from(buffer);
  const out = Buffer.alloc(bytes.length);
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    out[i] = bytes[i + 1] ?? 0;
    out[i + 1] = bytes[i] ?? 0;
  }
  return out.toString("utf16le");
}

/** Render a 2D string array as a GitHub-flavored markdown table. */
export function toMarkdownTable(rows: string[][]): string {
  if (rows.length === 0) return "";
  const header = rows[0] ?? [];
  const body = rows.slice(1);
  const width = Math.max(header.length, ...body.map((r) => r.length));

  const escapeCell = (c: string) => c.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
  const pad = (cells: string[]) => {
    const padded = [...cells];
    while (padded.length < width) padded.push("");
    return padded.map(escapeCell);
  };

  const lines: string[] = [];
  lines.push(`| ${pad(header).join(" | ")} |`);
  lines.push(`| ${Array(width).fill("---").join(" | ")} |`);
  for (const row of body) {
    lines.push(`| ${pad(row).join(" | ")} |`);
  }
  return lines.join("\n");
}