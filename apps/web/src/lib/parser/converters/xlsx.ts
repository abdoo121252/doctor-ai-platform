import ExcelJS from "exceljs";
import type { ConvertedDocument, FileInput } from "../types";
import { DocumentConverter, toMarkdownTable } from "./base";

export class XlsxConverter extends DocumentConverter {
  accepts(input: FileInput): boolean {
    const mime = input.mimeType ?? "";
    const ext = this.getExtension(input.fileName);
    return (
      mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      ext === "xlsx" ||
      (mime === "application/octet-stream" && ext === "")
    );
  }

  async convert(input: FileInput): Promise<ConvertedDocument> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      input.buffer as unknown as Parameters<typeof ExcelJS.Workbook.prototype.xlsx.load>[0]
    );

    const sections: string[] = [];
    for (const worksheet of workbook.worksheets) {
      const rows: string[][] = [];
      worksheet.eachRow((row) => {
        const cells: string[] = [];
        row.eachCell({ includeEmpty: true }, (cell) => {
          cells.push(typeof cell.text === "string" ? cell.text.trim() : String(cell.text ?? ""));
        });
        rows.push(cells);
      });

      const nonEmptyRows = rows.filter((r) => r.some((c) => c.length > 0));
      sections.push(`## ${worksheet.name}`);
      sections.push("");
      if (nonEmptyRows.length > 0) {
        sections.push(toMarkdownTable(nonEmptyRows));
      }
      sections.push("");
    }

    return {
      markdown: sections.join("\n"),
      title: null,
      metadata: { sheet_count: workbook.worksheets.length },
      converter: "XlsxConverter",
    };
  }
}