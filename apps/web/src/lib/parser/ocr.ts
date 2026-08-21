import path from "node:path";
import { createRequire } from "node:module";
import { ConversionError } from "./types";

const require = createRequire(import.meta.url);

const BASE_URL = process.env.OCR_BASE_URL ?? "https://integrate.api.nvidia.com/v1";
const PRIMARY_MODEL =
  process.env.OCR_MODEL ?? "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";
const FALLBACK_MODEL =
  process.env.OCR_FALLBACK_MODEL ?? "nvidia/llama-3.1-nemotron-nano-vl-8b-v1";

const DEFAULT_PROMPT =
  "Extract all text from this image verbatim, preserving paragraph and line structure. " +
  "Do not summarize or add commentary. If the image contains no text, briefly describe what the image shows.";

/** Prompt for captioning an embedded document image (logos/decor get filtered out upstream). */
const CAPTION_PROMPT =
  "Describe the visual content of this image concisely in 1-3 short sentences. " +
  "Cover the main subject, notable objects or people, any charts/diagrams, and any visible text. " +
  "Start directly with the description; do not use lead-ins like 'This image shows'.";

/** Prompt for a structural breakdown of a fully rendered presentation slide. */
const SLIDE_OVERVIEW_PROMPT =
  "You are viewing a rendered presentation slide rendered as one image. " +
  "Provide a concise structural breakdown in 2-4 sentences: the slide title, main bullet points or key messages, " +
  "any tables or charts and what they display, and the overall visual layout. " +
  "Mention figures and images you can see and their approximate position (e.g. top-left, right).";

/** Number of retries for transient vision-model failures (429 / 5xx). */
const OCR_RETRY_MAX = 3;
/** Progressive delays (ms) applied before each retry — exponential backoff. */
const OCR_RETRY_DELAYS_MS = [1000, 2000, 4000];

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
  error?: { message?: string };
  detail?: string;
}

/** HTTP statuses worth retrying: rate limiting + transient server errors. */
function isRetriableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function isOmniModel(model: string): boolean {
  return model.toLowerCase().includes("omni");
}

function extractContent(content: string | Array<{ text?: string }> | undefined): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((p) => p.text ?? "").join("\n");
  }
  return "";
}

