import { getMicrosoftAccessToken } from "./auth";
import { graphRequest, buildQuery, encodeGraphPath } from "./graph";

interface GraphMessage {
  id: string;
  subject: string;
  from?: { emailAddress?: { address?: string; name?: string } };
  toRecipients?: Array<{ emailAddress?: { address?: string; name?: string } }>;
  ccRecipients?: Array<{ emailAddress?: { address?: string; name?: string } }>;
  bccRecipients?: Array<{ emailAddress?: { address?: string; name?: string } }>;
  hasAttachments?: boolean;
  receivedDateTime: string;
  bodyPreview?: string;
  body?: { content?: string; contentType?: string };
  categories?: string[];
  importance?: string;
  isRead?: boolean;
  parentFolderId?: string;
  attachments?: Array<{
    id: string;
    name?: string;
    contentType?: string;
    size?: number;
  }>;
  webLink?: string;
}

interface GraphFolder {
  id: string;
  displayName?: string;
  childFolderCount?: number;
  unreadItemCount?: number;
  totalItemCount?: number;
  isHidden?: boolean;
}

interface GraphRule {
  id: string;
  displayName?: string;
  isEnabled?: boolean;
  sequence?: number;
  conditions?: Record<string, unknown>;
  actions?: Record<string, unknown>;
}

interface GraphCategory {
  id: string;
  displayName?: string;
  color?: string;
}

export interface OutlookAttachmentInput {
  name: string;
  contentBytes: string;
  contentType?: string;
}

function mailboxPrefix(mailbox?: string): string {
  if (!mailbox) return "/me";
  return `/users/${encodeURIComponent(mailbox)}`;
}

function normalizeRecipients(
  value: string | string[] | undefined
): Array<{ emailAddress: { address: string } }> {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list
    .flatMap((v) =>
      String(v)
        .split(/[;,]/)
        .map((s) => s.trim())
    )
    .filter(Boolean)
    .map((address) => ({ emailAddress: { address } }));
}

function formatRecipients(
  recipients?: Array<{ emailAddress?: { address?: string; name?: string } }>
): string {
  return (recipients ?? [])
    .map((r) => r.emailAddress?.address ?? r.emailAddress?.name ?? "")
    .filter(Boolean)
    .join(", ");
}

/** Build the inner message payload shared by send/draft/reply. */
function buildMessagePayload(options: {
  subject?: string;
  body?: string;
  contentType?: string;
  to?: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  attachments?: OutlookAttachmentInput[];
  from?: string;
}): Record<string, unknown> {
  const message: Record<string, unknown> = {
    subject: options.subject,
    body: options.body
      ? { contentType: options.contentType ?? "html", content: options.body }
      : undefined,
    toRecipients: normalizeRecipients(options.to),
    ccRecipients: normalizeRecipients(options.cc),
    bccRecipients: normalizeRecipients(options.bcc),
    attachments:
      options.attachments && options.attachments.length > 0
        ? options.attachments.map((a) => ({
            "@odata.type": "#microsoft.graph.fileAttachment",
            name: a.name,
            contentType: a.contentType ?? "application/octet-stream",
            contentBytes: a.contentBytes,
          }))
        : undefined,
  };
  if (options.from) {
    message.from = { emailAddress: { address: options.from } };
  }
  // Drop undefined keys so Graph doesn't reject empty arrays.
  for (const key of Object.keys(message)) {
    if (message[key] === undefined) delete message[key];
  }
  return message;
}

const MESSAGE_SELECT =
  "id,subject,from,toRecipients,ccRecipients,hasAttachments,receivedDateTime,bodyPreview,isRead,importance,parentFolderId,webLink";

