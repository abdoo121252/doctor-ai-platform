import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createServerSupabase();

    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: approvals, error } = await supabase
      .from("approval_requests")
      .select("*")
      .eq("doctor_id", auth.user.id)
      .eq("status", "pending")
      .order("requested_at", { ascending: false });

    if (error) {
      console.error("[Approvals] Fetch error:", error);
      return NextResponse.json(
        { error: "Failed to fetch approvals" },
        { status: 500 }
      );
    }

    return NextResponse.json({ approvals });
  } catch (error) {
    console.error("[Approvals API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
