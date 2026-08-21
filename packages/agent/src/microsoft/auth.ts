import { createClient } from "@supabase/supabase-js";
import { decryptRefreshToken } from "../google/encryption";
import { logInfo, logError, logWarn, logWithClient } from "../logger";

const AUTHORITY = "https://login.microsoftonline.com/common/oauth2/v2.0";
const GRAPH_SCOPES = [
  "Mail.ReadWrite",
  "Mail.Send",
  "MailboxSettings.ReadWrite",
  "Calendars.ReadWrite",
  "Contacts.ReadWrite",
  "Tasks.ReadWrite",
  "Files.ReadWrite",
  "Files.ReadWrite.All",
  "Sites.Read.All",
  "People.Read",
  "User.Read",
  "offline_access",
].join(" ");

function getConfig() {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Missing MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, or MICROSOFT_REDIRECT_URI"
    );
  }
  return { clientId, clientSecret, redirectUri };
}

export function getMicrosoftOAuthUrl(): string {
  const { clientId, redirectUri } = getConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: GRAPH_SCOPES,
    prompt: "consent",
  });
  logInfo("microsoft-auth", "Microsoft OAuth URL generated");
  return `${AUTHORITY}/authorize?${params.toString()}`;
}

export async function exchangeMicrosoftCodeForTokens(
  code: string
): Promise<{ refreshToken: string; accessToken: string }> {
  const { clientId, clientSecret, redirectUri } = getConfig();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    scope: GRAPH_SCOPES,
  });

  logInfo("microsoft-auth", "Exchanging authorization code for tokens");

  const res = await fetch(`${AUTHORITY}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !data.refresh_token) {
    const detail = data.error_description ?? `HTTP ${res.status}`;
    logWarn("microsoft-auth", "No refresh token in token response", undefined, {
      error: data.error,
      error_description: data.error_description,
    });
    throw new Error(`Microsoft token exchange failed: ${detail}`);
  }

  logInfo("microsoft-auth", "Microsoft token exchange successful", undefined, {
    hasAccessToken: !!data.access_token,
    hasRefreshToken: true,
  });

  return {
    refreshToken: data.refresh_token,
    accessToken: data.access_token ?? "",
  };
}

function createSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

export async function getMicrosoftAccessToken(
  doctorId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any
): Promise<string> {
  try {
    const supabase = supabaseClient ?? createSupabase();
    const { data, error } = await supabase
      .from("microsoft_connections")
      .select("refresh_token_encrypted")
      .eq("doctor_id", doctorId)
      .eq("status", "active")
      .single();

    if (error || !data) {
      const msg = `No active Microsoft connection for doctor ${doctorId}`;
      const details = { dbError: error?.message ?? null, usingOwnClient: !!supabaseClient };
      logWarn("microsoft-auth", msg, doctorId, details);
      if (supabaseClient) {
        await logWithClient(supabaseClient, { level: "warn", source: "microsoft-auth", message: msg, doctor_id: doctorId, details });
      }
      throw new Error(`${msg}. Connect in Settings.`);
    }

    const row = data as { refresh_token_encrypted: string };
    const refreshToken = decryptRefreshToken(row.refresh_token_encrypted);
    const { clientId, clientSecret } = getConfig();

    logInfo("microsoft-auth", "Refreshing Microsoft access token", doctorId);
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: GRAPH_SCOPES,
    });

    const res = await fetch(`${AUTHORITY}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const data2 = (await res.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };

    if (!res.ok || !data2.access_token) {
      const msg = "Failed to refresh Microsoft access token";
      logError("microsoft-auth", msg, undefined, doctorId);
      throw new Error(data2.error_description ?? msg);
    }

    logInfo("microsoft-auth", "Microsoft access token ready", doctorId);
    return data2.access_token;
  } catch (err) {
    logError("microsoft-auth", "getMicrosoftAccessToken failed", err, doctorId);
    throw err;
  }
}
