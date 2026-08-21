import pdfParse from "pdf-parse";
import type { ConvertOptions, ConvertedDocument, FileInput } from "../types";
import { ConversionError } from "../types";
import { DocumentConverter } from "./base";
import { ocrPdf } from "../ocr";

/** A text-based PDF yields almost no extractable text if it is actually scanned. */
function looksScanned(text: string): boolean {
  const words = text.split(/\s+/).filter((w) => /[a-zA-Z0-9\u0600-\u06FF]/.test(w));
  return words.length < 3;
}

export class PdfConverter extends DocumentConverter {
  accepts(input: FileInput): boolean {
    const mime = input.mimeType ?? "";
    const ext = this.getExtension(input.fileName);
    return mime === "application/pdf" || ext === "pdf";
  }

  async convert(input: FileInput, options?: ConvertOptions): Promise<ConvertedDocument> {
    let parsed: Awaited<ReturnType<typeof pdfParse>>;
    try {
      parsed = await pdfParse(input.buffer);
    } catch (err) {
      throw new ConversionError(
        `Failed to read PDF: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    const text = parsed.text ?? "";
    const forceOcr = options?.ocr === true;

    if (forceOcr || looksScanned(text)) {
      try {
        const markdown = await ocrPdf(input.buffer, {
          prompt: options?.prompt,
          maxOcrPages: options?.maxOcrPages,
        });
        return {
          markdown,
          title: parsed.info?.Title ?? null,
          metadata: {
            file_extension: this.getExtension(input.fileName) || null,
            num_pages: parsed.numpages,
            ocr: true,
          },
          converter: "PdfConverter",
        };
      } catch (err) {
        // OCR failed (e.g. rendering issue) — fall back to the extracted text.
        return {
          markdown: text,
          title: parsed.info?.Title ?? null,
          metadata: {
            file_extension: this.getExtension(input.fileName) || null,
            num_pages: parsed.numpages,
            ocr: false,
            ocr_error: err instanceof Error ? err.message : String(err),
          },
          converter: "PdfConverter",
        };
      }
    }

    return {
      markdown: text,
      title: parsed.info?.Title ?? null,
      metadata: {
        file_extension: this.getExtension(input.fileName) || null,
        num_pages: parsed.numpages,
        ocr: false,
      },
      converter: "PdfConverter",
    };
  }
}