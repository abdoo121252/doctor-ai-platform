import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { exchangeCodeForTokens, encryptRefreshToken, logInfo, logError } from "@repo/agent";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      logWarn_("google-callback", "User not authenticated, redirecting to login");
      return NextResponse.redirect(new URL("/login", request.url));
    }

    const code = request.nextUrl.searchParams.get("code");
    if (!code) {
      logError("google-callback", "No code in callback", null, auth.user.id);
      return NextResponse.redirect(
        new URL("/settings?error=missing-code", request.url)
      );
    }

    logInfo("google-callback", "Exchanging code for tokens", auth.user.id);

    const { refreshToken } = await exchangeCodeForTokens(code);
    const encrypted = encryptRefreshToken(refreshToken);

    logInfo("google-callback", "Saving encrypted token to DB", auth.user.id, {
      tokenLength: encrypted.length,
    });

    const { error } = await supabase
      .from("google_connections")
      .upsert(
        {
          doctor_id: auth.user.id,
          status: "active",
          refresh_token_encrypted: encrypted,
          connected_at: new Date().toISOString(),
        },
        { onConflict: "doctor_id" }
      );

    if (error) {
      logError("google-callback", "DB upsert failed", error, auth.user.id);
      return NextResponse.redirect(
        new URL("/settings?error=db-write-failed", request.url)
      );
    }

    logInfo("google-callback", "Google connection saved successfully", auth.user.id);
    return NextResponse.redirect(new URL("/settings?connected=1", request.url));
  } catch (err) {
    logError("google-callback", "OAuth flow failed", err);
    console.error("[Google Callback] Error:", err);
    return NextResponse.redirect(
      new URL("/settings?error=oauth-failed", request.url)
    );
  }
}

function logWarn_(source: string, msg: string) {
  console.warn(`[${source}]`, msg);
}
