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
};

export const MAX_CONVERSATION_MESSAGES = 50;

export const APPROVAL_DEFAULT_TIMEOUT = "30d";
