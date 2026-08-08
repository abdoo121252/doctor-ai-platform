import { NextResponse } from "next/server";
import { getOAuthUrl, logError, logInfo } from "@repo/agent";

export async function GET() {
  try {
    const url = getOAuthUrl();
    logInfo("google-connect", "Generated OAuth URL", undefined, {
      redirectUri: process.env.GOOGLE_REDIRECT_URI ?? "NOT SET",
      hasClientId: !!process.env.GOOGLE_CLIENT_ID,
      hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
    });
    return NextResponse.json({ url });
  } catch (error) {
    logError("google-connect", "Failed to generate OAuth URL", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
