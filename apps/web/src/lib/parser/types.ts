export interface FileInput {
  buffer: Buffer;
  fileName: string;
  mimeType?: string | null;
}

export interface ConvertOptions {
  /** Force OCR even when text extraction succeeds. */
  ocr?: boolean;
  /** Custom prompt for the vision/OCR model. */
  prompt?: string;
  /** Maximum number of pages to OCR for scanned PDFs (default 20). */
  maxOcrPages?: number;
}

export interface ConvertedDocument {
  markdown: string;
  title?: string | null;
  metadata?: Record<string, unknown> | null;
  /** Converter class name that produced the result. */
  converter?: string;
}

export interface Converter {
  /** Whether this converter can handle the input. */
  accepts(input: FileInput): boolean;
  convert(input: FileInput, options?: ConvertOptions): Promise<ConvertedDocument>;
}

export class UnsupportedFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedFormatError";
  }
}

export class ConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConversionError";
  }
}