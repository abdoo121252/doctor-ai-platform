import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getOAuthUrl, logWithClient } from "@repo/agent";

export async function GET() {
  try {
    const supabase = await createServerSupabase();

    await logWithClient(supabase, {
      level: "info",
      source: "google-connect",
      message: "Generating OAuth URL",
      details: {
        redirectUri: process.env.GOOGLE_REDIRECT_URI ?? "NOT SET",
        hasClientId: !!process.env.GOOGLE_CLIENT_ID,
        hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
      },
    });

    const url = getOAuthUrl();
    return NextResponse.json({ url });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
