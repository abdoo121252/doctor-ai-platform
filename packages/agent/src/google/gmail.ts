import { google } from "googleapis";
import { getGoogleAuth } from "./auth";

export async function listMessages(
  doctorId: string,
  maxResults: number,
  query?: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const gmail = google.gmail({ version: "v1", auth });

  const res = await gmail.users.messages.list({
    userId: "me",
    maxResults,
    q: query,
  });

  const messages = res.data.messages ?? [];
  const details = await Promise.all(
    messages.slice(0, maxResults).map(async (m) => {
      const detail = await gmail.users.messages.get({
        userId: "me",
        id: m.id!,
        format: "metadata",
        metadataHeaders: ["From", "To", "Subject", "Date"],
      });

      const headers = detail.data.payload?.headers ?? [];
      const from = headers.find((h) => h.name === "From")?.value ?? "Unknown";
      const to = headers.find((h) => h.name === "To")?.value ?? "";
      const subject = headers.find((h) => h.name === "Subject")?.value ?? "(no subject)";
      const date = headers.find((h) => h.name === "Date")?.value ?? "";

      const parts = detail.data.payload?.parts ?? [];
      const hasAttachment = parts.some(
        (p) =>
          !!p.filename ||
          (typeof p.mimeType === "string" && !p.mimeType.startsWith("text/") && p.mimeType !== "multipart/alternative")
      );

      return {
        id: m.id!,
        threadId: detail.data.threadId,
        from,
        to,
        subject,
        snippet: detail.data.snippet ?? "",
        date,
        hasAttachment,
      };
    })
  );

  return { messages: details };
}

export async function sendMessage(
  doctorId: string,
  to: string,
  subject: string,
  body: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const gmail = google.gmail({ version: "v1", auth });

  const email = [
    `To: ${to}`,
    "Content-Type: text/html; charset=utf-8",
    "MIME-Version: 1.0",
    `Subject: ${subject}`,
    "",
    body,
  ].join("\r\n");

  const encoded = Buffer.from(email).toString("base64url");

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encoded },
  });

  return {
    sent: true,
    messageId: res.data.id,
    threadId: res.data.threadId,
  };
}

function headerValue(
  headers: { name?: string | null; value?: string | null }[] | undefined,
  name: string
): string {
  return headers?.find((h) => h.name === name)?.value ?? "";
}

function decodeBody(payload: any): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walk = (part: any): string => {
    if (!part) return "";
    if (part.mimeType === "text/plain" && part.body?.data) {
      return Buffer.from(part.body.data, "base64url").toString("utf-8");
    }
    if (part.mimeType === "text/html" && part.body?.data) {
      return Buffer.from(part.body.data, "base64url").toString("utf-8");
    }
    if (part.parts) {
      // prefer text/plain; fall back to html; else recurse
      const plain = part.parts.find((p: any) => p.mimeType === "text/plain");
      if (plain?.body?.data)
        return Buffer.from(plain.body.data, "base64url").toString("utf-8");
      const html = part.parts.find((p: any) => p.mimeType === "text/html");
      if (html?.body?.data)
        return Buffer.from(html.body.data, "base64url").toString("utf-8");
      for (const p of part.parts) {
        const r = walk(p);
        if (r) return r;
      }
    }
    return "";
  };
  return walk(payload);
}

export async function getMessage(
  doctorId: string,
  messageId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const gmail = google.gmail({ version: "v1", auth });
  const res = await gmail.users.messages.get({ userId: "me", id: messageId, format: "full" });
  const headers = res.data.payload?.headers ?? [];
  return {
    id: res.data.id,
    threadId: res.data.threadId,
    from: headerValue(headers, "From"),
    to: headerValue(headers, "To"),
    cc: headerValue(headers, "Cc"),
    subject: headerValue(headers, "Subject"),
    date: headerValue(headers, "Date"),
    snippet: res.data.snippet ?? "",
    labelIds: res.data.labelIds ?? [],
    body: decodeBody(res.data.payload),
  };
}

export async function getMessagesBatch(
  doctorId: string,
  messageIds: string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  return Promise.all(messageIds.map((id) => getMessage(doctorId, id, supabaseClient)));
}

export async function getAttachment(
  doctorId: string,
  messageId: string,
  attachmentId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const gmail = google.gmail({ version: "v1", auth });
  const res = await gmail.users.messages.attachments.get({
    userId: "me",
    messageId,
    id: attachmentId,
  });
  return {
    messageId,
    attachmentId,
    size: res.data.size ?? 0,
    data: res.data.data ?? "",
  };
}

