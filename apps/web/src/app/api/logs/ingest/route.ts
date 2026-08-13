import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { logWithClient } from "@repo/agent";

export const dynamic = "force-dynamic";

/**
 * Ingest endpoint for browser-side logs (window errors, unhandled rejections,
 * React render errors). The browser has no service key, so this route uses the
 * authenticated Supabase client and attributes the entry to the signed-in user.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const level =
      body.level === "error" || body.level === "warn" ? body.level : "info";
    const source =
      typeof body.source === "string" ? body.source.slice(0, 100) : "client";
    const message =
      typeof body.message === "string" ? body.message.slice(0, 2000) : "";
    const details = body.details ?? null;

    const supabase = await createServerSupabase();
    const { data: auth } = await supabase.auth.getUser();
    const doctorId = auth.user?.id ?? null;

    await logWithClient(supabase, {
      doctor_id: doctorId,
      level,
      source,
      message,
      details,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
