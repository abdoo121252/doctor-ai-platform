import type { ApprovalActionType } from "@repo/shared";

/**
 * Convenience wrapper for the approval gate.
 *
 * In chat mode, tools execute directly — `requestApproval` is never called.
 * In automated mode (cron/event), `requestApproval` is injected by the
 * Trigger.dev task and pauses execution until the doctor approves/rejects.
 */
export async function requestApprovalAndWait(
  requestApproval: (
    actionType: ApprovalActionType,
    payload: Record<string, unknown>
  ) => Promise<{ approved: boolean; reason?: string }>,
  actionType: ApprovalActionType,
  actionPayload: Record<string, unknown>
): Promise<{ approved: boolean; reason?: string }> {
  return requestApproval(actionType, actionPayload);
}
