import { google } from "googleapis";
import { getGoogleAuth } from "./auth";

export async function searchFiles(
  doctorId: string,
  query: string,
  maxResults: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const drive = google.drive({ version: "v3", auth });

  const res = await drive.files.list({
    q: query
      ? `name contains '${query.replace(/'/g, "\\'")}'`
      : undefined,
    pageSize: maxResults,
    fields: "files(id, name, mimeType, webViewLink, createdTime, modifiedTime, size, parents)",
  });

  return {
    query,
    files: (res.data.files ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      webViewLink: f.webViewLink,
      createdTime: f.createdTime,
      modifiedTime: f.modifiedTime,
      size: f.size,
      parents: f.parents ?? [],
    })),
  };
}

export async function getFileContent(
  doctorId: string,
  fileId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const drive = google.drive({ version: "v3", auth });
  const meta = await drive.files.get({ fileId, fields: "id, name, mimeType" });
  const mimeType = meta.data.mimeType ?? "text/plain";
  const isText =
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/xml";
  let content = "";
  if (isText) {
    const res = await drive.files.get({ fileId, alt: "media" }, { responseType: "text" });
    content = res.data as unknown as string;
  } else {
    const res = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "arraybuffer" }
    );
    content = Buffer.from(res.data as ArrayBuffer).toString("base64");
  }
  return { fileId, name: meta.data.name, mimeType, content, binary: !isText };
}

export async function getDownloadUrl(
  doctorId: string,
  fileId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.get({
    fileId,
    fields: "id, name, mimeType, webContentLink, webViewLink",
  });
  return res.data;
}

export async function createFile(
  doctorId: string,
  name: string,
  mimeType: string,
  content?: string,
  folderId?: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType,
      parents: folderId ? [folderId] : undefined,
    },
    media: content
      ? { mimeType, body: content }
      : undefined,
  });
  return { created: true, fileId: res.data.id, name: res.data.name, webViewLink: res.data.webViewLink };
}

export async function createFolder(
  doctorId: string,
  name: string,
  parentFolderId?: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentFolderId ? [parentFolderId] : undefined,
    },
  });
  return { created: true, folderId: res.data.id, name: res.data.name };
}

export async function importFile(
  doctorId: string,
  name: string,
  mimeType: string,
  content: string,
  targetType: "doc" | "slides" | "sheets",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const drive = google.drive({ version: "v3", auth });
  const targetMime: Record<string, string> = {
    doc: "application/vnd.google-apps.document",
    slides: "application/vnd.google-apps.presentation",
    sheets: "application/vnd.google-apps.spreadsheet",
  };
  const res = await drive.files.create({
    requestBody: { name, mimeType: targetMime[targetType] },
    media: { mimeType, body: content },
  });
  return { created: true, fileId: res.data.id, name: res.data.name, type: targetType };
}

export async function getShareableLink(
  doctorId: string,
  fileId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const drive = google.drive({ version: "v3", auth });
  await drive.permissions.create({
    fileId,
    requestBody: { role: "reader", type: "anyone" },
  });
  const res = await drive.files.get({
    fileId,
    fields: "id, name, webViewLink, webContentLink",
  });
  return { fileId, name: res.data.name, webViewLink: res.data.webViewLink };
}

export async function listItems(
  doctorId: string,
  folderId?: string,
  maxResults = 100,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const drive = google.drive({ version: "v3", auth });
  const q = folderId
    ? `'${folderId}' in parents and trashed = false`
    : "trashed = false";
  const res = await drive.files.list({
    q,
    pageSize: maxResults,
    orderBy: "folder, name",
    fields: "files(id, name, mimeType, parents, webViewLink, createdTime, modifiedTime, size)",
  });
  return { files: res.data.files ?? [] };
}

export async function copyFile(
  doctorId: string,
  fileId: string,
  newName?: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.copy({
    fileId,
    requestBody: newName ? { name: newName } : undefined,
  });
  return { copied: true, fileId: res.data.id, name: res.data.name };
}

export async function updateFile(
  doctorId: string,
  fileId: string,
  name?: string,
  content?: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.update({
    fileId,
    requestBody: name ? { name } : undefined,
    media: content ? { body: content } : undefined,
  });
  return { updated: true, fileId: res.data.id, name: res.data.name };
}

export async function deleteFile(
  doctorId: string,
  fileId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const drive = google.drive({ version: "v3", auth });
  await drive.files.delete({ fileId });
  return { deleted: true, fileId };
}

export async function getPermissions(
  doctorId: string,
  fileId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.permissions.list({ fileId, fields: "permissions(id, type, role, emailAddress)" });
  return { fileId, permissions: res.data.permissions ?? [] };
}

export async function setPermissions(
  doctorId: string,
  fileId: string,
  role: string,
  type: string,
  emailAddress?: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.permissions.create({
    fileId,
    sendNotificationEmail: false,
    requestBody: { role, type, emailAddress },
  });
  return { created: true, permissionId: res.data.id, role, type };
}

export async function checkPublicAccess(
  doctorId: string,
  fileId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.permissions.list({ fileId, fields: "permissions(id, type, role)" });
  const isPublic = (res.data.permissions ?? []).some(
    (p) => p.type === "anyone" || p.type === "domain"
  );
  return { fileId, isPublic, permissions: res.data.permissions ?? [] };
}
