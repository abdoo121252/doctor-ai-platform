import { getMicrosoftAccessToken } from "./auth";
import { graphRequest, buildQuery, encodeGraphPath, looksBinary } from "./graph";

interface GraphDriveItem {
  id: string;
  name: string;
  size?: number;
  folder?: { childCount?: number } | null;
  file?: { mimeType?: string } | null;
  webUrl?: string;
  createdDateTime?: string;
  modifiedDateTime?: string;
  parentReference?: { id?: string; path?: string; driveId?: string };
  lastModifiedBy?: { user?: { displayName?: string } };
}

export interface OneDriveUploadInput {
  name: string;
  content: string;
  contentType?: string;
}

function driveItemEndpoint(fileId?: string, driveId?: string, path?: string): string {
  if (driveId) {
    if (path) return `/drives/${encodeURIComponent(driveId)}/root:${encodeGraphPath(path)}`;
    if (fileId) return `/drives/${encodeURIComponent(driveId)}/items/${encodeGraphPath(fileId)}`;
    return `/drives/${encodeURIComponent(driveId)}/root`;
  }
  if (path) return `/me/drive/root:${encodeGraphPath(path)}`;
  if (fileId) return `/me/drive/items/${encodeGraphPath(fileId)}`;
  return "/me/drive/root";
}

function formatItem(d: GraphDriveItem) {
  return {
    id: d.id,
    name: d.name,
    size: d.size ?? null,
    isFolder: !!d.folder,
    childCount: d.folder?.childCount ?? (d.folder ? 0 : null),
    mimeType: d.file?.mimeType ?? null,
    webUrl: d.webUrl ?? null,
    createdTime: d.createdDateTime ?? null,
    modifiedTime: d.modifiedDateTime ?? null,
    folderId: d.parentReference?.id ?? null,
    driveId: d.parentReference?.driveId ?? null,
    parentPath: d.parentReference?.path ?? null,
    lastModifiedBy: d.lastModifiedBy?.user?.displayName ?? null,
  };
}

export async function searchOneDrive(
  doctorId: string,
  query: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);

  const path = `/me/drive/root/search(q='${query.replace(/'/g, "''")}')`;

  const data = await graphRequest<{ value: GraphDriveItem[] }>(token, path);
  const items = (data.value ?? []).map(formatItem);

  return { items };
}

export async function searchOneDriveAll(
  doctorId: string,
  query: string,
  maxResults = 20,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);

  const body = {
    requests: [
      {
        entityTypes: ["driveItem"],
        query: { queryString: query },
        from: 0,
        size: maxResults,
      },
    ],
  };

  const data = await graphRequest<{
    value?: Array<{
      searchTerms?: string[];
      hitsContainers?: Array<{ hits?: Array<{ resource?: GraphDriveItem }> }>;
    }>;
  }>(token, "/search/query", { method: "POST", body: JSON.stringify(body) });

  const hits = data.value?.[0]?.hitsContainers?.[0]?.hits ?? [];
  const items = hits
    .map((h) => (h.resource ? formatItem(h.resource) : null))
    .filter(Boolean) as ReturnType<typeof formatItem>[];

  return { items, searchTerms: data.value?.[0]?.searchTerms ?? [] };
}

export async function listOneDriveItems(
  doctorId: string,
  options: { folderId?: string; driveId?: string; path?: string; maxResults?: number } = {},
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);

  let endpoint: string;
  if (options.driveId && options.path) {
    endpoint = `/drives/${encodeURIComponent(options.driveId)}/root:${encodeGraphPath(options.path)}:/children`;
  } else if (options.driveId) {
    const folder = options.folderId ? `items/${encodeGraphPath(options.folderId)}` : "root";
    endpoint = `/drives/${encodeURIComponent(options.driveId)}/${folder}/children`;
  } else if (options.path) {
    endpoint = `/me/drive/root:${encodeGraphPath(options.path)}:/children`;
  } else {
    endpoint = options.folderId
      ? `/me/drive/items/${encodeGraphPath(options.folderId)}/children`
      : "/me/drive/root/children";
  }

  const path = endpoint + buildQuery({ $top: options.maxResults ?? 50 });
  const data = await graphRequest<{ value: GraphDriveItem[] }>(token, path);
  const items = (data.value ?? []).map(formatItem);

  return { items };
}

