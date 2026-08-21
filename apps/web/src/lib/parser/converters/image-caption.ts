import { captionImage } from "../ocr";

/** Images smaller than this (bytes) are decorative (logos, icons) — skipped. */
export const IMAGE_MIN_BYTES = 50 * 1024;
/** Images with either dimension below this (px) are decorative — skipped. */
export const IMAGE_MIN_DIMENSION = 150;
/** Slides with more than this many embedded images use whole-slide vision instead. */
export const DENSE_SLIDE_IMAGE_THRESHOLD = 3;

/**
 * Decode an image buffer's pixel dimensions using the canvas binding.
 * Returns null when the buffer is not a decodable raster image (EMF/WMF/SVG or corrupt).
 */
export async function getImageDimensions(
  buffer: Buffer
): Promise<{ width: number; height: number } | null> {
  try {
    const { loadImage } = await import("@napi-rs/canvas");
    const image = await loadImage(buffer);
    const width = image.width;
    const height = image.height;
    if (width > 0 && height > 0) return { width, height };
    return null;
  } catch {
    return null;
  }
}

/**
 * Apply the smart image pipeline to a single embedded image buffer:
 *  - drop decorative images (< 50KB or < 150x150px) entirely,
 *  - caption meaningful images via the vision model,
 *  - never throw: on any captioning failure fall back to the `[Image]` marker.
 * Returns "" when the image should be omitted from the output.
 */
export async function captionOrSkipImage(
  buffer: Buffer,
  mime = "image/png"
): Promise<string> {
  if (buffer.length < IMAGE_MIN_BYTES) return "";
  const dimensions = await getImageDimensions(buffer);
  if (
    dimensions &&
    (dimensions.width < IMAGE_MIN_DIMENSION || dimensions.height < IMAGE_MIN_DIMENSION)
  ) {
    return "";
  }
  try {
    const description = await captionImage(buffer, mime);
    return `[Image Description: ${description}]`;
  } catch {
    return "[Image]";
  }
}

/**
 * Replace every inline data-URI image in a markdown string with its caption
 * (or drop it when decorative). One match is processed at a time so the
 * decoded buffer is released right after its vision call — no accumulation.
 */
export async function replaceInlineDataUriImages(markdown: string): Promise<string> {
  // Matches markdown image links whose src is a base64 data URI:
  // ![alt](data:image/<type>;base64,<payload>)
  const pattern = /!\[[^\]]*\]\(data:image\/([a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)\)/g;
  let out = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(markdown)) !== null) {
    out += markdown.slice(lastIndex, match.index);
    const subtype = (match[1] ?? "png").toLowerCase();
    const mime = subtype.startsWith("svg") ? "image/svg+xml" : `image/${subtype}`;
    const buffer = Buffer.from(match[2] ?? "", "base64");
    out += await captionOrSkipImage(buffer, mime);
    lastIndex = match.index + match[0].length;
  }
  out += markdown.slice(lastIndex);
  return out;
}