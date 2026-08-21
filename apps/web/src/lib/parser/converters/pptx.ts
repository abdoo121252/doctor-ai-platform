import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import type { ConvertedDocument, FileInput } from "../types";
import { DocumentConverter, toMarkdownTable } from "./base";
import { captionOrSkipImage, DENSE_SLIDE_IMAGE_THRESHOLD } from "./image-caption";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type XmlNode = any;

const xmlParser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: false,
  trimValues: true,
  parseTagValue: false,
});

export function parseXml(xml: string): XmlNode {
  return xmlParser.parse(xml);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function asArray(node: any): any[] {
  if (node == null) return [];
  return Array.isArray(node) ? node : [node];
}

/** Resolve an OOXML part target (relative to a base part directory) to a zip path. */
export function resolvePartPath(baseDir: string, target: string): string {
  const clean = target.replace(/^\//, "");
  if (clean.startsWith("..")) {
    const parts = clean.split("/");
    const base = baseDir.replace(/\/+$/, "").split("/");
    while (parts.length > 0 && parts[0] === "..") {
      parts.shift();
      if (base.length > 0) base.pop();
    }
    return [...base, ...parts].join("/");
  }
  return `${baseDir.replace(/\/+$/, "")}/${clean}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function attr(node: any, name: string): string | undefined {
  if (!node || typeof node !== "object") return undefined;
  const val = node[`@_${name}`] ?? node[`@_a:${name}`] ?? node[`@_p:${name}`] ?? node[`@_r:${name}`];
  return val === undefined || val === null ? undefined : String(val);
}

/** Recursively collect <a:t> text runs in document order. */
export function collectTextRuns(node: XmlNode, out: string[] = []): string[] {
  if (node == null) return out;
  if (typeof node === "string") return out;
  if (Array.isArray(node)) {
    for (const child of node) collectTextRuns(child, out);
    return out;
  }
  if (typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (key === "t") {
        if (typeof value === "string") out.push(value);
      } else {
        collectTextRuns(value, out);
      }
    }
  }
  return out;
}

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  tif: "image/tiff",
  tiff: "image/tiff",
};

/** Collect every <p:pic> node on the slide (document order). */
export function collectPictures(spTree: XmlNode): XmlNode[] {
  return asArray(spTree?.pic);
}

/**
 * Resolve a picture's blip relationship to its actual image bytes in the zip.
 * Returns the raw buffer + mime, or null when the relationship cannot be resolved.
 */
export async function resolveSlideImage(
  zip: JSZip,
  slideTarget: string,
  blip: XmlNode
): Promise<{ buffer: Buffer; mime: string } | null> {
  const rid = attr(blip, "embed");
  if (!rid) return null;
  const slideDir = slideTarget.includes("/") ? slideTarget.split("/").slice(0, -1).join("/") : "";
  const slideName = slideTarget.split("/").pop() ?? "";
  const relsXml = await zip.file(`${slideDir}/_rels/${slideName}.rels`)?.async("string");
  if (!relsXml) return null;
  const rels = parseXml(relsXml).Relationships?.Relationship ?? [];
  for (const rel of asArray(rels)) {
    if (attr(rel, "Id") !== rid) continue;
    const target = attr(rel, "Target") ?? "";
    const path = resolvePartPath(slideDir, target);
    const buffer = await zip.file(path)?.async("nodebuffer");
    if (!buffer) return null;
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    return { buffer, mime: MIME_BY_EXT[ext] ?? "image/png" };
  }
  return null;
}

function paragraphLines(txBody: XmlNode): string[] {
  const lines: string[] = [];
  for (const p of asArray(txBody?.p)) {
    const text = collectTextRuns(p).join("");
    if (text.trim().length > 0) lines.push(text);
  }
  return lines;
}

function extractShapes(spTree: XmlNode): {
  texts: Array<{ paragraphs: string[]; isTitle: boolean }>;
  tables: string[][][];
  pictures: string[];
} {
  const texts: Array<{ paragraphs: string[]; isTitle: boolean }> = [];
  const tables: string[][][] = [];
  const pictures: string[] = [];

  for (const shape of asArray(spTree?.sp)) {
    const ph = shape?.nvSpPr?.cNvPr?.nvPr?.ph;
    const isTitle =
      attr(ph, "type") === "title" ||
      (attr(shape?.nvSpPr?.cNvPr, "name")?.toLowerCase().includes("title") ?? false);
    const txBody = shape?.txBody;
    const paragraphs = paragraphLines(txBody);
    if (paragraphs.length > 0) {
      texts.push({ paragraphs, isTitle });
    }
  }

  for (const graphicFrame of asArray(spTree?.graphicFrame)) {
    const tbl = graphicFrame?.graphic?.graphicData?.tbl;
    if (!tbl) continue;
    const rows: string[][] = [];
    for (const tr of asArray(tbl?.tr)) {
      const cells: string[] = [];
      for (const tc of asArray(tr?.tc)) {
        const cellText = paragraphLines(tc?.txBody).join(" ");
        cells.push(cellText);
      }
      rows.push(cells);
    }
    tables.push(rows);
  }

  for (const pic of asArray(spTree?.pic)) {
    const name = attr(pic?.nvPicPr?.cNvPr, "name") || "image";
    pictures.push(name);
  }

  return { texts, tables, pictures };
}

async function slideOrder(zip: JSZip): Promise<string[]> {
  // rId -> target slide file (resolved relative to the presentation part dir)
  const relsXml = await zip.file("ppt/_rels/presentation.xml.rels")?.async("string");
  const presentationXml = await zip.file("ppt/presentation.xml")?.async("string");
  if (!relsXml || !presentationXml) return [];

  const rels = parseXml(relsXml).Relationships?.Relationship ?? [];
  const targetByRid = new Map<string, string>();
  let officeDocumentTarget: string | undefined;
  for (const rel of asArray(rels)) {
    const rid = attr(rel, "Id");
    const target = attr(rel, "Target");
    const type = attr(rel, "Type") ?? "";
    if (rid && target) targetByRid.set(rid, target.replace(/^\//, ""));
    // The officeDocument relationship is NOT always rId1 — find it by type.
    if (type.endsWith("/officeDocument") && !officeDocumentTarget) {
      officeDocumentTarget = target;
    }
  }

  // Resolve the presentation part dir (target is relative to the zip root).
  const docTarget = officeDocumentTarget ?? "ppt/presentation.xml";
  const docDir = docTarget.replace(/^\//, "").split("/").slice(0, -1).join("/");
  const docPartDir = docDir === "" ? "ppt" : docDir;

  const order: string[] = [];
  const sldIdLst = parseXml(presentationXml)?.presentation?.sldIdLst?.sldId;
  for (const sldId of asArray(sldIdLst)) {
    const rid = attr(sldId, "id");
    const target = rid ? targetByRid.get(rid) : undefined;
    if (target) order.push(resolvePartPath(docPartDir, target));
  }
  return order;
}

async function notesSlideFor(zip: JSZip, slideTarget: string): Promise<string | null> {
  const slideDir = slideTarget.includes("/") ? slideTarget.split("/").slice(0, -1).join("/") : "";
  const slideName = slideTarget.split("/").pop() ?? "";
  const relsXml = await zip.file(`${slideDir}/_rels/${slideName}.rels`)?.async("string");
  if (!relsXml) return null;
  const rels = parseXml(relsXml).Relationships?.Relationship ?? [];
  for (const rel of asArray(rels)) {
    const target = attr(rel, "Target") ?? "";
    if (target.includes("notesSlides")) {
      const notesPath = resolvePartPath(slideDir, target);
      const notesXml = await zip.file(notesPath)?.async("string");
      return notesXml ?? null;
    }
  }
  return null;
}

/**
 * High-density slides (> DENSE_SLIDE_IMAGE_THRESHOLD embedded images): bypass
 * per-image extraction and describe the WHOLE slide as one rendered image so
 * spatial context between text, charts, and visuals is preserved. Best-effort:
 * any rendering/vision failure degrades to an informative marker.
 */
async function describeDenseSlide(zip: JSZip, slideTarget: string): Promise<string> {
  try {
    const { describeSlide } = await import("../ocr");
    const { renderSlide } = await import("./pptx-render");
    const rendered = await renderSlide(zip, slideTarget);
    if (!rendered) return "[Slide Overview: full-slide rendering unavailable]";
    const overview = await describeSlide(rendered);
    return `[Slide Overview: ${overview}]`;
  } catch {
    return "[Slide Overview: full-slide visual breakdown failed]";
  }
}

export class PptxConverter extends DocumentConverter {
  accepts(input: FileInput): boolean {
    const mime = input.mimeType ?? "";
    const ext = this.getExtension(input.fileName);
    return (
      mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
      ext === "pptx"
    );
  }

  async convert(input: FileInput): Promise<ConvertedDocument> {
    const zip = await JSZip.loadAsync(input.buffer);
    const order = await slideOrder(zip);
    if (order.length === 0) {
      throw new Error("No slides found in presentation");
    }

    const sections: string[] = [];
    let slideIndex = 1;

    for (const slideTarget of order) {
      const slideXml = await zip.file(slideTarget)?.async("string");
      if (!slideXml) continue;

      const parsed = parseXml(slideXml);
      const spTree = parsed?.sld?.cSld?.spTree;
      const { texts, tables } = extractShapes(spTree);
      const pictures = collectPictures(spTree);

      const block: string[] = [];
      block.push(`<!-- Slide number: ${slideIndex} -->`);
      block.push("");

      for (const { paragraphs, isTitle } of texts) {
        const content = paragraphs.join("\n");
        if (isTitle) {
          block.push(`# ${content}`);
          block.push("");
        } else {
          block.push(content);
          block.push("");
        }
      }

      for (const table of tables) {
        block.push(toMarkdownTable(table));
        block.push("");
      }

      if (pictures.length > DENSE_SLIDE_IMAGE_THRESHOLD) {
        // High-density slide: one vision call over the whole rendered slide.
        block.push(await describeDenseSlide(zip, slideTarget));
        block.push("");
      } else {
        // Sparse slide: threshold-caption each embedded image individually.
        for (const pic of pictures) {
          const name = attr(pic?.nvPicPr?.cNvPr, "name") || "image";
          const resolved = await resolveSlideImage(zip, slideTarget, pic?.blipFill?.blip);
          if (!resolved) {
            block.push(`![${name}](${name})`);
            block.push("");
            continue;
          }
          const token = await captionOrSkipImage(resolved.buffer, resolved.mime);
          if (token !== "") {
            block.push(token);
            block.push("");
          }
        }
      }

      const notesXml = await notesSlideFor(zip, slideTarget);
      if (notesXml) {
        const notesParsed = parseXml(notesXml);
        const noteText = collectTextRuns(notesParsed?.notes?.cSld?.spTree).join("\n").trim();
        if (noteText) {
          block.push("### Notes:");
          block.push(noteText);
          block.push("");
        }
      }

      sections.push(block.join("\n"));
      slideIndex += 1;
    }

    return {
      markdown: sections.join("\n"),
      title: null,
      metadata: { slide_count: slideIndex - 1 },
      converter: "PptxConverter",
    };
  }
}