export async function getThread(
  doctorId: string,
  threadId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const gmail = google.gmail({ version: "v1", auth });
  const res = await gmail.users.threads.get({ userId: "me", id: threadId });
  const messages = (res.data.messages ?? []).map((m) => ({
    id: m.id,
    from: headerValue(m.payload?.headers, "From"),
    to: headerValue(m.payload?.headers, "To"),
    subject: headerValue(m.payload?.headers, "Subject"),
    date: headerValue(m.payload?.headers, "Date"),
    snippet: m.snippet ?? "",
    body: decodeBody(m.payload),
  }));
  return { threadId, messages };
}

export async function getThreadsBatch(
  doctorId: string,
  threadIds: string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  return Promise.all(threadIds.map((id) => getThread(doctorId, id, supabaseClient)));
}

export async function modifyLabels(
  doctorId: string,
  messageId: string,
  addLabelIds: string[],
  removeLabelIds: string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const gmail = google.gmail({ version: "v1", auth });
  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: { addLabelIds, removeLabelIds },
  });
  return { messageId, addLabelIds, removeLabelIds, updated: true };
}

export async function batchModifyLabels(
  doctorId: string,
  messageIds: string[],
  addLabelIds: string[],
  removeLabelIds: string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const gmail = google.gmail({ version: "v1", auth });
  await gmail.users.messages.batchModify({
    userId: "me",
    requestBody: { ids: messageIds, addLabelIds, removeLabelIds },
  });
  return { count: messageIds.length, addLabelIds, removeLabelIds, updated: true };
}

export async function listLabels(
  doctorId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const gmail = google.gmail({ version: "v1", auth });
  const res = await gmail.users.labels.list({ userId: "me" });
  return {
    labels: (res.data.labels ?? []).map((l) => ({
      id: l.id,
      name: l.name,
      type: l.type,
      messageListVisibility: l.messageListVisibility,
      labelListVisibility: l.labelListVisibility,
    })),
  };
}

export async function manageLabel(
  doctorId: string,
  action: "create" | "update" | "delete",
  name?: string,
  labelId?: string,
  color?: { textColor?: string; backgroundColor?: string },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const gmail = google.gmail({ version: "v1", auth });
  if (action === "create") {
    const res = await gmail.users.labels.create({
      userId: "me",
      requestBody: { name, labelListVisibility: "labelShow", color },
    });
    return { created: true, label: res.data };
  }
  if (action === "update" && labelId) {
    const res = await gmail.users.labels.patch({
      userId: "me",
      id: labelId,
      requestBody: { name, color },
    });
    return { updated: true, label: res.data };
  }
  if (action === "delete" && labelId) {
    await gmail.users.labels.delete({ userId: "me", id: labelId });
    return { deleted: true, labelId };
  }
  throw new Error(`Invalid label action: ${action}`);
}

export async function draftMessage(
  doctorId: string,
  to: string,
  subject: string,
  body: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const gmail = google.gmail({ version: "v1", auth });
  const email = [
    `To: ${to}`,
    "Content-Type: text/html; charset=utf-8",
    "MIME-Version: 1.0",
    `Subject: ${subject}`,
    "",
    body,
  ].join("\r\n");
  const raw = Buffer.from(email).toString("base64url");
  const res = await gmail.users.drafts.create({
    userId: "me",
    requestBody: { message: { raw } },
  });
  return { drafted: true, draftId: res.data.id, messageId: res.data.message?.id };
}

export async function listFilters(
  doctorId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const gmail = google.gmail({ version: "v1", auth });
  const res = await gmail.users.settings.filters.list({ userId: "me" });
  return { filters: res.data.filter ?? [] };
}

export async function manageFilter(
  doctorId: string,
  action: "create" | "delete",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filter?: any,
  filterId?: string,
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const gmail = google.gmail({ version: "v1", auth });
  if (action === "create" && filter) {
    const res = await gmail.users.settings.filters.create({
      userId: "me",
      requestBody: filter,
    });
    return { created: true, filter: res.data };
  }
  if (action === "delete" && filterId) {
    await gmail.users.settings.filters.delete({ userId: "me", id: filterId });
    return { deleted: true, filterId };
  }
  throw new Error(`Invalid filter action: ${action}`);
}
