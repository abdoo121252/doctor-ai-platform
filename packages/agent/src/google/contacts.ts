import { google } from "googleapis";
import { getGoogleAuth } from "./auth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

function personToContact(p: Any) {
  const names = p.names?.[0];
  const emails = p.emailAddresses?.map((e: Any) => e.value) ?? [];
  const phones = p.phoneNumbers?.map((n: Any) => n.value) ?? [];
  return {
    resourceName: p.resourceName,
    name: names?.displayName ?? names?.givenName ?? "",
    givenName: names?.givenName ?? "",
    familyName: names?.familyName ?? "",
    emails,
    phones,
    organizations: p.organizations?.map((o: Any) => o.name) ?? [],
  };
}

export async function listContacts(
  doctorId: string,
  pageSize = 100,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const people = google.people({ version: "v1", auth });
  const res = await people.people.connections.list({
    resourceName: "people/me",
    pageSize,
    personFields: "names,emailAddresses,phoneNumbers,organizations",
  });
  return { contacts: (res.data.connections ?? []).map(personToContact) };
}

export async function getContact(
  doctorId: string,
  resourceName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const people = google.people({ version: "v1", auth });
  const res = await people.people.get({
    resourceName,
    personFields: "names,emailAddresses,phoneNumbers,organizations",
  });
  return personToContact(res.data);
}

export async function searchContacts(
  doctorId: string,
  query: string,
  pageSize = 30,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const people = google.people({ version: "v1", auth });
  const res = await people.people.searchContacts({
    query,
    pageSize,
    readMask: "names,emailAddresses,phoneNumbers,organizations",
  });
  return { contacts: (res.data.results ?? []).map((r) => personToContact(r.person)) };
}

export async function manageContact(
  doctorId: string,
  action: "create" | "update" | "delete",
  contact?: {
    givenName?: string;
    familyName?: string;
    email?: string;
    phone?: string;
    organization?: string;
  },
  resourceName?: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const people = google.people({ version: "v1", auth });
  if (action === "create" && contact) {
    const res = await people.people.createContact({
      requestBody: {
        names: [{ givenName: contact.givenName, familyName: contact.familyName }],
        emailAddresses: contact.email ? [{ value: contact.email }] : undefined,
        phoneNumbers: contact.phone ? [{ value: contact.phone }] : undefined,
        organizations: contact.organization ? [{ name: contact.organization }] : undefined,
      },
    });
    return { created: true, resourceName: res.data.resourceName };
  }
  if (action === "update" && resourceName && contact) {
    const res = await people.people.updateContact({
      resourceName,
      updatePersonFields: "names,emailAddresses,phoneNumbers,organizations",
      requestBody: {
        etag: undefined,
        names: [{ givenName: contact.givenName, familyName: contact.familyName }],
        emailAddresses: contact.email ? [{ value: contact.email }] : undefined,
        phoneNumbers: contact.phone ? [{ value: contact.phone }] : undefined,
        organizations: contact.organization ? [{ name: contact.organization }] : undefined,
      },
    });
    return { updated: true, resourceName: res.data.resourceName };
  }
  if (action === "delete" && resourceName) {
    await people.people.deleteContact({ resourceName });
    return { deleted: true, resourceName };
  }
  throw new Error(`Invalid contact action: ${action}`);
}

export async function manageContactsBatch(
  doctorId: string,
  action: "create" | "update" | "delete",
  contacts: Record<string, unknown>[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const results: unknown[] = [];
  for (const c of contacts) {
    const { action: a, ...contact } = c as { action?: string; [k: string]: unknown };
    results.push(
      await manageContact(doctorId, (a as "create") || action, contact as never, undefined, supabaseClient)
    );
  }
  return { count: results.length, results };
}

export async function listContactGroups(
  doctorId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const people = google.people({ version: "v1", auth });
  const res = await people.contactGroups.list({ pageSize: 100 });
  return { groups: res.data.contactGroups ?? [] };
}

export async function getContactGroup(
  doctorId: string,
  resourceName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const people = google.people({ version: "v1", auth });
  const res = await people.contactGroups.get({ resourceName });
  return res.data;
}

export async function manageContactGroup(
  doctorId: string,
  action: "create" | "update" | "delete",
  name?: string,
  resourceName?: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const people = google.people({ version: "v1", auth });
  if (action === "create" && name) {
    const res = await people.contactGroups.create({
      requestBody: { contactGroup: { name } },
    });
    return { created: true, contactGroup: res.data };
  }
  if (action === "update" && resourceName) {
    const res = await people.contactGroups.update({
      resourceName,
      requestBody: { contactGroup: { name } },
    });
    return { updated: true, contactGroup: res.data };
  }
  if (action === "delete" && resourceName) {
    await people.contactGroups.delete({ resourceName });
    return { deleted: true, resourceName };
  }
  throw new Error(`Invalid contact group action: ${action}`);
}