export async function listOutlookMessages(
  doctorId: string,
  maxResults: number,
  query?: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any,
  options?: { folderId?: string; folderName?: string; mailbox?: string }
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);
  const prefix = mailboxPrefix(options?.mailbox);

  let folderPath = "/mailFolders/inbox";
  if (options?.folderId) {
    folderPath = `/mailFolders/${encodeGraphPath(options.folderId)}`;
  } else if (options?.folderName) {
    const folderId = await resolveOutlookFolderId(
      doctorId,
      undefined,
      options.folderName,
      supabaseClient
    );
    folderPath = `/mailFolders/${encodeGraphPath(folderId)}`;
  }

  let path =
    `${prefix}${folderPath}/messages${buildQuery({
      $top: maxResults,
      $select: MESSAGE_SELECT,
      $orderby: "receivedDateTime desc",
    })}`;
  if (query) {
    path += `&$search="${query.replace(/"/g, "'")}"`;
  }

  const data = await graphRequest<{ value: GraphMessage[] }>(token, path);
  const messages = (data.value ?? []).map((m) => ({
    id: m.id,
    from: m.from?.emailAddress?.name ?? m.from?.emailAddress?.address ?? "Unknown",
    to: formatRecipients(m.toRecipients),
    cc: formatRecipients(m.ccRecipients),
    subject: m.subject ?? "(no subject)",
    snippet: m.bodyPreview ?? "",
    date: m.receivedDateTime ?? "",
    hasAttachment: m.hasAttachments ?? false,
    isRead: m.isRead ?? false,
    importance: m.importance ?? null,
    folderId: m.parentFolderId ?? null,
  }));

  return { messages };
}

export async function sendOutlookMessage(
  doctorId: string,
  to: string | string[],
  subject: string,
  body: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any,
  options?: {
    cc?: string | string[];
    bcc?: string | string[];
    attachments?: OutlookAttachmentInput[];
    mailbox?: string;
  }
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);
  const prefix = mailboxPrefix(options?.mailbox);

  const payload = {
    message: buildMessagePayload({
      subject,
      body,
      contentType: "html",
      to,
      cc: options?.cc,
      bcc: options?.bcc,
      attachments: options?.attachments,
      from: options?.mailbox,
    }),
    saveToSentItems: true,
  };

  await graphRequest(token, `${prefix}/sendMail`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return { sent: true };
}

export async function getOutlookMessage(
  doctorId: string,
  emailId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any,
  mailbox?: string
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);
  const prefix = mailboxPrefix(mailbox);

  const path =
    `${prefix}/messages/${encodeGraphPath(emailId)}` +
    buildQuery({
      $select:
        "id,subject,from,toRecipients,ccRecipients,bccRecipients,body,bodyPreview,receivedDateTime,sentDateTime,hasAttachments,importance,isRead,categories,webLink,conversationId,parentFolderId",
      $expand: "attachments($select=id,name,contentType,size,isInline)",
    });

  const m = await graphRequest<GraphMessage>(token, path);

  return {
    id: m.id,
    subject: m.subject ?? "(no subject)",
    from: m.from?.emailAddress?.address ?? null,
    fromName: m.from?.emailAddress?.name ?? null,
    to: formatRecipients(m.toRecipients),
    cc: formatRecipients(m.ccRecipients),
    bcc: formatRecipients(m.bccRecipients),
    body: m.body?.content ?? null,
    snippet: m.bodyPreview ?? "",
    receivedAt: m.receivedDateTime ?? null,
    isRead: m.isRead ?? false,
    importance: m.importance ?? null,
    categories: m.categories ?? [],
    folderId: m.parentFolderId ?? null,
    webLink: m.webLink ?? null,
    attachments: (m.attachments ?? []).map((a) => ({
      id: a.id,
      name: a.name ?? "attachment",
      contentType: a.contentType ?? null,
      size: a.size ?? null,
    })),
  };
}

export async function getOutlookAttachment(
  doctorId: string,
  emailId: string,
  attachmentId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any,
  mailbox?: string
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);
  const prefix = mailboxPrefix(mailbox);
  const base = `${prefix}/messages/${encodeGraphPath(emailId)}/attachments/${encodeGraphPath(attachmentId)}`;

  const meta = await graphRequest<{
    id: string;
    name?: string;
    contentType?: string;
    size?: number;
    isInline?: boolean;
  }>(token, base);

  const content = await graphRequest<ArrayBuffer>(
    token,
    `${base}/$value`
  );

  return {
    id: attachmentId,
    name: meta.name ?? "attachment",
    contentType: meta.contentType ?? "application/octet-stream",
    size: meta.size ?? 0,
    isInline: meta.isInline ?? false,
    contentBase64: Buffer.from(content).toString("base64"),
  };
}

