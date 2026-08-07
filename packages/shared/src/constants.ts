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

export const MAX_CONVERSATION_MESSAGES = 50;

export const APPROVAL_DEFAULT_TIMEOUT = "30d";
