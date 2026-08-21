import mammoth from "mammoth";
import TurndownService from "turndown";
import type { ConvertedDocument, FileInput } from "../types";
import { DocumentConverter } from "./base";
import { replaceInlineDataUriImages } from "./image-caption";

let turndownService: TurndownService | null = null;

function getTurndown(): TurndownService {
  if (!turndownService) {
    turndownService = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      bulletListMarker: "-",
      emDelimiter: "*",
      strongDelimiter: "**",
    });
  }
  return turndownService;
}

export class DocxConverter extends DocumentConverter {
  accepts(input: FileInput): boolean {
    const mime = input.mimeType ?? "";
    const ext = this.getExtension(input.fileName);
    return (
      mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      ext === "docx"
    );
  }

  async convert(input: FileInput): Promise<ConvertedDocument> {
    const result = await mammoth.convertToHtml({ buffer: input.buffer });
    const html = result.value ?? "";
    // mammoth inlines embedded images as data URIs — run them through the smart
    // captioning pipeline (decorative images are dropped, meaningful ones are
    // described by the vision model instead of dumping base64 into the prompt).
    const markdown = await replaceInlineDataUriImages(getTurndown().turndown(html));

    const heading = /^#{1,6}\s+(.+)$/m.exec(markdown);
    const title = heading?.[1]?.trim() ?? null;

    return {
      markdown,
      title,
      metadata: { file_extension: this.getExtension(input.fileName) || null },
      converter: "DocxConverter",
    };
  }
}