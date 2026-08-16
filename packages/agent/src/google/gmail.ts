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
