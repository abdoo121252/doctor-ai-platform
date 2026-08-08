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
    fields: "files(id, name, mimeType, webViewLink, createdTime, modifiedTime, size)",
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
    })),
  };
}