export async function replyOutlookMessage(
  doctorId: string,
  emailId: string,
  body: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any,
  options?: {
    replyAll?: boolean;
    to?: string | string[];
    cc?: string | string[];
    attachments?: OutlookAttachmentInput[];
    mailbox?: string;
  }
) {
  const draft = await createOutlookReplyDraft(doctorId, emailId, body, supabaseClient, options);
  await sendOutlookDraft(doctorId, draft.draftId, supabaseClient, options?.mailbox);
  return { sent: true, draftId: draft.draftId };
}

export async function createOutlookReplyDraft(
  doctorId: string,
  emailId: string,
  body: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any,
  options?: {
    replyAll?: boolean;
    to?: string | string[];
    cc?: string | string[];
    attachments?: OutlookAttachmentInput[];
    mailbox?: string;
  }
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);
  const prefix = mailboxPrefix(options?.mailbox);
  const action = options?.replyAll ? "createReplyAll" : "createReply";

  const createBody: Record<string, unknown> = {
    comment: body ?? "",
    message: buildMessagePayload({
      to: options?.to,
      cc: options?.cc,
    }),
  };

  const draft = await graphRequest<{ id: string }>(
    token,
    `${prefix}/messages/${encodeGraphPath(emailId)}/${action}`,
    { method: "POST", body: JSON.stringify(createBody) }
  );

  if (options?.attachments && options.attachments.length > 0) {
    await Promise.all(
      options.attachments.map((a) =>
        graphRequest(token, `${prefix}/messages/${draft.id}/attachments`, {
          method: "POST",
          body: JSON.stringify({
            "@odata.type": "#microsoft.graph.fileAttachment",
            name: a.name,
            contentType: a.contentType ?? "application/octet-stream",
            contentBytes: a.contentBytes,
          }),
        })
      )
    );
  }

  return { draftId: draft.id };
}

