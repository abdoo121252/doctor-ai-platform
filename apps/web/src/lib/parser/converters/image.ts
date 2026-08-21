import exifr from "exifr";
import type { ConvertOptions, ConvertedDocument, FileInput } from "../types";
import { DocumentConverter } from "./base";
import { ocrImage } from "../ocr";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png"]);
const IMAGE_MIMES = new Set(["image/jpeg", "image/png"]);

export class ImageConverter extends DocumentConverter {
  accepts(input: FileInput): boolean {
    const mime = input.mimeType ?? "";
    const ext = this.getExtension(input.fileName);
    return IMAGE_MIMES.has(mime) || IMAGE_EXTENSIONS.has(ext);
  }

  async convert(input: FileInput, options?: ConvertOptions): Promise<ConvertedDocument> {
    const ext = this.getExtension(input.fileName);
    const mime = (input.mimeType && IMAGE_MIMES.has(input.mimeType)
      ? input.mimeType
      : ext === "png"
        ? "image/png"
        : "image/jpeg") as "image/png" | "image/jpeg";

    const defaultPrompt =
      "Extract all text from this image verbatim, preserving paragraph and line structure. " +
      "Do not summarize or add commentary. If the image contains no text, briefly describe what the image shows.";
    const prompt = options?.prompt ?? defaultPrompt;

    let description = "";
    let ocrError: string | null = null;
    try {
      description = await ocrImage(input.buffer, prompt, mime);
    } catch (err) {
      ocrError = err instanceof Error ? err.message : String(err);
    }

    const metadata: Record<string, unknown> = {
      filename: input.fileName,
      file_size: input.buffer.length,
      format: mime,
      ocr_error: ocrError,
    };

    try {
      const exif = await exifr.parse(input.buffer, { mergeOutput: true });
      if (exif && typeof exif === "object") {
        metadata.exif = formatExif(exif);
      }
    } catch {
      metadata.exif = null;
    }

    const sections: string[] = [];
    sections.push("# Description");
    sections.push("");
    sections.push(description || (ocrError ? `[OCR failed: ${ocrError}]` : "[No text detected]"));
    sections.push("");
    sections.push("# Metadata");
    sections.push("");
    for (const [key, value] of Object.entries(metadata)) {
      sections.push(`- **${key}**: ${String(value)}`);
    }

    return {
      markdown: sections.join("\n"),
      title: null,
      metadata,
      converter: "ImageConverter",
    };
  }
}

function formatExif(exif: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(exif)) {
    if (value == null) continue;
    if (typeof value === "object") {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    } else {
      lines.push(`${key}: ${String(value)}`);
    }
  }
  return lines.join("\n");
}