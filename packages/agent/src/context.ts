import type { ApprovalActionType } from "@repo/shared";

export interface AgentContext {
  doctorId: string;
  sessionType: "chat" | "cron" | "event";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase?: any;
  requestApproval?: (
    actionType: ApprovalActionType,
    payload: Record<string, unknown>
  ) => Promise<{ approved: boolean; reason?: string }>;
}