export async function createOutlookDraft(
  doctorId: string,
  draft: {
    to?: string | string[];
    cc?: string | string[];
    bcc?: string | string[];
    subject?: string;
    body?: string;
    contentType?: string;
    mailbox?: string;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);
  const prefix = mailboxPrefix(draft.mailbox);

  const payload = {
    ...buildMessagePayload({
      subject: draft.subject,
      body: draft.body,
      contentType: draft.contentType ?? "html",
      to: draft.to,
      cc: draft.cc,
      bcc: draft.bcc,
      from: draft.mailbox,
    }),
    isDraft: true,
  };

  const created = await graphRequest<{ id: string }>(token, `${prefix}/messages`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return { draftId: created.id };
}

export async function updateOutlookDraft(
  doctorId: string,
  draftId: string,
  updates: {
    to?: string | string[];
    cc?: string | string[];
    bcc?: string | string[];
    subject?: string;
    body?: string;
    mailbox?: string;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);
  const prefix = mailboxPrefix(updates.mailbox);

  const payload = {
    ...buildMessagePayload({
      subject: updates.subject,
      body: updates.body,
      to: updates.to,
      cc: updates.cc,
      bcc: updates.bcc,
      from: updates.mailbox,
    }),
  };

  await graphRequest(token, `${prefix}/messages/${encodeGraphPath(draftId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

  return { updated: true, draftId };
}

export async function sendOutlookDraft(
  doctorId: string,
  draftId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any,
  mailbox?: string
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);
  const prefix = mailboxPrefix(mailbox);

  await graphRequest(token, `${prefix}/messages/${encodeGraphPath(draftId)}/send`, {
    method: "POST",
  });

  return { sent: true, draftId };
}

export async function listOutlookDrafts(
  doctorId: string,
  maxResults: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any,
  mailbox?: string
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);
  const prefix = mailboxPrefix(mailbox);

  const path =
    `${prefix}/mailFolders/drafts/messages` +
    buildQuery({
      $top: maxResults,
      $select: MESSAGE_SELECT,
      $orderby: "lastModifiedDateTime desc",
    });

  const data = await graphRequest<{ value: GraphMessage[] }>(token, path);
  const messages = (data.value ?? []).map((m) => ({
    id: m.id,
    to: formatRecipients(m.toRecipients),
    cc: formatRecipients(m.ccRecipients),
    subject: m.subject ?? "(no subject)",
    snippet: m.bodyPreview ?? "",
    date: m.receivedDateTime ?? "",
  }));

  return { messages };
}

export async function searchOutlookMessages(
  doctorId: string,
  filters: {
    query?: string;
    from?: string;
    to?: string;
    subject?: string;
    hasAttachments?: boolean;
    isRead?: boolean;
    importance?: string;
    startDate?: string;
    endDate?: string;
    folderId?: string;
    folderName?: string;
    mailbox?: string;
    maxResults?: number;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);
  const prefix = mailboxPrefix(filters.mailbox);

  const hasStructural =
    filters.from ||
    filters.to ||
    filters.hasAttachments !== undefined ||
    filters.importance ||
    filters.isRead !== undefined;

  let folderPath = "/mailFolders/inbox";
  if (filters.folderId) {
    folderPath = `/mailFolders/${encodeGraphPath(filters.folderId)}`;
  } else if (filters.folderName) {
    const folderId = await resolveOutlookFolderId(
      doctorId,
      undefined,
      filters.folderName,
      supabaseClient
    );
    folderPath = `/mailFolders/${encodeGraphPath(folderId)}`;
  }

  const qs: Record<string, string | number | boolean | undefined> = {
    $top: filters.maxResults ?? 25,
    $select: MESSAGE_SELECT,
    $orderby: "receivedDateTime desc",
  };

  // Structural filters use $filter (Graph doesn't combine $search with $filter).
  if (hasStructural) {
    const conds: string[] = [];
    if (filters.from) conds.push(`from/emailAddress/address eq '${filters.from.replace(/'/g, "''")}'`);
    if (filters.to) conds.push(`toRecipients/any(t:t/emailAddress/address eq '${filters.to.replace(/'/g, "''")}')`);
    if (filters.subject) conds.push(`contains(subject, '${filters.subject.replace(/'/g, "''")}')`);
    if (filters.hasAttachments !== undefined) conds.push(`hasAttachments eq ${filters.hasAttachments}`);
    if (filters.isRead !== undefined) conds.push(`isRead eq ${filters.isRead}`);
    if (filters.importance) conds.push(`importance eq '${filters.importance}'`);
    if (filters.startDate) conds.push(`receivedDateTime ge '${filters.startDate}'`);
    if (filters.endDate) conds.push(`receivedDateTime le '${filters.endDate}'`);
    qs.$filter = conds.join(" and ");
  } else if (filters.startDate || filters.endDate) {
    const conds: string[] = [];
    if (filters.startDate) conds.push(`receivedDateTime ge '${filters.startDate}'`);
    if (filters.endDate) conds.push(`receivedDateTime le '${filters.endDate}'`);
    qs.$filter = conds.join(" and ");
  }

  let path = `${prefix}${folderPath}/messages${buildQuery(qs)}`;
  if (!hasStructural && filters.query) {
    path += `&$search="${filters.query.replace(/"/g, "'")}"`;
  } else if (hasStructural && filters.query) {
    qs.$filter = `${qs.$filter} and contains(body/plainText, '${filters.query.replace(/'/g, "''")}')`;
    path = `${prefix}${folderPath}/messages${buildQuery(qs)}`;
  }

  const data = await graphRequest<{ value: GraphMessage[] }>(token, path);
  const messages = (data.value ?? []).map((m) => ({
    id: m.id,
    from: m.from?.emailAddress?.address ?? null,
    fromName: m.from?.emailAddress?.name ?? null,
    to: formatRecipients(m.toRecipients),
    subject: m.subject ?? "(no subject)",
    snippet: m.bodyPreview ?? "",
    date: m.receivedDateTime ?? "",
    hasAttachment: m.hasAttachments ?? false,
  }));

  return { messages };
}

