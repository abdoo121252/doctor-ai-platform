import JSZip from "jszip";
import type { SKRSContext2D } from "@napi-rs/canvas";
import { asArray, attr, collectTextRuns, parseXml, resolvePartPath, resolveSlideImage, XmlNode } from "./pptx";

/** Default 16:9 slide size in EMU when presentation.xml omits <p:sldSz>. */
const DEFAULT_EMU_W = 12192000;
const DEFAULT_EMU_H = 6858000;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Render a single PPTX slide to a PNG buffer using the canvas binding, so the
 * vision model can inspect the slide's spatial layout (text + pictures + tables)
 * as ONE image. Pure-JS: no LibreOffice or PowerPoint required.
 *
 * Best-effort by design: anything unresolvable is drawn as a placeholder or
 * skipped, and any hard failure returns null (caller falls back to text-only).
 */
export async function renderSlide(
  zip: JSZip,
  slideTarget: string,
  options: { width?: number } = {}
): Promise<Buffer | null> {
  try {
    const presentationXml = await zip.file("ppt/presentation.xml")?.async("string");
    const presentation = presentationXml ? parseXml(presentationXml)?.presentation : null;
    const sldSz = presentation?.sldSz;
    const emuW = Number(attr(sldSz, "cx") ?? DEFAULT_EMU_W);
    const emuH = Number(attr(sldSz, "cy") ?? DEFAULT_EMU_H);
    if (emuW <= 0 || emuH <= 0) return null;

    const renderWidth = options.width ?? 1600;
    const pxPerEmu = renderWidth / emuW;
    const renderHeight = Math.round(emuH * pxPerEmu);

    const slideXml = await zip.file(slideTarget)?.async("string");
    if (!slideXml) return null;
    const parsedSlide = parseXml(slideXml);
    const spTree = parsedSlide?.sld?.cSld?.spTree;

    const { createCanvas } = await import("@napi-rs/canvas");
    const canvas = createCanvas(renderWidth, renderHeight);
    const ctx = canvas.getContext("2d");

    // Slide background (solid fill only) or plain white.
    const bg = parsedSlide?.sld?.cSld?.bg?.bgPr?.solidFill;
    ctx.fillStyle = bg?.srgbClr ? `#${attr(bg.srgbClr, "val") ?? "ffffff"}` : "#ffffff";
    ctx.fillRect(0, 0, renderWidth, renderHeight);

    await walkShapes(spTree, (kind, node) =>
      drawNode(kind, node, ctx, zip, slideTarget, pxPerEmu, renderWidth, renderHeight)
    );

    const png = Buffer.from(canvas.toBuffer("image/png"));
    // Release the native canvas memory eagerly (same pattern as ocr.ts).
    canvas.width = 0;
    canvas.height = 0;
    return png;
  } catch {
    return null;
  }
}

/** Visit spTree children (sp/pic/graphicFrame/cxnSp/grpSp) in document order. */
async function walkShapes(
  spTree: XmlNode,
  fn: (kind: string, node: XmlNode) => Promise<void>
): Promise<void> {
  if (spTree == null || typeof spTree !== "object") return;
  for (const [key, value] of Object.entries(spTree)) {
    if (key === "nvGrpSpPr" || key === "grpSpPr") continue;
    for (const node of asArray(value)) {
      await fn(key, node);
    }
  }
}

async function drawNode(
  kind: string,
  node: XmlNode,
  ctx: SKRSContext2D,
  zip: JSZip,
  slideTarget: string,
  pxPerEmu: number,
  renderWidth: number,
  renderHeight: number
): Promise<void> {
  switch (kind) {
    case "pic":
      await drawPicture(ctx, node, zip, slideTarget, pxPerEmu, renderWidth, renderHeight);
      break;
    case "sp":
      drawTextShape(ctx, node, pxPerEmu, renderWidth, renderHeight);
      break;
    case "graphicFrame":
      await drawGraphicFrame(ctx, node, zip, slideTarget, pxPerEmu, renderWidth, renderHeight);
      break;
    default:
      // cxnSp connectors and grpSp groups are intentionally skipped.
      break;
  }
}

/** Read <a:xfrm> (EMU) from a shape or graphicFrame; fall back to a centered box. */
function shapeRect(node: XmlNode, pxPerEmu: number, renderWidth: number, renderHeight: number): Rect {
  const xf = node?.spPr?.xfrm ?? node?.xfrm;
  if (xf) {
    const x = Number(attr(xf?.off, "x") ?? 0);
    const y = Number(attr(xf?.off, "y") ?? 0);
    const cx = Number(attr(xf?.ext, "cx") ?? 0);
    const cy = Number(attr(xf?.ext, "cy") ?? 0);
    if (cx > 0 && cy > 0) {
      return {
        x: Math.round(x * pxPerEmu),
        y: Math.round(y * pxPerEmu),
        w: Math.max(1, Math.round(cx * pxPerEmu)),
        h: Math.max(1, Math.round(cy * pxPerEmu)),
      };
    }
  }
  const w = Math.round(renderWidth * 0.8);
  const h = Math.round(renderHeight * 0.5);
  return { x: Math.round((renderWidth - w) / 2), y: Math.round((renderHeight - h) / 2), w, h };
}

