import { google } from "googleapis";
import { getGoogleAuth } from "./auth";

export async function getSheetValues(
  doctorId: string,
  spreadsheetId: string,
  range: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const sheets = google.sheets({ version: "v4", auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  return {
    spreadsheetId,
    range,
    values: res.data.values ?? [],
  };
}

export async function createSpreadsheet(
  doctorId: string,
  title: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.create({
    requestBody: { properties: { title } },
  });
  return {
    created: true,
    spreadsheetId: res.data.spreadsheetId,
    title: res.data.properties?.title,
    url: res.data.spreadsheetUrl,
  };
}

export async function listSpreadsheets(
  doctorId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed = false",
    pageSize: 100,
    fields: "files(id, name, createdTime, modifiedTime, webViewLink)",
  });
  return { spreadsheets: res.data.files ?? [] };
}

export async function getSpreadsheetInfo(
  doctorId: string,
  spreadsheetId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.get({ spreadsheetId });
  return {
    spreadsheetId,
    title: res.data.properties?.title,
    sheets: (res.data.sheets ?? []).map((s) => ({
      sheetId: s.properties?.sheetId,
      title: s.properties?.title,
      index: s.properties?.index,
      grid: s.properties?.gridProperties,
    })),
  };
}

export async function modifySheetValues(
  doctorId: string,
  spreadsheetId: string,
  range: string,
  values: unknown[][],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
  return { updated: true, spreadsheetId, range, updatedCells: res.data.updatedCells };
}

export async function appendSheetValues(
  doctorId: string,
  spreadsheetId: string,
  range: string,
  values: unknown[][],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
  return { appended: true, spreadsheetId, range, updates: res.data.updates };
}

export async function createSheet(
  doctorId: string,
  spreadsheetId: string,
  title: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title } } }],
    },
  });
  const reply = res.data.replies?.[0]?.addSheet;
  return { created: true, sheetId: reply?.properties?.sheetId, title: reply?.properties?.title };
}

export async function batchUpdateSheet(
  doctorId: string,
  spreadsheetId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  requests: any[],
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  });
  return { updated: true, replies: res.data.replies ?? [] };
}

export async function listSheetTables(
  doctorId: string,
  spreadsheetId: string,
  sheetId: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    includeGridData: true,
    fields: "sheets(properties(sheetId,title),data)",
  });
  const sheet = (res.data.sheets ?? []).find((s) => s.properties?.sheetId === sheetId);
  // tables might not be in the TypeScript types but exist in the actual response
  const tables = (sheet as any)?.tables ?? [];
  return { spreadsheetId, sheetId, tables };
}

export async function moveSheetRows(
  doctorId: string,
  spreadsheetId: string,
  sheetId: number,
  startIndex: number,
  endIndex: number,
  destinationIndex: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const sheets = google.sheets({ version: "v4", auth });
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        moveDimension: {
          source: { sheetId, dimension: "ROWS", startIndex, endIndex },
          destinationIndex,
        },
      }],
    },
  });
  return { moved: true, spreadsheetId, sheetId, startIndex, endIndex, destinationIndex };
}

export async function resizeSheetDimensions(
  doctorId: string,
  spreadsheetId: string,
  dimension: "ROWS" | "COLUMNS",
  startIndex: number,
  endIndex: number,
  pixelSize: number,
  sheetId = 0,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const sheets = google.sheets({ version: "v4", auth });
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        updateDimensionProperties: {
          range: { sheetId, dimension, startIndex, endIndex },
          properties: { pixelSize },
          fields: "pixelSize",
        },
      }],
    },
  });
  return { resized: true, spreadsheetId, sheetId, dimension, startIndex, endIndex, pixelSize };
}

export async function manageConditionalFormatting(
  doctorId: string,
  spreadsheetId: string,
  sheetId: number,
  rules: any[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const sheets = google.sheets({ version: "v4", auth });
  const requests = rules.map((rule, index) => ({
    addConditionalFormatRule: {
      rule: { ranges: [rule.range], ...rule },
      index,
    },
  }));
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  });
  return { added: true, spreadsheetId, sheetId, count: rules.length };
}

export async function listSheetComments(
  doctorId: string,
  spreadsheetId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
) {
  const auth = await getGoogleAuth(doctorId, supabaseClient);
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.comments.list({
    fileId: spreadsheetId,
    fields: "comments(id,content,author,createdTime,resolved,anchor)",
  });
  return { spreadsheetId, comments: res.data.comments ?? [] };
}