export async function getOneDriveItem(
  doctorId: string,
  options: { fileId?: string; driveId?: string; path?: string } = {},
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);

  const endpoint = driveItemEndpoint(options.fileId, options.driveId, options.path);
  const item = await graphRequest<GraphDriveItem>(token, endpoint);

  return formatItem(item);
}

export async function downloadOneDriveFile(
  doctorId: string,
  options: { fileId?: string; driveId?: string; path?: string } = {},
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);

  const base = driveItemEndpoint(options.fileId, options.driveId, options.path);
  const meta = await graphRequest<GraphDriveItem>(token, base);
  const content = await graphRequest<ArrayBuffer>(token, `${base}/content`);

  const isBinary = meta.file?.mimeType
    ? !/^(text\/|application\/json|application\/xml|application\/csv)/.test(meta.file.mimeType)
    : looksBinary(new Uint8Array(content));

  return {
    id: meta.id,
    name: meta.name,
    mimeType: meta.file?.mimeType ?? null,
    webUrl: meta.webUrl ?? null,
    size: meta.size ?? content.byteLength,
    content: isBinary
      ? Buffer.from(content).toString("base64")
      : Buffer.from(content).toString("utf8"),
    base64: isBinary,
  };
}

export async function readOneDriveFile(
  doctorId: string,
  itemId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);

  const meta = await graphRequest<GraphDriveItem>(token, `/me/drive/items/${itemId}`);
  const content = await graphRequest<string>(token, `/me/drive/items/${itemId}/content`);

  return {
    id: itemId,
    name: meta.name,
    mimeType: meta.file?.mimeType ?? null,
    webUrl: meta.webUrl ?? null,
    content,
  };
}

export async function uploadOneDriveFile(
  doctorId: string,
  upload: OneDriveUploadInput,
  options: {
    parentId?: string;
    parentPath?: string;
    driveId?: string;
    conflictBehavior?: "fail" | "rename" | "replace";
  } = {},
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);

  const contentBuffer = Buffer.from(upload.content, "base64");
  if (contentBuffer.byteLength > 250 * 1024) {
    throw new Error(
      "uploadOneDriveFile supports files up to 250 KB via simple upload. Larger files need resumable upload."
    );
  }

  let endpoint: string;
  if (options.driveId) {
    endpoint = options.parentId
      ? `/drives/${encodeURIComponent(options.driveId)}/items/${encodeGraphPath(options.parentId)}:/${encodeURIComponent(upload.name)}:/content`
      : `/drives/${encodeURIComponent(options.driveId)}/root:/${encodeURIComponent(upload.name)}:/content`;
  } else if (options.parentPath) {
    endpoint = `/me/drive/root:${encodeGraphPath(options.parentPath)}/${encodeURIComponent(upload.name)}:/content`;
  } else if (options.parentId) {
    endpoint = `/me/drive/items/${encodeGraphPath(options.parentId)}:/${encodeURIComponent(upload.name)}:/content`;
  } else {
    endpoint = `/me/drive/root:/${encodeURIComponent(upload.name)}:/content`;
  }

  const conflict = options.conflictBehavior ?? "fail";
  const path = endpoint + buildQuery({ "@microsoft.graph.conflictBehavior": conflict });

  const created = await graphRequest<GraphDriveItem>(token, path, {
    method: "PUT",
    headers: {
      "Content-Type": upload.contentType ?? "application/octet-stream",
      "Content-Length": String(contentBuffer.byteLength),
    },
    body: contentBuffer as unknown as BodyInit,
  });

  return {
    uploaded: true,
    fileId: created.id,
    name: created.name,
    webUrl: created.webUrl ?? null,
    size: created.size ?? contentBuffer.byteLength,
  };
}

