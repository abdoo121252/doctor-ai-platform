import type { ConvertOptions, Converter, ConvertedDocument, FileInput } from "./types";
import { ConversionError, UnsupportedFormatError } from "./types";
import { PlainTextConverter } from "./converters/plain-text";
import { HtmlConverter } from "./converters/html";
import { CsvConverter } from "./converters/csv";
import { DocxConverter } from "./converters/docx";
import { PptxConverter } from "./converters/pptx";
import { XlsxConverter } from "./converters/xlsx";
import { PdfConverter } from "./converters/pdf";
import { ImageConverter } from "./converters/image";

const PRIORITY_SPECIFIC = 0.0;
const PRIORITY_GENERIC = 10.0;

interface RegistryEntry {
  priority: number;
  converter: Converter;
}

const registry: RegistryEntry[] = [];

export function registerConverter(converter: Converter, priority = PRIORITY_GENERIC): void {
  registry.push({ priority, converter });
  registry.sort((a, b) => a.priority - b.priority);
}

function registerDefaults(): void {
  // Specific formats (most-specific first).
  registerConverter(new PptxConverter(), PRIORITY_SPECIFIC);
  registerConverter(new DocxConverter(), PRIORITY_SPECIFIC);
  registerConverter(new XlsxConverter(), PRIORITY_SPECIFIC);
  registerConverter(new CsvConverter(), PRIORITY_SPECIFIC);
  registerConverter(new PdfConverter(), PRIORITY_SPECIFIC);
  registerConverter(new ImageConverter(), PRIORITY_SPECIFIC);
  // Generic formats.
  registerConverter(new HtmlConverter(), PRIORITY_GENERIC);
  registerConverter(new PlainTextConverter(), PRIORITY_GENERIC);
}

registerDefaults();

/** MarkItDown-style normalization: rstrip lines, collapse 3+ newlines to 2. */
export function normalizeMarkdown(text: string): string {
  const lines = text.split("\n").map((line) => line.replace(/\s+$/g, ""));
  const result = lines.join("\n");
  return result.replace(/\n{3,}/g, "\n\n");
}

/**
 * Convert a file (Buffer + fileName + mimeType) into LLM-ready Markdown.
 * Tries every converter that accepts the input in priority order; the first
 * successful conversion wins.
 */
export async function convertToMarkdown(
  input: FileInput,
  options?: ConvertOptions
): Promise<ConvertedDocument> {
  const matches = registry.filter((entry) => entry.converter.accepts(input));
  if (matches.length === 0) {
    throw new UnsupportedFormatError(
      `Unsupported file type: ${input.fileName} (${input.mimeType ?? "unknown mime"})`
    );
  }

  let lastError: unknown = null;
  for (const entry of matches) {
    try {
      const result = await entry.converter.convert(input, options);
      result.markdown = normalizeMarkdown(result.markdown);
      if (!result.converter) {
        result.converter = entry.converter.constructor.name;
      }
      return result;
    } catch (err) {
      lastError = err;
      console.warn(
        `[parser] ${entry.converter.constructor.name} failed for ${input.fileName}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new ConversionError(`Failed to convert ${input.fileName}: ${detail}`);
}