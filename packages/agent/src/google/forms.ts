import { google } from "googleapis";
import { getGoogleAuth } from "./auth";

export async function createForm(
  doctorId: string,
  title: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const forms = google.forms({ version: "v1", auth });
  const res = await forms.forms.create({
    requestBody: { info: { title } },
  });
  return {
    created: true,
    formId: res.data.formId,
    title: res.data.info?.title,
    responderUri: res.data.responderUri,
  };
}

export async function getForm(
  doctorId: string,
  formId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const forms = google.forms({ version: "v1", auth });
  const res = await forms.forms.get({ formId });
  return res.data;
}

export async function batchUpdateForm(
  doctorId: string,
  formId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  requests: any[],
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const forms = google.forms({ version: "v1", auth });
  const res = await forms.forms.batchUpdate({ formId, requestBody: { requests } });
  return { updated: true, formId, replies: res.data.replies ?? [] };
}

export async function listFormResponses(
  doctorId: string,
  formId: string,
  pageSize = 100,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const forms = google.forms({ version: "v1", auth });
  const res = await forms.forms.responses.list({ formId, pageSize });
  return { formId, responses: res.data.responses ?? [] };
}

export async function getFormResponse(
  doctorId: string,
  formId: string,
  responseId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const forms = google.forms({ version: "v1", auth });
  const res = await forms.forms.responses.get({ formId, responseId });
  return res.data;
}

export async function setPublishSettings(
  doctorId: string,
  formId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  settings: Record<string, unknown>,
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const forms = google.forms({ version: "v1", auth });
  const res = await forms.forms.batchUpdate({
    formId,
    requestBody: { requests: [{ updateSettings: { settings, updateMask: "*" } }] },
  });
  return { formId, updated: true, replies: res.data.replies ?? [] };
}
