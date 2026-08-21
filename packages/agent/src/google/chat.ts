import { google } from "googleapis";
import { getGoogleAuth } from "./auth";

export async function listSpaces(
  doctorId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const chat = google.chat({ version: "v1", auth });
  const res = await chat.spaces.list({});
  return { spaces: res.data.spaces ?? [] };
}

export async function getMessages(
  doctorId: string,
  spaceName: string,
  pageSize = 50,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const chat = google.chat({ version: "v1", auth });
  const res = await chat.spaces.messages.list({ parent: spaceName, pageSize });
  return { space: spaceName, messages: res.data.messages ?? [] };
}

export async function sendMessage(
  doctorId: string,
  spaceName: string,
  text: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const chat = google.chat({ version: "v1", auth });
  const res = await chat.spaces.messages.create({
    parent: spaceName,
    requestBody: { text },
  });
  return { sent: true, name: res.data.name, text: res.data.text };
}

export async function searchMessages(
  doctorId: string,
  spaceName: string,
  query: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const chat = google.chat({ version: "v1", auth });
  const res = await chat.spaces.messages.list({ parent: spaceName });
  const messages = (res.data.messages ?? []).filter((m) =>
    (m.text ?? "").toLowerCase().includes(query.toLowerCase())
  );
  return { space: spaceName, query, messages };
}

export async function createReaction(
  doctorId: string,
  messageName: string,
  emoji: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const chat = google.chat({ version: "v1", auth });
  const res = await chat.spaces.messages.reactions.create({
    parent: messageName,
    requestBody: { emoji: { unicode: emoji } },
  });
  return { created: true, name: res.data.name, emoji: res.data.emoji?.unicode };
}
