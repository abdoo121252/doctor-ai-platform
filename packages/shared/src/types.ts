export type SessionType = "chat" | "cron" | "event";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export type ApprovalActionType =
  | "send_email"
  | "delete_email"
  | "create_event"
  | "delete_event"
  | "delete_file"
  | "write_sheet"
  | "share_file";

export interface ApprovalRequest {
  id: string;
  doctorId: string;
  sessionId: string;
  actionType: ApprovalActionType;
  actionPayload: Record<string, unknown>;
  status: ApprovalStatus;
  triggerTokenId: string | null;
  requestedAt: string;
  resolvedAt: string | null;
  rejectionReason: string | null;
}

export interface ChatMessage {
  id: string;
  doctorId: string;
  sessionType: SessionType;
  role: "user" | "assistant" | "tool";
  content: string;
  createdAt: string;
}

export interface ScheduledTask {
  id: string;
  doctorId: string;
  name: string;
  cronExpression: string;
  instructions: string;
  enabled: boolean;
  createdAt: string;
}

export interface EventTrigger {
  id: string;
  doctorId: string;
  name: string;
  eventSource: "gmail_new_message" | "calendar_event_soon" | "drive_new_file";
  instructions: string;
  enabled: boolean;
  createdAt: string;
}