async function drawPicture(
  ctx: SKRSContext2D,
  pic: XmlNode,
  zip: JSZip,
  slideTarget: string,
  pxPerEmu: number,
  renderWidth: number,
  renderHeight: number
): Promise<void> {
  const resolved = await resolveSlideImage(zip, slideTarget, pic?.blipFill?.blip);
  if (!resolved) return;
  const { loadImage } = await import("@napi-rs/canvas");
  let image;
  try {
    image = await loadImage(resolved.buffer);
  } catch {
    return; // undecodable vector format (EMF/WMF) — skip silently
  }

  const pos = shapeRect(pic, pxPerEmu, renderWidth, renderHeight);
  ctx.save();
  // Light frame so layout boxes are visible to the vision model.
  ctx.fillStyle = "#f3f5f7";
  ctx.fillRect(pos.x, pos.y, pos.w, pos.h);
  ctx.strokeStyle = "#c8ccd2";
  ctx.lineWidth = 1;
  ctx.strokeRect(pos.x, pos.y, pos.w, pos.h);
  // Contain-fit the raster while preserving aspect ratio.
  const imgAspect = image.width / image.height;
  const boxAspect = pos.w / pos.h;
  let drawW = pos.w;
  let drawH = pos.h;
  if (imgAspect > boxAspect) {
    drawH = pos.w / imgAspect;
  } else {
    drawW = pos.h * imgAspect;
  }
  ctx.drawImage(image, pos.x + (pos.w - drawW) / 2, pos.y + (pos.h - drawH) / 2, drawW, drawH);
  ctx.restore();
}

function drawTextShape(
  ctx: SKRSContext2D,
  sp: XmlNode,
  pxPerEmu: number,
  renderWidth: number,
  renderHeight: number
): void {
  const pos = shapeRect(sp, pxPerEmu, renderWidth, renderHeight);
  drawParagraphs(ctx, pos.x, pos.y, pos.w, pos.h, textParagraphs(sp?.txBody));
}

/** Extract runs per paragraph with approximate style (size, bold, italic, color). */
function textParagraphs(txBody: XmlNode): Array<{ segments: Array<{ text: string; sizePt: number; bold: boolean; italic: boolean; color: string }> }> {
  const paragraphs: Array<{ segments: Array<{ text: string; sizePt: number; bold: boolean; italic: boolean; color: string }> }> = [];
  for (const p of asArray(txBody?.p)) {
    const segments: Array<{ text: string; sizePt: number; bold: boolean; italic: boolean; color: string }> = [];
    for (const r of asArray(p?.r)) {
      const text = collectTextRuns(r).join("");
      if (!text) continue;
      const rPr = r?.rPr;
      const sizePt = rPr && attr(rPr, "sz") ? Number(attr(rPr, "sz")) / 100 : 18;
      const bold = !!rPr?.b;
      const italic = !!rPr?.i;
      let color = "#1f1f1f";
      if (rPr?.solidFill?.srgbClr) color = `#${attr(rPr.solidFill.srgbClr, "val") ?? "1f1f1f"}`;
      segments.push({ text, sizePt, bold, italic, color });
    }
    if (segments.length > 0) paragraphs.push({ segments });
  }
  return paragraphs;
}

function drawParagraphs(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  maxW: number,
  maxH: number,
  paragraphs: ReturnType<typeof textParagraphs>
): void {
  let cursorY = y;
  const ptToPx = (pt: number) => Math.max(9, Math.round(pt * 1.333));
  for (const para of paragraphs) {
    const style = para.segments[0];
    const fontSize = ptToPx(style?.sizePt ?? 18);
    const lineHeight = Math.round(fontSize * 1.35);
    ctx.font = `${style?.bold ? "bold " : ""}${style?.italic ? "italic " : ""}${fontSize}px Arial, Helvetica, sans-serif`;
    ctx.fillStyle = style?.color ?? "#1f1f1f";
    const text = para.segments.map((s) => s.text).join("");
    for (const line of wrapText(ctx, text, maxW)) {
      if (cursorY + fontSize > y + maxH) break;
      ctx.fillText(line, x, cursorY + fontSize);
      cursorY += lineHeight;
    }
    cursorY += Math.round(lineHeight * 0.4);
  }
}

function wrapText(ctx: SKRSContext2D, text: string, maxW: number): string[] {
  if (maxW <= 0 || !text) return [text];
  const words = text.split(/(\s+)/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line + word;
    if (ctx.measureText(candidate).width <= maxW || line === "") {
      line = candidate;
    } else {
      if (line.trim() !== "") lines.push(line.trim());
      line = word;
    }
  }
  if (line.trim() !== "") lines.push(line.trim());
  return lines.length > 0 ? lines : [text];
}

