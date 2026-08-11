import type { ApprovalActionType, AgentToolName } from "@repo/shared";

export interface AgentContext {
  doctorId: string;
  sessionType: "chat" | "cron" | "event";
  sessionId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase?: any;
  requestApproval?: (
    actionType: ApprovalActionType,
    payload: Record<string, unknown>
  ) => Promise<{ approved: boolean; reason?: string }>;
  /**
   * Per-tool sensitivity for this doctor, merged with defaults. When a
   * tool is sensitive, `needsApproval: true` is set on the tool so the
   * chat stream pauses for doctor approval before executing.
   */
  toolSensitivity?: Partial<Record<AgentToolName, boolean>>;
}
