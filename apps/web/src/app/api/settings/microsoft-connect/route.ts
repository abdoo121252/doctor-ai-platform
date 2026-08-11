import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getMicrosoftOAuthUrl, logWithClient } from "@repo/agent";

export async function GET() {
  try {
    const supabase = await createServerSupabase();

    await logWithClient(supabase, {
      level: "info",
      source: "microsoft-connect",
      message: "Generating Microsoft OAuth URL",
      details: {
        redirectUri: process.env.MICROSOFT_REDIRECT_URI ?? "NOT SET",
        hasClientId: !!process.env.MICROSOFT_CLIENT_ID,
        hasClientSecret: !!process.env.MICROSOFT_CLIENT_SECRET,
      },
    });

    const url = getMicrosoftOAuthUrl();
    return NextResponse.json({ url });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
