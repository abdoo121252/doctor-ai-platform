import { NextResponse } from "next/server";
import { getOAuthUrl } from "@repo/agent";

export async function GET() {
  try {
    const url = getOAuthUrl();
    return NextResponse.json({ url });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
