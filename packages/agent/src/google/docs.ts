import { google } from "googleapis";
import { Readable } from "stream";
import { getGoogleAuth } from "./auth";
import pdfParse from "pdf-parse";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

/** MIME types `searchDocs` returns: native Google Docs, Word (.docx) and PDFs. */
const DOC_MIME_TYPES = [
  "application/vnd.google-apps.document",
  "application/vnd.openxmlformats-officially.wordprocessingml.document",
  "application/pdf",
] as const;

function paragraphsToMarkdown(body: Any): string {
  const parts: string[] = [];
  const content = body?.content ?? [];
  for (const el of content) {
    if (el.paragraph) {
      const text = (el.paragraph.elements ?? [])
        .map((e: Any) => e.textRun?.content ?? "")
        .join("");
      const style = el.paragraph.paragraphStyle?.namedStyleType ?? "";
      if (style.includes("HEADING")) {
        const level = parseInt(style.replace(/\D/g, "") || "1", 10);
        parts.push(`${"#".repeat(Math.min(level, 6))} ${text.trim()}`);
      } else if (el.paragraph.bullet) {
        parts.push(`- ${text.trim()}`);
      } else {
        parts.push(text);
      }
    } else if (el.table) {
      const rows = el.table.tableRows ?? [];
      for (const row of rows) {
        const cells = (row.tableCells ?? []).map((c: Any) =>
          (c.content ?? [])
            .map((p: Any) =>
              (p.paragraph?.elements ?? [])
                .map((e: Any) => e.textRun?.content ?? "")
                .join("")
            )
            .join("")
            .trim()
        );
        parts.push("| " + cells.join(" | ") + " |");
      }
    }
  }
  return parts.join("\n");
}

export async function searchDocs(
  doctorId: string,
  query: string,
  maxResults = 20,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const drive = google.drive({ version: "v3", auth });
  const mimeFilter = `(mimeType='${DOC_MIME_TYPES.join("' or mimeType='")}')`;
  const q = query
    ? `${mimeFilter} and name contains '${query.replace(/'/g, "\\'")}' and trashed = false`
    : `${mimeFilter} and trashed = false`;
  const res = await drive.files.list({
    q,
    pageSize: maxResults,
    fields: "files(id, name, createdTime, modifiedTime, webViewLink)",
  });
  return { docs: res.data.files ?? [] };
}

export async function listDocsInFolder(
  doctorId: string,
  folderId: string,
  maxResults = 100,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.list({
    q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.document' and trashed = false`,
    pageSize: maxResults,
    fields: "files(id, name, createdTime, modifiedTime, webViewLink)",
  });
  return { docs: res.data.files ?? [] };
}

export async function getDocContent(
  doctorId: string,
  documentId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const docs = google.docs({ version: "v1", auth });
  const res = await docs.documents.get({ documentId });
  return {
    documentId,
    title: res.data.title,
    body: res.data.body,
  };
}

export async function getDocAsMarkdown(
  doctorId: string,
  documentId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const docs = google.docs({ version: "v1", auth });
  const res = await docs.documents.get({ documentId });
  return {
    documentId,
    title: res.data.title,
    markdown: paragraphsToMarkdown(res.data.body),
  };
}

/**
 * Fetch the document's current end index (the end of the last body element).
 * New content should be inserted here so it is appended at the bottom of the
 * document instead of at the top (index 1).
 */
async function getDocEndIndex(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  docs: any,
  documentId: string
): Promise<number> {
  const res = await docs.documents.get({ documentId });
  const content = res.data?.body?.content ?? [];
  const last = content[content.length - 1];
  return typeof last?.endIndex === "number" ? last.endIndex : 1;
}

export async function createDoc(
  doctorId: string,
  title: string,
  content?: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const docs = google.docs({ version: "v1", auth });
  const res = await docs.documents.create({
    requestBody: { title },
  });
  const documentId = res.data.documentId ?? "";
  if (content) {
    const endIndex = await getDocEndIndex(docs, documentId);
    await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [
          {
            insertText: {
              location: { index: endIndex },
              text: content.endsWith("\n") ? content : `${content}\n`,
            },
          },
        ],
      },
    });
  }
  return {
    created: true,
    documentId,
    title,
    url: `https://docs.google.com/document/d/${documentId}`,
  };
}

export async function batchUpdateDoc(
  doctorId: string,
  documentId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  requests: any[],
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const docs = google.docs({ version: "v1", auth });
  await docs.documents.batchUpdate({ documentId, requestBody: { requests } });
  return { updated: true, documentId, applied: requests.length };
}

export async function exportDocToPdf(
  doctorId: string,
  documentId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.export(
    { fileId: documentId, mimeType: "application/pdf" },
    { responseType: "arraybuffer" }
  );
  const base64 = Buffer.from(res.data as ArrayBuffer).toString("base64");
  return { documentId, mimeType: "application/pdf", size: base64.length, data: base64 };
}

export async function listDocComments(
  doctorId: string,
  documentId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.comments.list({
    fileId: documentId,
    fields: "comments(id,content,author,createdTime,resolved,anchor)",
  });
  return { documentId, comments: res.data.comments ?? [] };
}

export async function insertDocImage(
  doctorId: string,
  documentId: string,
  imageUrl: string,
  width?: number,
  height?: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const docs = google.docs({ version: "v1", auth });
  const endIndex = await getDocEndIndex(docs, documentId);
  const requests: any[] = [{
    insertInlineImage: {
      uri: imageUrl,
      location: { index: endIndex },
    },
  }];
  if (width || height) {
    requests.push({
      updateInlineImageProperties: {
        objectId: "",
        fields: "*",
        inlineImageProperties: {
          embeddedObject: {
            size: {
              width: width ? { magnitude: width, unit: "PT" } : undefined,
              height: height ? { magnitude: height, unit: "PT" } : undefined,
            },
          },
        },
      },
    });
  }
  await docs.documents.batchUpdate({ documentId, requestBody: { requests } });
  return { inserted: true, documentId, imageUrl };
}

