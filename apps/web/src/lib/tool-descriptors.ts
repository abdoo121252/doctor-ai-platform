import type { AgentToolName } from "@repo/shared";

export interface ToolDescriptor {
  name: AgentToolName;
  label: string;
  description: string;
}

export const TOOL_DESCRIPTORS: ToolDescriptor[] = [
  { name: "readEmails", label: "Read Gmail", description: "Read the latest emails from Gmail" },
  { name: "sendEmail", label: "Send Gmail", description: "Send an email from the doctor's Gmail account" },
  { name: "readCalendar", label: "Read Google Calendar", description: "Read events from the doctor's Google Calendar" },
  { name: "createEvent", label: "Create Google Calendar Event", description: "Create a Google Calendar event (may invite attendees)" },
  { name: "searchDrive", label: "Search Google Drive", description: "Search for files in the doctor's Google Drive" },
  { name: "readSheet", label: "Read Google Sheets", description: "Read data from a Google Sheet" },
  { name: "readOutlookEmails", label: "Read Outlook Email", description: "Read the latest emails from Outlook" },
  { name: "sendOutlookEmail", label: "Send Outlook Email", description: "Send an email from the doctor's Outlook account" },
  { name: "readOutlookCalendar", label: "Read Outlook Calendar", description: "Read events from the doctor's Outlook calendar" },
  { name: "createOutlookEvent", label: "Create Outlook Calendar Event", description: "Create an Outlook calendar event (may invite attendees)" },
  { name: "searchOneDrive", label: "Search OneDrive", description: "Search for files in the doctor's OneDrive" },
  { name: "readOneDriveFile", label: "Read OneDrive File", description: "Read the content of a file in OneDrive" },
];
