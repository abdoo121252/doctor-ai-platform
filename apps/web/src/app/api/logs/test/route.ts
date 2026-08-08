import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { logWithClient, log } from "@repo/agent";

export async function GET() {
  const results: Record<string, string> = {};

  // Test 1: Direct DB write with authenticated client
  try {
    const supabase = await createServerSupabase();
    await logWithClient(supabase, {
      level: "info",
      source: "log-test",
      message: "Test log via authenticated client",
    });
    results.authenticatedClient = "OK";
  } catch (err) {
    results.authenticatedClient = String(err);
  }

  // Test 2: Service key logger
  try {
    await log({
      level: "info",
      source: "log-test",
      message: "Test log via service key",
    });
    results.serviceKey = "OK";
  } catch (err) {
    results.serviceKey = String(err);
  }

  results.hasServiceKey = process.env.SUPABASE_SERVICE_KEY ? "YES" : "NO";
  results.supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ? "SET" : "MISSING";

  return NextResponse.json(results);
}
