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

export type ScheduleType = "recurring" | "one_off_dates";

export interface ScheduledTask {
  id: string;
  doctorId: string;
  name: string;
  cronExpression: string | null;
  scheduleType: ScheduleType;
  instructions: string;
  enabled: boolean;
  timezone: string;
  lastRunAt: string | null;
  createdAt: string;
}

/** One explicit run date for a one-off scheduled task. */
export interface ScheduledTaskDate {
  id: string;
  taskId: string;
  runAt: string;
  firedAt: string | null;
}

/** Event sources supported by event triggers (Google + Microsoft). */
export type EventSourceType =
  | "gmail_new_message"
  | "calendar_event_soon"
  | "drive_new_file"
  | "outlook_new_message"
  | "outlook_calendar_soon"
  | "onedrive_new_file";

/** Detailed filter conditions for an event trigger. */
export interface EventFilterRules {
  /** gmail_new_message / outlook_new_message: sender address */
  from?: string;
  /** gmail_new_message / outlook_new_message: recipient address */
  to?: string;
  /** any source: substring in subject/title/name */
  subjectContains?: string;
  /** gmail_new_message / outlook_new_message: substring in the message body */
  bodyContains?: string;
  /** gmail_new_message / outlook_new_message: only messages with attachments */
  hasAttachment?: boolean;
  /** calendar_event_soon / outlook_calendar_soon: substring in an attendee email */
  attendeeContains?: string;
  /** calendar_event_soon / outlook_calendar_soon: substring in the event location */
  locationContains?: string;
  /** drive_new_file / onedrive_new_file: only files in this folder id */
  folderId?: string;
  /** drive_new_file / onedrive_new_file: only files of this MIME type */
  mimeType?: string;
}

/**
 * A path's filter condition. Either the deterministic field filter
 * (mode: "fields") or a natural-language condition evaluated by the AI
 * (mode: "ai"). An empty fields object / empty condition always matches.
 */
export type EventTriggerPathFilter =
  | { mode: "fields"; fields: EventFilterRules }
  | { mode: "ai"; condition: string };

/** One branch of an event trigger: its condition + the instructions to run. */
export interface EventTriggerPath {
  id: string;
  /** Optional short label (e.g. "Manager reprimand") shown in UI + passed to the AI. */
  name?: string;
  filter: EventTriggerPathFilter;
  /** Agent instructions executed when this path is selected. */
  instructions: string;
}

export interface EventTrigger {
  id: string;
  doctorId: string;
  name: string;
  eventSource: EventSourceType;
  instructions: string;
  enabled: boolean;
  filterRules: EventFilterRules;
  lastCheckedAt: string | null;
  condition: string | null;
  /** Multi-path branches. Empty array = legacy single-instruction trigger. */
  paths: EventTriggerPath[];
  createdAt: string;
}
