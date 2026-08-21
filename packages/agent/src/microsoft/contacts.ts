import { getMicrosoftAccessToken } from "./auth";
import { graphRequest, buildQuery, encodeGraphPath } from "./graph";

interface GraphContact {
  id: string;
  displayName?: string;
  givenName?: string;
  surname?: string;
  emailAddresses?: Array<{ name?: string; address?: string }>;
  businessPhones?: string[];
  homePhones?: string[];
  mobilePhone?: string;
  companyName?: string;
  jobTitle?: string;
  department?: string;
  officeLocation?: string;
  businessAddress?: Record<string, unknown>;
  homeAddress?: Record<string, unknown>;
  birthday?: string;
  personalNotes?: string;
  categories?: string[];
  parentFolderId?: string;
}

interface GraphContactFolder {
  id: string;
  displayName?: string;
  parentFolderId?: string;
}

function formatContact(c: GraphContact) {
  return {
    id: c.id,
    displayName: c.displayName ?? `${c.givenName ?? ""} ${c.surname ?? ""}`.trim() ?? null,
    givenName: c.givenName ?? null,
    surname: c.surname ?? null,
    emails: (c.emailAddresses ?? []).map((e) => ({
      name: e.name ?? null,
      address: e.address ?? null,
    })),
    businessPhones: c.businessPhones ?? [],
    homePhones: c.homePhones ?? [],
    mobilePhone: c.mobilePhone ?? null,
    companyName: c.companyName ?? null,
    jobTitle: c.jobTitle ?? null,
    department: c.department ?? null,
    officeLocation: c.officeLocation ?? null,
    businessAddress: c.businessAddress ?? null,
    homeAddress: c.homeAddress ?? null,
    birthday: c.birthday ?? null,
    personalNotes: c.personalNotes ?? null,
    categories: c.categories ?? [],
    parentFolderId: c.parentFolderId ?? null,
  };
}

function buildContactPayload(params: Record<string, unknown>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const fields: Array<[string, unknown]> = Object.entries(params);

  for (const [key, value] of fields) {
    if (value === undefined || value === null) continue;
    if (key === "emailAddresses") {
      data.emailAddresses = (Array.isArray(value) ? value : [value]).map((email) => {
        if (typeof email === "string") return { address: email };
        return email;
      });
    } else if (key === "businessPhones" || key === "homePhones" || key === "categories") {
      data[key] = Array.isArray(value) ? value : [value];
    } else {
      data[key] = value;
    }
  }

  const givenName = data.givenName as string | undefined;
  const surname = data.surname as string | undefined;
  if (!data.displayName && (givenName || surname)) {
    data.displayName = [givenName, surname].filter(Boolean).join(" ");
  }

  return data;
}

export async function listOutlookContacts(
  doctorId: string,
  options: { maxResults?: number; folderId?: string } = {},
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);

  const endpoint = options.folderId
    ? `/me/contactFolders/${encodeGraphPath(options.folderId)}/contacts`
    : "/me/contacts";

  const path = endpoint + buildQuery({ $top: options.maxResults ?? 50, $orderby: "displayName" });
  const data = await graphRequest<{ value: GraphContact[] }>(token, path);
  const contacts = (data.value ?? []).map(formatContact);

  return { contacts };
}

export async function searchOutlookContacts(
  doctorId: string,
  query: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);

  // Try $search first; fall back to client-side filtering if the query
  // contains characters Graph's $search rejects.
  try {
    const path =
      "/me/contacts" +
      buildQuery({ $search: `"${query.replace(/"/g, "'")}"`, $top: 25 });
    const data = await graphRequest<{ value: GraphContact[] }>(token, path);
    if ((data.value ?? []).length > 0) {
      return { contacts: data.value!.map(formatContact) };
    }
  } catch {
    // fall through to client-side filtering
  }

  const all = await graphRequest<{ value: GraphContact[] }>(
    token,
    "/me/contacts" + buildQuery({ $top: 200 })
  );

  const q = query.toLowerCase();
  const contacts = (all.value ?? [])
    .filter((c) =>
      [
        c.displayName,
        c.givenName,
        c.surname,
        c.companyName,
        c.jobTitle,
        ...(c.emailAddresses ?? []).map((e) => e.address),
      ]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q))
    )
    .map(formatContact);

  return { contacts };
}

export async function getOutlookContact(
  doctorId: string,
  contactId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);

  const contact = await graphRequest<GraphContact>(
    token,
    `/me/contacts/${encodeGraphPath(contactId)}`
  );

  return formatContact(contact);
}

export async function createOutlookContact(
  doctorId: string,
  contactData: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any,
  folderId?: string
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);

  const payload = buildContactPayload(contactData);
  if (!payload.givenName && !payload.surname && !payload.displayName) {
    throw new Error("createOutlookContact requires at least one of givenName, surname, or displayName");
  }

  const endpoint = folderId
    ? `/me/contactFolders/${encodeGraphPath(folderId)}/contacts`
    : "/me/contacts";

  const created = await graphRequest<GraphContact>(token, endpoint, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return { created: true, contactId: created.id, displayName: created.displayName ?? null };
}

export async function updateOutlookContact(
  doctorId: string,
  contactId: string,
  updateData: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);

  const payload = buildContactPayload(updateData);

  const updated = await graphRequest<GraphContact>(
    token,
    `/me/contacts/${encodeGraphPath(contactId)}`,
    { method: "PATCH", body: JSON.stringify(payload) }
  );

  return { updated: true, contactId: updated.id, displayName: updated.displayName ?? null };
}

export async function deleteOutlookContact(
  doctorId: string,
  contactId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);

  await graphRequest(token, `/me/contacts/${encodeGraphPath(contactId)}`, {
    method: "DELETE",
  });

  return { deleted: true, contactId };
}

export async function listOutlookContactFolders(
  doctorId: string,
  maxResults: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);

  const path =
    "/me/contactFolders" +
    buildQuery({ $top: maxResults, $select: "id,displayName,parentFolderId" });

  const data = await graphRequest<{ value: GraphContactFolder[] }>(token, path);
  const folders = (data.value ?? []).map((f) => ({
    id: f.id,
    displayName: f.displayName ?? "(unnamed)",
    parentFolderId: f.parentFolderId ?? null,
  }));

  return { folders };
}

export async function createOutlookContactFolder(
  doctorId: string,
  displayName: string,
  parentFolderId?: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);

  const endpoint = parentFolderId
    ? `/me/contactFolders/${encodeGraphPath(parentFolderId)}/childFolders`
    : "/me/contactFolders";

  const created = await graphRequest<{ id: string; displayName?: string }>(
    token,
    endpoint,
    { method: "POST", body: JSON.stringify({ displayName }) }
  );

  return {
    created: true,
    folderId: created.id,
    displayName: created.displayName ?? displayName,
  };
}