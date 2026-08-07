import { OAuth2Client } from "google-auth-library";
import { createClient } from "@supabase/supabase-js";
import { decryptRefreshToken } from "./encryption";

const scopes = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
];

export function createOAuthClient(): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Missing GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, or GOOGLE_REDIRECT_URI"
    );
  }

  return new OAuth2Client(clientId, clientSecret, redirectUri);
}

export function getOAuthUrl(): string {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    prompt: "consent",
  });
}

export async function exchangeCodeForTokens(
  code: string
): Promise<{ refreshToken: string; accessToken: string }> {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error("No refresh token returned. Re-authorize with prompt=consent.");
  }
  return {
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token ?? "",
  };
}

function createSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

export async function getGoogleAuth(
  doctorId: string
): Promise<OAuth2Client> {
  const supabase = createSupabase();
  const { data, error } = await supabase
    .from("google_connections")
    .select("refresh_token_encrypted")
    .eq("doctor_id", doctorId)
    .eq("status", "active")
    .single();

  if (error || !data) {
    throw new Error(
      `No active Google connection for doctor ${doctorId}. Connect in Settings.`
    );
  }

  const row = data as { refresh_token_encrypted: string };
  const refreshToken = decryptRefreshToken(row.refresh_token_encrypted);
  const client = createOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });
  await client.getAccessToken();

  return client;
}