export async function moveOutlookMessages(
  doctorId: string,
  emailIds: string[],
  destinationFolderId?: string,
  destinationFolderName?: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any,
  mailbox?: string
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);
  const prefix = mailboxPrefix(mailbox);

  let destId = destinationFolderId;
  if (!destId && destinationFolderName) {
    destId = await resolveOutlookFolderId(
      doctorId,
      undefined,
      destinationFolderName,
      supabaseClient
    );
  }
  if (!destId) throw new Error("moveOutlookMessages requires destinationFolderId or destinationFolderName");

  const body = { destinationId: destId };

  if (emailIds.length > 5) {
    const requests = emailIds.map((id, i) => ({
      id: String(i + 1),
      method: "POST",
      url: `${prefix}/messages/${encodeGraphPath(id)}/move`,
      headers: { "Content-Type": "application/json" },
      body,
    }));
    const batch = await graphRequest<{ responses: Array<{ status: number }> }>(
      token,
      `${prefix}/$batch`,
      { method: "POST", body: JSON.stringify({ requests }) }
    );
    const failed = (batch.responses ?? []).filter((r) => r.status >= 300).length;
    return { moved: emailIds.length - failed, failed };
  }

  await Promise.all(
    emailIds.map((id) =>
      graphRequest(token, `${prefix}/messages/${encodeGraphPath(id)}/move`, {
        method: "POST",
        body: JSON.stringify(body),
      })
    )
  );

  return { moved: emailIds.length, failed: 0 };
}

export async function listOutlookFolders(
  doctorId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any,
  mailbox?: string
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);
  const prefix = mailboxPrefix(mailbox);

  const path =
    `${prefix}/mailFolders` +
    buildQuery({
      $top: 100,
      $select: "id,displayName,childFolderCount,unreadItemCount,totalItemCount,isHidden",
    });

  const data = await graphRequest<{ value: GraphFolder[] }>(token, path);
  const folders = (data.value ?? []).map((f) => ({
    id: f.id,
    displayName: f.displayName ?? "(unnamed)",
    childFolderCount: f.childFolderCount ?? 0,
    unreadItemCount: f.unreadItemCount ?? 0,
    totalItemCount: f.totalItemCount ?? 0,
    isHidden: f.isHidden ?? false,
  }));

  return { folders };
}

export async function createOutlookFolder(
  doctorId: string,
  displayName: string,
  parentFolderId?: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any,
  mailbox?: string
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);
  const prefix = mailboxPrefix(mailbox);

  const endpoint = parentFolderId
    ? `${prefix}/mailFolders/${encodeGraphPath(parentFolderId)}/childFolders`
    : `${prefix}/mailFolders`;

  const created = await graphRequest<{ id: string; displayName?: string }>(
    token,
    endpoint,
    { method: "POST", body: JSON.stringify({ displayName }) }
  );

  return { created: true, folderId: created.id, displayName: created.displayName ?? displayName };
}

export async function resolveOutlookFolderId(
  doctorId: string,
  folderId?: string,
  folderName?: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
): Promise<string> {
  if (folderId) return folderId;
  if (!folderName) throw new Error("resolveOutlookFolderId requires folderId or folderName");

  const WELL_KNOWN: Record<string, string> = {
    inbox: "inbox",
    sentitems: "sentitems",
    sent: "sentitems",
    drafts: "drafts",
    deleteditems: "deleteditems",
    deleted: "deleteditems",
    trash: "deleteditems",
    junkemail: "junkemail",
    junk: "junkemail",
    spam: "junkemail",
    archive: "archive",
  };

  const normalized = folderName.toLowerCase().replace(/[\s_-]+/g, "");
  if (WELL_KNOWN[normalized]) return WELL_KNOWN[normalized];

  const { folders } = await listOutlookFolders(doctorId, supabaseClient);
  const match = folders.find(
    (f) => f.displayName.toLowerCase() === folderName.toLowerCase()
  );
  if (match) return match.id;
  throw new Error(`Folder "${folderName}" not found`);
}

export async function listOutlookRules(
  doctorId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any,
  mailbox?: string
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);
  const prefix = mailboxPrefix(mailbox);

  const data = await graphRequest<{ value: GraphRule[] }>(
    token,
    `${prefix}/mailFolders/inbox/messageRules`
  );

  const rules = (data.value ?? []).map((r) => ({
    id: r.id,
    displayName: r.displayName ?? null,
    isEnabled: r.isEnabled ?? false,
    sequence: r.sequence ?? null,
    conditions: r.conditions ?? null,
    actions: r.actions ?? null,
  }));

  return { rules };
}