async function drawGraphicFrame(
  ctx: SKRSContext2D,
  graphicFrame: XmlNode,
  zip: JSZip,
  slideTarget: string,
  pxPerEmu: number,
  renderWidth: number,
  renderHeight: number
): Promise<void> {
  const graphicData = graphicFrame?.graphic?.graphicData;
  if (!graphicData) return;
  const pos = shapeRect(graphicFrame, pxPerEmu, renderWidth, renderHeight);
  if (graphicData.tbl) {
    drawTable(ctx, graphicData.tbl, pos);
    return;
  }
  if (graphicData.chart) {
    const title = await chartTitle(zip, slideTarget, graphicData.chart);
    drawChartPlaceholder(ctx, pos, title);
  }
}

function drawTable(ctx: SKRSContext2D, tbl: XmlNode, pos: Rect): void {
  const gridCols = asArray(tbl?.tblGrid?.gridCol).map((gc) => Number(attr(gc, "w") ?? 0));
  const rows = asArray(tbl?.tr);
  if (rows.length === 0) return;
  const columnCount = gridCols.length > 0 ? gridCols.length : Math.max(...rows.map((tr) => asArray(tr?.tc).length), 1);
  const colWidths = scaleToPixels(gridCols, pos.w, columnCount);
  const rowEmu = rows.map((tr) => Number(attr(tr, "h") ?? 0));
  const totalEmu = rowEmu.reduce((a, b) => a + b, 0);
  const rowHeights =
    totalEmu > 0
      ? rowEmu.map((h) => (h / totalEmu) * pos.h)
      : Array(rows.length).fill(pos.h / rows.length);

  let y = pos.y;
  rows.forEach((tr, r) => {
    let x = pos.x;
    const h = rowHeights[r] ?? pos.h / rows.length;
    asArray(tr?.tc).forEach((tc, c) => {
      const w = colWidths[c] ?? pos.w / columnCount;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "#9aa0a6";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);
      drawParagraphs(ctx, x + 6, y + 4, Math.max(1, w - 12), Math.max(1, h - 8), textParagraphs(tc?.txBody));
      x += w;
    });
    y += h;
  });
}

function scaleToPixels(widths: number[], totalPx: number, count: number): number[] {
  if (count <= 0) return [];
  const fallback = Array(count).fill(totalPx / count);
  if (widths.length === 0) return fallback;
  const sum = widths.reduce((a, b) => a + b, 0);
  if (sum <= 0) return fallback;
  const scaled = widths.map((w) => (w / sum) * totalPx);
  while (scaled.length < count) scaled.push(totalPx / count);
  return scaled;
}

async function chartTitle(zip: JSZip, slideTarget: string, chartNode: XmlNode): Promise<string> {
  const rid = attr(chartNode, "id");
  if (!rid) return "untitled";
  const slideDir = slideTarget.includes("/") ? slideTarget.split("/").slice(0, -1).join("/") : "";
  const slideName = slideTarget.split("/").pop() ?? "";
  const relsXml = await zip.file(`${slideDir}/_rels/${slideName}.rels`)?.async("string");
  if (!relsXml) return "untitled";
  const rels = parseXml(relsXml).Relationships?.Relationship ?? [];
  for (const rel of asArray(rels)) {
    if (attr(rel, "Id") !== rid) continue;
    const target = attr(rel, "Target") ?? "";
    const chartXmlStr = await zip.file(resolvePartPath(slideDir, target))?.async("string");
    if (!chartXmlStr) return "untitled";
    const chartXml = parseXml(chartXmlStr);
    const title = collectTextRuns(chartXml?.chartSpace?.chart?.title?.tx?.rich).join(" ").trim();
    return title || "untitled";
  }
  return "untitled";
}

function drawChartPlaceholder(ctx: SKRSContext2D, pos: Rect, title: string): void {
  ctx.fillStyle = "#eef1f4";
  ctx.fillRect(pos.x, pos.y, pos.w, pos.h);
  ctx.strokeStyle = "#b8bec4";
  ctx.lineWidth = 1;
  ctx.strokeRect(pos.x, pos.y, pos.w, pos.h);
  ctx.fillStyle = "#444b53";
  ctx.font = `bold ${Math.max(12, Math.round(pos.h * 0.08))}px Arial, Helvetica, sans-serif`;
  ctx.fillText(`Chart: ${title}`, pos.x + 10, pos.y + Math.round(pos.h * 0.18));
  ctx.fillStyle = "#8a9199";
  ctx.font = `${Math.max(10, Math.round(pos.h * 0.05))}px Arial, Helvetica, sans-serif`;
  ctx.fillText("(chart data not embedded in rendered text)", pos.x + 10, pos.y + Math.round(pos.h * 0.32));
}