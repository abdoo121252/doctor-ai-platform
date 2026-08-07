import { google } from "googleapis";
import { getGoogleAuth } from "./auth";

export async function getSheetValues(
  doctorId: string,
  spreadsheetId: string,
  range: string
) {
  const auth = await getGoogleAuth(doctorId);
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
