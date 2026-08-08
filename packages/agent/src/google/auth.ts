import { OAuth2Client } from "google-auth-library";
import { createClient } from "@supabase/supabase-js";
import { decryptRefreshToken } from "./encryption";
import { logInfo, logError, logWarn, logWithClient } from "../logger";

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
  const url = client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    prompt: "consent",
  });
  logInfo("google-auth", "OAuth URL generated");
  return url;
}

export async function exchangeCodeForTokens(
  code: string
): Promise<{ refreshToken: string; accessToken: string }> {
  try {
    const client = createOAuthClient();
    logInfo("google-auth", "Exchanging authorization code for tokens", undefined, {
      codePreview: code.slice(0, 10) + "...",
    });

    const { tokens } = await client.getToken(code);

    if (!tokens.refresh_token) {
      logWarn("google-auth", "No refresh token in response", undefined, {
        hasAccessToken: !!tokens.access_token,
        hasIdToken: !!tokens.id_token,
        tokenType: tokens.token_type,
      });
      throw new Error("No refresh token returned. Re-authorize with prompt=consent.");
    }

    logInfo("google-auth", "Token exchange successful", undefined, {
      hasAccessToken: !!tokens.access_token,
      hasIdToken: !!tokens.id_token,
    });

    return {
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token ?? "",
    };
  } catch (err) {
    logError("google-auth", "Token exchange failed", err);
    throw err;
  }
}

function createSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

export async function getGoogleAuth(
  doctorId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
): Promise<OAuth2Client> {
  try {
    const supabase = supabaseClient ?? createSupabase();
    const { data, error } = await supabase
      .from("google_connections")
      .select("refresh_token_encrypted")
      .eq("doctor_id", doctorId)
      .eq("status", "active")
      .single();

    if (error || !data) {
      const msg = `No active Google connection for doctor ${doctorId}`;
      const details = { dbError: error?.message ?? null, usingOwnClient: !!supabaseClient };
      logWarn("google-auth", msg, doctorId, details);
      if (supabaseClient) {
        await logWithClient(supabaseClient, { level: "warn", source: "google-auth", message: msg, doctor_id: doctorId, details });
      }
      throw new Error(`${msg}. Connect in Settings.`);
    }

    const row = data as { refresh_token_encrypted: string };
    const refreshToken = decryptRefreshToken(row.refresh_token_encrypted);
    const client = createOAuthClient();
    client.setCredentials({ refresh_token: refreshToken });

    logInfo("google-auth", "Refreshing access token", doctorId);
    const accessTokenResponse = await client.getAccessToken();

    if (!accessTokenResponse.token) {
      const msg = "Failed to refresh access token";
      logError("google-auth", msg, null, doctorId);
      if (supabaseClient) {
        await logWithClient(supabaseClient, { level: "error", source: "google-auth", message: msg, doctor_id: doctorId });
      }
      throw new Error(msg);
    }

    logInfo("google-auth", "Google auth client ready", doctorId);
    return client;
  } catch (err) {
    logError("google-auth", "getGoogleAuth failed", err, doctorId);
    throw err;
  }
}
