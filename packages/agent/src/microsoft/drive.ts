import { getMicrosoftAccessToken } from "./auth";
import { graphRequest } from "./graph";

interface GraphDriveItem {
  id: string;
  name: string;
  size?: number;
  folder?: { childCount?: number } | null;
  file?: { mimeType?: string } | null;
  webUrl?: string;
  parentReference?: { path?: string };
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
  const items = (data.value ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    size: d.size ?? null,
    isFolder: !!d.folder,
    mimeType: d.file?.mimeType ?? null,
    webUrl: d.webUrl ?? null,
  }));

  return { items };
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
