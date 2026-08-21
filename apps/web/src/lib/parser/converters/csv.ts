import { parse } from "csv-parse/sync";
import type { ConvertedDocument, FileInput } from "../types";
import { DocumentConverter, decodeText, toMarkdownTable } from "./base";

export class CsvConverter extends DocumentConverter {
  accepts(input: FileInput): boolean {
    const mime = input.mimeType ?? "";
    const ext = this.getExtension(input.fileName);
    return mime === "text/csv" || mime === "application/csv" || ext === "csv";
  }

  async convert(input: FileInput): Promise<ConvertedDocument> {
    const text = decodeText(input.buffer, this.getCharset(input));
    const records = parse(text, {
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    }) as unknown as string[][];

    const rows = records.map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? "")) : [String(r ?? "")]));
    const markdown = toMarkdownTable(rows);

    return {
      markdown,
      title: null,
      metadata: { file_extension: this.getExtension(input.fileName) || null },
      converter: "CsvConverter",
    };
  }
}