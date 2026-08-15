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

export interface ChatSession {
  id: string;
  doctorId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastMessage?: string;
}

export interface ChatMessage {
  id: string;
  doctorId: string;
  sessionId?: string;
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
  timezone: string;
  lastRunAt: string | null;
  createdAt: string;
}

/** Detailed filter conditions for an event trigger. */
export interface EventFilterRules {
  /** gmail_new_message: sender address (exact) */
  from?: string;
  /** gmail_new_message: recipient address (exact) */
  to?: string;
  /** gmail_new_message / calendar_event_soon / drive_new_file: substring in subject/title/name */
  subjectContains?: string;
  /** gmail_new_message: substring in the email body */
  bodyContains?: string;
  /** gmail_new_message: only messages with attachments */
  hasAttachment?: boolean;
  /** calendar_event_soon: substring in an attendee email */
  attendeeContains?: string;
  /** drive_new_file: only files in this folder id */
  folderId?: string;
}

export interface EventTrigger {
  id: string;
  doctorId: string;
  name: string;
  eventSource: "gmail_new_message" | "calendar_event_soon" | "drive_new_file";
  instructions: string;
  enabled: boolean;
  filterRules: EventFilterRules;
  lastCheckedAt: string | null;
  condition: string | null;
  createdAt: string;
}
