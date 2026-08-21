import { google } from "googleapis";
import { getGoogleAuth } from "./auth";

export async function createPresentation(
  doctorId: string,
  title: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const slides = google.slides({ version: "v1", auth });
  const res = await slides.presentations.create({
    requestBody: { title },
  });
  return {
    created: true,
    presentationId: res.data.presentationId,
    title: res.data.title,
    url: `https://docs.google.com/presentation/d/${res.data.presentationId}`,
  };
}

export async function getPresentation(
  doctorId: string,
  presentationId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const slides = google.slides({ version: "v1", auth });
  const res = await slides.presentations.get({ presentationId });
  return {
    presentationId,
    title: res.data.title,
    pageSize: res.data.pageSize,
    slides: (res.data.slides ?? []).map((s) => ({
      objectId: s.objectId,
      pageId: s.objectId,
      elements: s.pageElements?.map((e) => ({ objectId: e.objectId, kind: e.shape?.shapeType ?? e.image?.contentUrl ?? "element" })),
    })),
  };
}

export async function batchUpdatePresentation(
  doctorId: string,
  presentationId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  requests: any[],
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const slides = google.slides({ version: "v1", auth });
  await slides.presentations.batchUpdate({
    presentationId,
    requestBody: { requests },
  });
  return { updated: true, presentationId, applied: requests.length };
}

export async function getPage(
  doctorId: string,
  presentationId: string,
  pageObjectId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const slides = google.slides({ version: "v1", auth });
  const res = await slides.presentations.pages.get({ presentationId, pageObjectId });
  return res.data;
}

export async function getPageThumbnail(
  doctorId: string,
  presentationId: string,
  pageObjectId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const slides = google.slides({ version: "v1", auth });
  const res = await slides.presentations.pages.getThumbnail({
    presentationId,
    pageObjectId,
  } as any);
  const thumbnail = res.data as any;
  return {
    presentationId,
    pageObjectId,
    contentUrl: thumbnail.contentUrl,
    width: thumbnail.width,
    height: thumbnail.height,
  };
}

export async function listPresentationComments(
  doctorId: string,
  presentationId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.comments.list({
    fileId: presentationId,
    fields: "comments(id,content,author,createdTime,resolved,anchor)",
  });
  return { presentationId, comments: res.data.comments ?? [] };
}
