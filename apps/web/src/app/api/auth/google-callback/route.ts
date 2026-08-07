import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { exchangeCodeForTokens, encryptRefreshToken } from "@repo/agent";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    const code = request.nextUrl.searchParams.get("code");
    if (!code) {
      return NextResponse.redirect(
        new URL("/settings?error=missing-code", request.url)
      );
    }

    const { refreshToken } = await exchangeCodeForTokens(code);
    const encrypted = encryptRefreshToken(refreshToken);

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
      console.error("[Google Callback] Upsert error:", error);
      return NextResponse.redirect(
        new URL("/settings?error=db-write-failed", request.url)
      );
    }

    return NextResponse.redirect(new URL("/settings?connected=1", request.url));
  } catch (error) {
    console.error("[Google Callback] Error:", error);
    return NextResponse.redirect(
      new URL("/settings?error=oauth-failed", request.url)
    );
  }
}