export async function findAndReplaceDoc(
  doctorId: string,
  documentId: string,
  findText: string,
  replaceText: string,
  matchCase = false,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const docs = google.docs({ version: "v1", auth });
  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [{
        replaceAllText: {
          containsText: { text: findText, matchCase },
          replaceText,
        },
      }],
    },
  });
  return { replaced: true, documentId, findText, replaceText };
}

export async function updateParagraphStyle(
  doctorId: string,
  documentId: string,
  range: { startIndex: number; endIndex: number } | undefined,
  style: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const docs = google.docs({ version: "v1", auth });
  const request: any = { updateParagraphStyle: { style, fields: "*" } };
  if (range) {
    request.updateParagraphStyle.range = range;
  }
  await docs.documents.batchUpdate({ documentId, requestBody: { requests: [request] } });
  return { updated: true, documentId };
}

export async function updateDocHeadersFooters(
  doctorId: string,
  documentId: string,
  header?: any,
  footer?: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const docs = google.docs({ version: "v1", auth });
  const requests: any[] = [];
  if (header) {
    requests.push({
      updateSectionStyle: {
        sectionStyle: { headerIds: [header] },
        fields: "headerIds",
      },
    });
  }
  if (footer) {
    requests.push({
      updateSectionStyle: {
        sectionStyle: { footerIds: [footer] },
        fields: "footerIds",
      },
    });
  }
  if (requests.length > 0) {
    await docs.documents.batchUpdate({ documentId, requestBody: { requests } });
  }
  return { updated: true, documentId };
}

export async function inspectDocStructure(
  doctorId: string,
  documentId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const docs = google.docs({ version: "v1", auth });
  const res = await docs.documents.get({ documentId });
  const doc = res.data as any;
  const structure = {
    documentId,
    title: doc.title,
    revisionId: doc.revisionId,
    body: doc.body,
    headers: doc.headers,
    footers: doc.footers,
    footnotes: doc.footnotes,
    inlineObjects: doc.inlineObjects,
    lists: doc.lists,
    namedStyles: doc.namedStyles,
    suggestedChanges: doc.suggestedChanges,
  };
  return structure;
}

export async function createTableWithData(
  doctorId: string,
  documentId: string,
  endIndex: number,
  data: string[][],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const docs = google.docs({ version: "v1", auth });
  const rows = data.length;
  const columns = data[0]?.length ?? 0;
  const requests: any[] = [{
    insertTable: {
      rows,
      columns,
      location: { index: endIndex },
    },
  }];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const cellText = data[r]?.[c] ?? "";
      requests.push({
        insertText: {
          location: {
            index: endIndex + 1,
            tableCellLocation: { rowIndex: r, columnIndex: c },
          },
          text: cellText,
        },
      });
    }
  }
  await docs.documents.batchUpdate({ documentId, requestBody: { requests } });
  return { created: true, documentId, rows, columns };
}

/**
 * Convert an uploaded file in Drive (e.g. a `.docx`) into a native Google Doc
 * so the Docs editing/reading tools can operate on it. `drive.files.copy`
 * does NOT convert file formats ("The requested conversion is not supported"),
 * so this downloads the source bytes and re-uploads them with the target
 * Google Docs mimeType — the documented Drive conversion path.
 */
export async function convertFileToGoogleDoc(
  doctorId: string,
  fileId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const drive = google.drive({ version: "v3", auth });

  const meta = await drive.files.get({ fileId, fields: "id, name, mimeType" });
  const sourceName = meta.data.name ?? "Converted document";

  const buf = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );
  const buffer = Buffer.from(buf.data as ArrayBuffer);

  // NOTE: media mimeType MUST NOT be the exact OOXML docx type here — Drive
  // returns HTTP 400 "Bad Request" for upload-and-convert in that case.
  // `application/octet-stream` lets Drive sniff the content and convert it.
  const res = await drive.files.create({
    requestBody: {
      name: sourceName.replace(/\.(docx|doc)$/i, "") || sourceName,
      mimeType: "application/vnd.google-apps.document",
    },
    media: {
      mimeType: "application/octet-stream",
      body: Readable.from(buffer),
    },
  });

  return {
    success: true,
    originalFileId: fileId,
    newDocumentId: res.data.id ?? "",
    title: res.data.name ?? "",
  };
}

/**
 * Extract raw text from a text-based PDF. Accepts either a Google Drive fileId
 * (fetched with the doctor's Drive auth) or a public HTTP(S) URL to the PDF.
 */
export async function readPdfContent(
  doctorId: string,
  fileIdOrUrl: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  let buffer: Buffer;
  if (/^https?:\/\//i.test(fileIdOrUrl)) {
    const resp = await fetch(fileIdOrUrl);
    if (!resp.ok) {
      throw new Error(`Failed to download PDF: HTTP ${resp.status}`);
    }
    buffer = Buffer.from(await resp.arrayBuffer());
  } else {
    const auth = await getGoogleAuth(doctorId, supabaseClient);
    const drive = google.drive({ version: "v3", auth });
    const res = await drive.files.get(
      { fileId: fileIdOrUrl, alt: "media" },
      { responseType: "arraybuffer" }
    );
    buffer = Buffer.from(res.data as ArrayBuffer);
  }
  const parsed = await pdfParse(buffer);
  return { success: true, text: parsed.text };
}