export async function callVisionModel(
  model: string,
  imageBuffer: Buffer,
  prompt: string,
  mime: string
): Promise<string> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw new ConversionError("OCR unavailable: NVIDIA_API_KEY is not configured");
  }

  const body: Record<string, unknown> = {
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: { url: `data:${mime};base64,${imageBuffer.toString("base64")}` },
          },
        ],
      },
    ],
    max_tokens: 4096,
    temperature: 0.2,
    top_k: 5,
  };
  // The Nemotron Omni model emits chain-of-thought by default; suppress it so
  // the OCR response contains only the extracted text.
  if (isOmniModel(model)) {
    body.chat_template_kwargs = { enable_thinking: false };
  }

  let lastError: Error | null = null;

  // Retry transient failures (HTTP 429 / 5xx) with exponential backoff
  // (1s, 2s, 4s plus jitter) before giving up so ocrImage can fail over to
  // the fallback model. Network errors and other 4xx fail immediately.
  for (let attempt = 0; attempt <= OCR_RETRY_MAX; attempt++) {
    let response: Response;
    try {
      response = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      });
    } catch (err) {
      throw new ConversionError(
        `OCR request to ${model} failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    const data = (await response.json().catch(() => null)) as ChatCompletionResponse | null;

    if (!response.ok) {
      const detail = data?.error?.message ?? data?.detail ?? `HTTP ${response.status}`;
      if (!isRetriableStatus(response.status)) {
        throw new ConversionError(`OCR model ${model} returned an error: ${detail}`);
      }
      lastError = new ConversionError(`OCR model ${model} returned an error: ${detail}`);
    } else {
      const text = extractContent(data?.choices?.[0]?.message?.content).trim();
      if (!text) {
        throw new ConversionError(`OCR model ${model} returned empty content`);
      }
      return text;
    }

    if (attempt < OCR_RETRY_MAX) {
      // Exponential backoff: 1s, 2s, 4s plus up to 500ms of random jitter.
      const delayMs = (OCR_RETRY_DELAYS_MS[attempt] ?? 1000) + Math.random() * 500;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw (
    lastError ??
    new ConversionError(`OCR model ${model} failed after ${OCR_RETRY_MAX} retries`)
  );
}

/**
 * OCR an image with the configured NVIDIA NIM vision model, falling back to
 * a verified model if the primary is degraded/unavailable.
 */
export async function ocrImage(
  imageBuffer: Buffer,
  prompt: string = DEFAULT_PROMPT,
  mime = "image/png"
): Promise<string> {
  try {
    return await callVisionModel(PRIMARY_MODEL, imageBuffer, prompt, mime);
  } catch (primaryErr) {
    if (FALLBACK_MODEL === PRIMARY_MODEL) {
      throw primaryErr;
    }
    try {
      return await callVisionModel(FALLBACK_MODEL, imageBuffer, prompt, mime);
    } catch (fallbackErr) {
      const primaryMsg =
        primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
      const fallbackMsg =
        fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      throw new ConversionError(`OCR failed on all models. Primary: ${primaryMsg} | Fallback: ${fallbackMsg}`);
    }
  }
}

/** Generate a concise caption for an embedded image (primary → fallback model). */
export async function captionImage(imageBuffer: Buffer, mime = "image/png"): Promise<string> {
  return ocrImage(imageBuffer, CAPTION_PROMPT, mime);
}

/** Describe a fully rendered slide as a single image (structural breakdown). */
export async function describeSlide(imageBuffer: Buffer): Promise<string> {
  return ocrImage(imageBuffer, SLIDE_OVERVIEW_PROMPT, "image/png");
}

interface RenderedPage {
  pageNumber: number;
  buffer: Buffer;
}

/** Render PDF pages to PNG buffers (for OCR). Pure JS: pdfjs-dist + @napi-rs/canvas. */
export async function renderPdfPages(
  pdfBuffer: Buffer,
  maxPages: number,
  scale = 2
): Promise<RenderedPage[]> {
  // Lazy import so text-only parsing never pays the pdfjs load cost.
  // The legacy build includes the DOMMatrix/global polyfills needed in Node.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { createCanvas } = await import("@napi-rs/canvas");

  const pdfjsPath = path.dirname(require.resolve("pdfjs-dist/package.json"));

  class NodeCanvasFactory {
    create(width: number, height: number) {
      const canvas = createCanvas(width, height);
      return { canvas, context: canvas.getContext("2d") as unknown as CanvasRenderingContext2D };
    }
    reset(c: { canvas: unknown; context: unknown }, width: number, height: number) {
      (c.canvas as { width: number; height: number }).width = width;
      (c.canvas as { width: number; height: number }).height = height;
    }
    destroy(c: { canvas: unknown; context: unknown }) {
      const cv = c.canvas as { width: number; height: number };
      cv.width = 0;
      cv.height = 0;
      c.canvas = null;
      c.context = null;
    }
  }

  // canvasFactory is part of the legacy runtime API but absent from the main
  // build's types — cast through the getDocument parameter shape.
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    standardFontDataUrl: path.join(pdfjsPath, "standard_fonts/"),
    cMapUrl: path.join(pdfjsPath, "cmaps/"),
    cMapPacked: true,
    isEvalSupported: false,
    canvasFactory: new NodeCanvasFactory(),
  } as unknown as Parameters<typeof pdfjs.getDocument>[0]).promise;

  try {
    const total = doc.numPages;
    const count = Math.min(total, maxPages);
    const pages: RenderedPage[] = [];
    for (let i = 1; i <= count; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale });
      const factory = new NodeCanvasFactory();
      const { canvas, context } = factory.create(viewport.width, viewport.height);
      try {
        await page.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise;
        pages.push({
          pageNumber: i,
          buffer: Buffer.from((canvas as { toBuffer: (mime: string) => Uint8Array }).toBuffer("image/png")),
        });
      } finally {
        // Free the C++ node-canvas binding immediately (GC won't run fast enough
        // for image-heavy PDFs) and release the page's own resources.
        factory.destroy({ canvas, context });
        page.cleanup();
      }
    }
    return pages;
  } finally {
    await doc.destroy().catch(() => undefined);
  }
}

/** Maximum vision-model requests issued in parallel (avoids rate-limiting). */
const OCR_CONCURRENCY = 4;

/** OCR a whole PDF by rendering pages and feeding each to the vision model. */
export async function ocrPdf(
  pdfBuffer: Buffer,
  options: { prompt?: string; maxOcrPages?: number } = {}
): Promise<string> {
  const maxPages = options.maxOcrPages ?? 20;
  const prompt = options.prompt ?? DEFAULT_PROMPT;
  const pages = await renderPdfPages(pdfBuffer, maxPages);

  if (pages.length === 0) {
    throw new ConversionError("PDF has no pages to OCR");
  }

  // Process pages in concurrent batches while preserving page order in output.
  const sections: string[] = new Array(pages.length).fill("");
  for (let i = 0; i < pages.length; i += OCR_CONCURRENCY) {
    const chunk = pages.slice(i, i + OCR_CONCURRENCY);
    await Promise.all(
      chunk.map(async (page, index) => {
        const globalIndex = i + index;
        try {
          const text = await ocrImage(page.buffer, prompt);
          sections[globalIndex] = `## Page ${page.pageNumber}\n\n${text}`;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          sections[globalIndex] = `## Page ${page.pageNumber}\n\n[OCR error on page ${page.pageNumber}: ${message}]`;
        }
      })
    );
  }
  return sections.join("\n\n");
}