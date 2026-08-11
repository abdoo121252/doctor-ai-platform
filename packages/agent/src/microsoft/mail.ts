import { getMicrosoftAccessToken } from "./auth";
import { graphRequest } from "./graph";

interface GraphMessage {
  id: string;
  subject: string;
  from?: { emailAddress?: { address?: string; name?: string } };
  receivedDateTime: string;
  bodyPreview?: string;
}

export async function listOutlookMessages(
  doctorId: string,
  maxResults: number,
  query?: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);

  let path = `/me/mailFolders/inbox/messages?$top=${maxResults}&$select=id,subject,from,receivedDateTime,bodyPreview&$orderby=receivedDateTime desc`;
  if (query) {
    path += `&$search="${encodeURIComponent(query).replace(/%22/g, '"')}"`;
  }

  const data = await graphRequest<{ value: GraphMessage[] }>(token, path);
  const messages = (data.value ?? []).map((m) => ({
    id: m.id,
    from: m.from?.emailAddress?.name ?? m.from?.emailAddress?.address ?? "Unknown",
    subject: m.subject ?? "(no subject)",
    snippet: m.bodyPreview ?? "",
    date: m.receivedDateTime ?? "",
  }));

  return { messages };
}

export async function sendOutlookMessage(
  doctorId: string,
  to: string,
  subject: string,
  body: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);

  const message = {
    message: {
      subject,
      body: { contentType: "html", content: body },
      toRecipients: [{ emailAddress: { address: to } }],
    },
    saveToSentItems: true,
  };

  await graphRequest(token, "/me/sendMail", {
    method: "POST",
    body: JSON.stringify(message),
  });

  return { sent: true };
}
