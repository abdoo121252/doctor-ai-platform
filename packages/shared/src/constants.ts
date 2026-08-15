export const SENSITIVE_TOOL_IDS = [
  "send-email",
  "delete-email",
  "create-event",
  "delete-event",
  "delete-file",
  "write-sheet",
  "share-file",
] as const;

export const NON_SENSITIVE_TOOL_IDS = [
  "read-emails",
  "read-calendar",
  "search-drive",
  "read-sheet",
] as const;

/** The 12 agent tool names as registered in the chat agent. */
export const AGENT_TOOL_NAMES = [
  "readEmails",
  "sendEmail",
  "readCalendar",
  "createEvent",
  "searchDrive",
  "readSheet",
  "readOutlookEmails",
  "sendOutlookEmail",
  "readOutlookCalendar",
  "createOutlookEvent",
  "searchOneDrive",
  "readOneDriveFile",
  "scheduleTask",
  "createEventTrigger",
] as const;

export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

/** Per-tool default sensitivity. Sensitive tools pause for doctor approval in chat. */
export const TOOL_SENSITIVITY_DEFAULTS: Record<AgentToolName, boolean> = {
  sendEmail: true,
  sendOutlookEmail: true,
  createEvent: true,
  createOutlookEvent: true,
  searchDrive: true,
  searchOneDrive: true,
  readSheet: true,
  readOneDriveFile: true,
  readEmails: false,
  readOutlookEmails: false,
  readCalendar: false,
  readOutlookCalendar: false,
  scheduleTask: false,
  createEventTrigger: false,
};

export const MAX_CONVERSATION_MESSAGES = 50;

export const APPROVAL_DEFAULT_TIMEOUT = "30d";

/** Automation kinds that can carry per-automation tool overrides. */
export const AUTOMATION_TYPES = ["scheduled_task", "event_trigger"] as const;
export type AutomationType = (typeof AUTOMATION_TYPES)[number];

/**
 * Map every agent tool to the snake_case `action_type` used on
 * `approval_requests`. The four side-effect tools were the only ones that
 * previously created approvals; the rest are added so the unified automation
 * sensitivity gate (override -> general -> default) can pause on any tool.
 */
export const TOOL_ACTION_TYPES: Record<AgentToolName, string> = {
  sendEmail: "send_email",
  sendOutlookEmail: "send_email",
  createEvent: "create_event",
  createOutlookEvent: "create_event",
  searchDrive: "search_drive",
  searchOneDrive: "search_drive",
  readSheet: "read_sheet",
  readOneDriveFile: "read_file",
  readEmails: "read_emails",
  readOutlookEmails: "read_emails",
  readCalendar: "read_calendar",
  readOutlookCalendar: "read_calendar",
  scheduleTask: "schedule_task",
  createEventTrigger: "create_event_trigger",
};
