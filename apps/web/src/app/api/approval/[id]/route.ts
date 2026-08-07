import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabase();
    const body = await request.json();
    const { status, reason } = body;

    if (status !== "approved" && status !== "rejected") {
      return NextResponse.json(
        { error: "Status must be 'approved' or 'rejected'" },
        { status: 400 }
      );
    }

    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: approval, error: lookupError } = await supabase
      .from("approval_requests")
      .select("*")
      .eq("id", params.id)
      .eq("doctor_id", auth.user.id)
      .single();

    if (lookupError || !approval) {
      return NextResponse.json(
        { error: "Approval request not found" },
        { status: 404 }
      );
    }

    if (approval.status !== "pending") {
      return NextResponse.json(
        { error: `Approval already ${approval.status}` },
        { status: 409 }
      );
    }

    const { error: updateError } = await supabase
      .from("approval_requests")
      .update({
        status,
        resolved_at: new Date().toISOString(),
        rejection_reason: status === "rejected" ? reason ?? null : null,
      })
      .eq("id", params.id);

    if (updateError) {
      console.error("[Approval] DB update error:", updateError);
      return NextResponse.json(
        { error: "Failed to update approval" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      id: params.id,
      status,
    });
  } catch (error) {
    console.error("[Approval API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
