import { wait } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import type { ApprovalActionType } from "@repo/shared";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

export function createTriggerApprovalHandler(doctorId: string) {
  return async function requestApproval(
    actionType: ApprovalActionType,
    payload: Record<string, unknown>
  ): Promise<{ approved: boolean; reason?: string }> {
    const supabase = getSupabase();

    const { data, error: insertError } = await supabase
      .from("approval_requests")
      .insert({
        doctor_id: doctorId,
        action_type: actionType,
        action_payload: payload,
        status: "pending",
        requested_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError || !data) {
      console.error("[Approval] Failed to insert approval request:", insertError);
      return { approved: false, reason: "Internal error creating approval request" };
    }

    const approvalId = (data as { id: string }).id;
    let backoff = 10;

    while (true) {
      await wait.for({ seconds: backoff });

      const { data: current } = await supabase
        .from("approval_requests")
        .select("status, rejection_reason")
        .eq("id", approvalId)
        .single();

      if (!current) {
        return { approved: false, reason: "Approval request not found" };
      }

      const row = current as { status: string; rejection_reason: string | null };

      if (row.status === "approved") {
        return { approved: true };
      }

      if (row.status === "rejected") {
        return {
          approved: false,
          reason: row.rejection_reason ?? "Rejected by doctor",
        };
      }

      backoff = Math.min(backoff * 2, 300);
    }
  };
}
