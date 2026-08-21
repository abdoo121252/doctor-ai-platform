import TurndownService from "turndown";
import type { ConvertedDocument, FileInput } from "../types";
import { DocumentConverter, decodeText } from "./base";
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

export class HtmlConverter extends DocumentConverter {
  accepts(input: FileInput): boolean {
    const mime = input.mimeType ?? "";
    const ext = this.getExtension(input.fileName);
    return (
      mime === "text/html" ||
      mime === "application/xhtml+xml" ||
      ext === "html" ||
      ext === "htm" ||
      ext === "xhtml"
    );
  }

  async convert(input: FileInput): Promise<ConvertedDocument> {
    const raw = decodeText(input.buffer, this.getCharset(input));
    const titleMatch = /<title[^>]*>([^<]*)<\/title>/i.exec(raw);
    const title = titleMatch?.[1]?.trim() || null;
    // Drop non-content blocks so CSS/JS noise never reaches the LLM.
    const html = raw
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, "");
    const markdown = await replaceInlineDataUriImages(getTurndown().turndown(html));
    return {
      markdown,
      title,
      metadata: { source_type: "html" },
      converter: "HtmlConverter",
    };
  }
}