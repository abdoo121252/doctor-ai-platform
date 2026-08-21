import type { ConvertedDocument, FileInput } from "../types";
import { DocumentConverter, decodeText } from "./base";

const TEXT_EXTENSIONS = new Set([
  "txt",
  "text",
  "md",
  "markdown",
  "log",
  "json",
  "xml",
  "yaml",
  "yml",
  "ini",
  "cfg",
  "conf",
  "tsv",
]);

export class PlainTextConverter extends DocumentConverter {
  accepts(input: FileInput): boolean {
    const mime = input.mimeType ?? "";
    const ext = this.getExtension(input.fileName);
    if (mime.startsWith("text/")) return true;
    return TEXT_EXTENSIONS.has(ext);
  }

  async convert(input: FileInput): Promise<ConvertedDocument> {
    const charset = this.getCharset(input);
    const text = decodeText(input.buffer, charset);
    const ext = this.getExtension(input.fileName);

    let title: string | null = null;
    if (ext === "md" || ext === "markdown") {
      const heading = /^#{1,6}\s+(.+)$/m.exec(text);
      if (heading?.[1]) title = heading[1].trim();
    }

    return {
      markdown: text,
      title,
      metadata: { file_extension: ext || null, charset },
      converter: "PlainTextConverter",
    };
  }
}