export async function deleteOneDriveItem(
  doctorId: string,
  options: { fileId?: string; driveId?: string; path?: string } = {},
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);

  const endpoint = driveItemEndpoint(options.fileId, options.driveId, options.path);
  await graphRequest(token, endpoint, { method: "DELETE" });

  return { deleted: true };
}

export async function shareOneDriveItem(
  doctorId: string,
  options: {
    fileId?: string;
    driveId?: string;
    path?: string;
    type?: "view" | "edit" | "embed";
    scope?: "anonymous" | "organization";
    password?: string;
    expirationDateTime?: string;
  } = {},
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);

  const endpoint = driveItemEndpoint(options.fileId, options.driveId, options.path);
  const body: Record<string, unknown> = {
    type: options.type ?? "view",
    scope: options.scope ?? "organization",
  };
  if (options.password) body.password = options.password;
  if (options.expirationDateTime) body.expirationDateTime = options.expirationDateTime;

  const link = await graphRequest<{ link?: { webUrl?: string; type?: string; scope?: string } }>(
    token,
    `${endpoint}/createLink`,
    { method: "POST", body: JSON.stringify(body) }
  );

  return {
    shared: true,
    webUrl: link.link?.webUrl ?? null,
    type: link.link?.type ?? options.type,
    scope: link.link?.scope ?? options.scope,
  };
}

export async function moveOneDriveItem(
  doctorId: string,
  options: { fileId: string; destinationId: string; newName?: string; driveId?: string },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);

  const endpoint = options.driveId
    ? `/drives/${encodeURIComponent(options.driveId)}/items/${encodeGraphPath(options.fileId)}`
    : `/me/drive/items/${encodeGraphPath(options.fileId)}`;

  const body: Record<string, unknown> = {
    parentReference: { id: options.destinationId },
  };
  if (options.newName) body.name = options.newName;

  const updated = await graphRequest<GraphDriveItem>(token, endpoint, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

  return { moved: true, fileId: updated.id, name: updated.name };
}

export async function copyOneDriveItem(
  doctorId: string,
  options: { fileId: string; destinationId: string; newName?: string; driveId?: string },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);

  const endpoint = options.driveId
    ? `/drives/${encodeURIComponent(options.driveId)}/items/${encodeGraphPath(options.fileId)}/copy`
    : `/me/drive/items/${encodeGraphPath(options.fileId)}/copy`;

  const body: Record<string, unknown> = {
    parentReference: { id: options.destinationId },
  };
  if (options.newName) body.name = options.newName;

  // Graph returns 202 Accepted — copy completes asynchronously.
  await graphRequest(token, endpoint, { method: "POST", body: JSON.stringify(body) });

  return { copied: true, destinationId: options.destinationId, newName: options.newName ?? null };
}

export async function createOneDriveFolder(
  doctorId: string,
  name: string,
  options: { parentId?: string; parentPath?: string; driveId?: string } = {},
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const token = await getMicrosoftAccessToken(doctorId, supabaseClient);

  let endpoint: string;
  if (options.driveId) {
    endpoint = options.parentId
      ? `/drives/${encodeURIComponent(options.driveId)}/items/${encodeGraphPath(options.parentId)}/children`
      : `/drives/${encodeURIComponent(options.driveId)}/root/children`;
  } else if (options.parentPath) {
    endpoint = `/me/drive/root:${encodeGraphPath(options.parentPath)}:/children`;
  } else if (options.parentId) {
    endpoint = `/me/drive/items/${encodeGraphPath(options.parentId)}/children`;
  } else {
    endpoint = "/me/drive/root/children";
  }

  const created = await graphRequest<GraphDriveItem>(token, endpoint, {
    method: "POST",
    body: JSON.stringify({ name, folder: {} }),
  });

  return { created: true, folderId: created.id, name: created.name, webUrl: created.webUrl ?? null };
}