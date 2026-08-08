import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { exchangeCodeForTokens, encryptRefreshToken, logWithClient } from "@repo/agent";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      await logWithClient(supabase, {
        level: "warn",
        source: "google-callback",
        message: "User not authenticated, redirecting to login",
      });
      return NextResponse.redirect(new URL("/login", request.url));
    }

    const code = request.nextUrl.searchParams.get("code");
    if (!code) {
      await logWithClient(supabase, {
        level: "error",
        source: "google-callback",
        message: "No authorization code received",
        doctor_id: auth.user.id,
      });
      return NextResponse.redirect(
        new URL("/settings?error=missing-code", request.url)
      );
    }

    await logWithClient(supabase, {
      level: "info",
      source: "google-callback",
      message: "Exchanging authorization code for tokens",
      doctor_id: auth.user.id,
    });

    const { refreshToken } = await exchangeCodeForTokens(code);
    const encrypted = encryptRefreshToken(refreshToken);

    await logWithClient(supabase, {
      level: "info",
      source: "google-callback",
      message: "Saving encrypted token to DB",
      doctor_id: auth.user.id,
      details: { tokenLength: encrypted.length },
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
      await logWithClient(supabase, {
        level: "error",
        source: "google-callback",
        message: "DB upsert failed",
        doctor_id: auth.user.id,
        details: { code: error.code, message: error.message, hint: error.hint },
      });
      return NextResponse.redirect(
        new URL("/settings?error=db-write-failed", request.url)
      );
    }

    await logWithClient(supabase, {
      level: "info",
      source: "google-callback",
      message: "Google connection saved successfully",
      doctor_id: auth.user.id,
    });

    return NextResponse.redirect(new URL("/settings?connected=1", request.url));
  } catch (err) {
    console.error("[Google Callback] Error:", err);
    return NextResponse.redirect(
      new URL("/settings?error=oauth-failed", request.url)
    );
  }
}