export async function createOutlookRule(
  doctorId: string,
  rule: {
    displayName?: string;
    sequence?: number;
    isEnabled?: boolean;
    conditions?: Record<string, unknown>;
    actions: Record<string, unknown>;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any,
  mailbox?: string
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);
  const prefix = mailboxPrefix(mailbox);

  const created = await graphRequest<{ id: string; displayName?: string }>(
    token,
    `${prefix}/mailFolders/inbox/messageRules`,
    {
      method: "POST",
      body: JSON.stringify({
        displayName: rule.displayName,
        sequence: rule.sequence ?? 2,
        isEnabled: rule.isEnabled ?? true,
        conditions: rule.conditions ?? {},
        actions: rule.actions,
      }),
    }
  );

  return { created: true, ruleId: created.id, displayName: created.displayName ?? null };
}

export async function getOutlookFocusedInbox(
  doctorId: string,
  maxResults: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any,
  mailbox?: string
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);
  const prefix = mailboxPrefix(mailbox);

  const path =
    `${prefix}/mailFolders/inbox/messages` +
    buildQuery({
      $top: maxResults,
      $select: MESSAGE_SELECT,
      $orderby: "receivedDateTime desc",
      $filter: "inferenceClassification eq 'focused'",
    });

  const data = await graphRequest<{ value: GraphMessage[] }>(token, path);
  const messages = (data.value ?? []).map((m) => ({
    id: m.id,
    from: m.from?.emailAddress?.name ?? m.from?.emailAddress?.address ?? "Unknown",
    subject: m.subject ?? "(no subject)",
    snippet: m.bodyPreview ?? "",
    date: m.receivedDateTime ?? "",
    hasAttachment: m.hasAttachments ?? false,
  }));

  return { messages };
}

export async function listOutlookCategories(
  doctorId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);

  const data = await graphRequest<{ value: GraphCategory[] }>(
    token,
    "/me/outlook/masterCategories"
  );

  const categories = (data.value ?? []).map((c) => ({
    id: c.id,
    displayName: c.displayName ?? null,
    color: c.color ?? null,
  }));

  return { categories };
}

export async function createOutlookCategory(
  doctorId: string,
  displayName: string,
  color = "preset0",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);

  const created = await graphRequest<{ id: string; displayName?: string; color?: string }>(
    token,
    "/me/outlook/masterCategories",
    { method: "POST", body: JSON.stringify({ displayName, color }) }
  );

  return { created: true, categoryId: created.id, displayName: created.displayName ?? displayName, color: created.color ?? color };
}

export async function updateOutlookCategory(
  doctorId: string,
  categoryId: string,
  updates: { displayName?: string; color?: string },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);

  const payload: Record<string, string> = {};
  if (updates.displayName) payload.displayName = updates.displayName;
  if (updates.color) payload.color = updates.color;

  await graphRequest(token, `/me/outlook/masterCategories/${encodeGraphPath(categoryId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

  return { updated: true, categoryId };
}

export async function deleteOutlookCategory(
  doctorId: string,
  categoryId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);

  await graphRequest(token, `/me/outlook/masterCategories/${encodeGraphPath(categoryId)}`, {
    method: "DELETE",
  });

  return { deleted: true, categoryId };
}

export async function applyOutlookCategories(
  doctorId: string,
  emailId: string,
  categories: string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any,
  mailbox?: string
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);
  const prefix = mailboxPrefix(mailbox);

  await graphRequest(token, `${prefix}/messages/${encodeGraphPath(emailId)}`, {
    method: "PATCH",
    body: JSON.stringify({ categories }),
  });

  return { applied: true, emailId, categories };
}

export async function removeOutlookCategories(
  doctorId: string,
  emailId: string,
  categories: string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any,
  mailbox?: string
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);
  const prefix = mailboxPrefix(mailbox);

  const current = await graphRequest<{ categories?: string[] }>(
    token,
    `${prefix}/messages/${encodeGraphPath(emailId)}` +
      buildQuery({ $select: "categories" })
  );

  const toRemove = new Set(categories);
  const remaining = (current.categories ?? []).filter((c) => !toRemove.has(c));

  await graphRequest(token, `${prefix}/messages/${encodeGraphPath(emailId)}`, {
    method: "PATCH",
    body: JSON.stringify({ categories: remaining }),
  });

  return { removed: true, emailId, remainingCategories: remaining };
}