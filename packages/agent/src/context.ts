import type { ApprovalActionType } from "@repo/shared";

export interface AgentContext {
  doctorId: string;
  sessionType: "chat" | "cron" | "event";
  requestApproval?: (
    actionType: ApprovalActionType,
    payload: Record<string, unknown>
  ) => Promise<{ approved: boolean; reason?: string }>;
}
