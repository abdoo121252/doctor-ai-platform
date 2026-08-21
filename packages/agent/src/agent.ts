import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { streamText, generateText, isStepCount } from "ai";
import type { LanguageModel, Tool } from "ai";
import {
  createReadEmailsTool,
  createSendEmailTool,
  createSearchGmailMessagesTool,
  createGetGmailMessageTool,
  createGetGmailMessagesBatchTool,
  createGetGmailAttachmentTool,
  createGetGmailThreadTool,
  createGetGmailThreadsBatchTool,
  createModifyGmailLabelsTool,
  createBatchModifyGmailLabelsTool,
  createListGmailLabelsTool,
  createManageGmailLabelTool,
  createDraftGmailMessageTool,
  createListGmailFiltersTool,
  createManageGmailFilterTool,
} from "./tools/gmail";
import {
  createReadCalendarTool,
  createCreateEventTool,
  createListCalendarsTool,
  createGetEventsTool,
  createUpdateEventTool,
  createDeleteEventTool,
  createCreateCalendarTool,
  createQueryFreebusyTool,
  createManageOutOfOfficeTool,
  createManageFocusTimeTool,
} from "./tools/calendar";
import {
  createSearchDriveTool,
  createGetDriveFileContentTool,
  createGetDriveDownloadUrlTool,
  createCreateDriveFileTool,
  createCreateDriveFolderTool,
  createImportDriveFileTool,
  createGetDriveShareableLinkTool,
  createListDriveItemsTool,
  createCopyDriveFileTool,
  createUpdateDriveFileTool,
  createDeleteDriveFileTool,
  createGetDrivePermissionsTool,
  createSetDrivePermissionsTool,
  createCheckDrivePublicAccessTool,
} from "./tools/drive";
import {
  createReadSheetTool,
  createCreateSpreadsheetTool,
  createListSpreadsheetsTool,
  createGetSpreadsheetInfoTool,
  createModifySheetValuesTool,
  createAppendSheetValuesTool,
  createCreateSheetTool,
  createBatchUpdateSheetTool,
  createListSheetTablesTool,
  createListSheetCommentsTool,
  createFormatSheetRangeTool,
  createMoveSheetRowsTool,
  createResizeSheetDimensionsTool,
  createManageConditionalFormattingTool,
} from "./tools/sheets";
import {
  createSearchDocsTool,
  createGetDocContentTool,
  createGetDocAsMarkdownTool,
  createCreateDocTool,
  createBatchUpdateDocTool,
  createExportDocToPdfTool,
  createListDocsInFolderTool,
  createListDocCommentsTool,
  createInsertDocImageTool,
  createFindAndReplaceDocTool,
  createUpdateParagraphStyleTool,
  createUpdateDocHeadersFootersTool,
  createInspectDocStructureTool,
  createCreateTableWithDataTool,
  createConvertFileToGoogleDocTool,
  createReadPdfContentTool,
} from "./tools/docs";
import {
  createCreatePresentationTool,
  createGetPresentationTool,
  createBatchUpdatePresentationTool,
  createGetPageTool,
  createGetPageThumbnailTool,
  createListPresentationCommentsTool,
} from "./tools/slides";
import {
  createCreateFormTool,
  createGetFormTool,
  createBatchUpdateFormTool,
  createListFormResponsesTool,
  createGetFormResponseTool,
  createSetPublishSettingsTool,
} from "./tools/forms";
import {
  createListTaskListsTool,
  createGetTaskListTool,
  createManageTaskListTool,
  createListTasksTool,
  createGetTaskTool,
  createManageTaskTool,
} from "./tools/tasks";
import {
  createListContactsTool,
  createGetContactTool,
  createSearchContactsTool,
  createManageContactTool,
  createManageContactsBatchTool,
  createListContactGroupsTool,
  createGetContactGroupTool,
  createManageContactGroupTool,
} from "./tools/contacts";
import {
  createListSpacesTool,
  createGetMessagesTool,
  createSendMessageTool,
  createSearchMessagesTool,
  createCreateReactionTool,
} from "./tools/chat";
import {
  createScheduleTaskTool,
  createEventTriggerTool,
} from "./tools/automation";
import {
  createReadOutlookEmailsTool,
  createSendOutlookEmailTool,
  createReadOutlookMessageTool,
  createGetOutlookAttachmentTool,
  createReplyOutlookEmailTool,
  createDraftOutlookReplyAllTool,
  createDraftOutlookEmailTool,
  createUpdateOutlookDraftTool,
  createSendOutlookDraftTool,
  createListOutlookDraftsTool,
  createSearchOutlookMessagesTool,
  createMoveOutlookMessagesTool,
  createListOutlookFoldersTool,
  createCreateOutlookFolderTool,
  createListOutlookRulesTool,
  createCreateOutlookRuleTool,
  createGetOutlookFocusedInboxTool,
  createListOutlookCategoriesTool,
  createCreateOutlookCategoryTool,
  createUpdateOutlookCategoryTool,
  createDeleteOutlookCategoryTool,
  createApplyOutlookCategoriesTool,
  createRemoveOutlookCategoriesTool,
  createReadOutlookCalendarTool,
  createCreateOutlookEventTool,
  createGetOutlookEventTool,
  createUpdateOutlookEventTool,
  createDeleteOutlookEventTool,
  createSearchOneDriveTool,
  createSearchOneDriveAllTool,
  createListOneDriveItemsTool,
  createGetOneDriveItemTool,
  createReadOneDriveFileTool,
  createDownloadOneDriveFileTool,
  createUploadOneDriveFileTool,
  createDeleteOneDriveItemTool,
  createShareOneDriveItemTool,
  createMoveOneDriveItemTool,
  createCopyOneDriveItemTool,
  createCreateOneDriveFolderTool,
  createSearchM365Tool,
  createListOutlookContactsTool,
  createSearchOutlookContactsTool,
  createGetOutlookContactTool,
  createCreateOutlookContactTool,
  createUpdateOutlookContactTool,
  createDeleteOutlookContactTool,
  createListOutlookContactFoldersTool,
  createCreateOutlookContactFolderTool,
  createListTodoListsTool,
  createCreateTodoListTool,
  createGetTodoListTool,
  createUpdateTodoListTool,
  createDeleteTodoListTool,
  createListTodoTasksTool,
  createCreateTodoTaskTool,
  createGetTodoTaskTool,
  createUpdateTodoTaskTool,
  createDeleteTodoTaskTool,
  createListTodoChecklistTool,
  createAddTodoChecklistItemTool,
  createUpdateTodoChecklistItemTool,
} from "./microsoft/tools";
import type { AgentContext } from "./context";
import type { AgentToolName } from "@repo/shared";

const nvidia = createOpenAICompatible({
  name: "nvidia",
  baseURL: "https://integrate.api.nvidia.com/v1",
  apiKey: process.env.NVIDIA_API_KEY,
});

export function getModel(): LanguageModel {
  return nvidia("nvidia/nemotron-3-nano-30b-a3b");
}

const SYSTEM_PROMPT = `You are a university professor's personal AI assistant connected to their accounts (Google: Gmail, Calendar, Sheets, Drive — Microsoft: Outlook mail, Outlook calendar, OneDrive).

Your role is to help the professor manage their academic workload efficiently. You can:
- Read and summarize emails (Gmail or Outlook)
- Send emails (requires approval in automated sessions)
- Read and manage the calendar (Google Calendar or Outlook calendar)
- Create calendar events (requires approval in automated sessions with attendees)
- Search for files in Google Drive or OneDrive
- Read files from OneDrive
- Read Google Sheets

**Important rules:**
1. Be concise and professional — professors have limited time.
2. When presenting information, prioritize by urgency and relevance (teaching, office hours, research deadlines, student/admin matters).
3. Always confirm before summarizing large amounts of data.
4. If you're unsure about something, ask for clarification.
5. If a tool fails because the doctor isn't connected to that provider, tell them to connect it in Settings.
6. You're an administrative assistant supporting academic work (lectures, grading, research, meetings, email) — not a medical or clinical tool.
7. When asked to view emails, calendar, or files, use the available tools rather than pretending.
8. When scheduling a task, if the professor gives day numbers (e.g. "the 13th and 16th at 9am") WITHOUT saying whether they mean every month or just this month, ask them to clarify before calling scheduleTask — never guess. Every-month is a recurring cron schedule; just-this-month is a one-off date list.`;

export interface ChatResponse {
  text: string;
  steps: Array<{
    text: string;
    toolCalls: Array<{
      toolName: string;
      args: unknown;
      result: unknown;
    }>;
  }>;
}

export interface StreamChatResponse {
  textStream: AsyncIterable<string>;
  steps: ChatResponse["steps"];
}

/**
 * Build the full tool set for an agent session, marking each tool with
 * `needsApproval` when it is sensitive for this doctor. Sensitivity is
 * resolved from `context.toolSensitivity` (already merged with defaults
 * by the caller) — fall back to all non-sensitive if unset.
 */
export function buildTools(context: AgentContext): Record<string, Tool> {
  const sensitive = (name: AgentToolName) =>
    context.toolSensitivity?.[name] ?? false;

  return {
    readEmails: createReadEmailsTool(context),
    sendEmail: createSendEmailTool(context, sensitive("sendEmail")),
    searchGmailMessages: createSearchGmailMessagesTool(context),
    getGmailMessage: createGetGmailMessageTool(context),
    getGmailMessagesBatch: createGetGmailMessagesBatchTool(context),
    getGmailAttachment: createGetGmailAttachmentTool(context),
    getGmailThread: createGetGmailThreadTool(context),
    getGmailThreadsBatch: createGetGmailThreadsBatchTool(context),
    modifyGmailLabels: createModifyGmailLabelsTool(context),
    batchModifyGmailLabels: createBatchModifyGmailLabelsTool(context),
    listGmailLabels: createListGmailLabelsTool(context),
    manageGmailLabel: createManageGmailLabelTool(context),
    draftGmailMessage: createDraftGmailMessageTool(context),
    listGmailFilters: createListGmailFiltersTool(context),
    manageGmailFilter: createManageGmailFilterTool(context),
    readCalendar: createReadCalendarTool(context),
    createEvent: createCreateEventTool(context, sensitive("createEvent")),
    listCalendars: createListCalendarsTool(context),
    getEvents: createGetEventsTool(context),
    updateEvent: createUpdateEventTool(context),
    deleteEvent: createDeleteEventTool(context),
    createCalendar: createCreateCalendarTool(context),
    queryFreebusy: createQueryFreebusyTool(context),
    manageOutOfOffice: createManageOutOfOfficeTool(context),
    manageFocusTime: createManageFocusTimeTool(context),
    searchDrive: createSearchDriveTool(context, sensitive("searchDrive")),
    getDriveFileContent: createGetDriveFileContentTool(context),
    getDriveDownloadUrl: createGetDriveDownloadUrlTool(context),
    createDriveFile: createCreateDriveFileTool(context),
    createDriveFolder: createCreateDriveFolderTool(context),
    importDriveFile: createImportDriveFileTool(context),
    getDriveShareableLink: createGetDriveShareableLinkTool(context),
    listDriveItems: createListDriveItemsTool(context),
    copyDriveFile: createCopyDriveFileTool(context),
    updateDriveFile: createUpdateDriveFileTool(context),
    deleteDriveFile: createDeleteDriveFileTool(context),
    getDrivePermissions: createGetDrivePermissionsTool(context),
    setDrivePermissions: createSetDrivePermissionsTool(context),
    checkDrivePublicAccess: createCheckDrivePublicAccessTool(context),
    readSheet: createReadSheetTool(context, sensitive("readSheet")),
    createSpreadsheet: createCreateSpreadsheetTool(context),
    listSpreadsheets: createListSpreadsheetsTool(context),
    getSpreadsheetInfo: createGetSpreadsheetInfoTool(context),
    modifySheetValues: createModifySheetValuesTool(context),
    appendSheetValues: createAppendSheetValuesTool(context),
    createSheet: createCreateSheetTool(context),
    batchUpdateSheet: createBatchUpdateSheetTool(context),
    listSheetTables: createListSheetTablesTool(context),
    listSheetComments: createListSheetCommentsTool(context),
    formatSheetRange: createFormatSheetRangeTool(context),
    moveSheetRows: createMoveSheetRowsTool(context),
    resizeSheetDimensions: createResizeSheetDimensionsTool(context),
    manageConditionalFormatting: createManageConditionalFormattingTool(context),
    searchDocs: createSearchDocsTool(context),
    getDocContent: createGetDocContentTool(context),
    getDocAsMarkdown: createGetDocAsMarkdownTool(context),
    createDoc: createCreateDocTool(context),
    batchUpdateDoc: createBatchUpdateDocTool(context),
    exportDocToPdf: createExportDocToPdfTool(context),
    listDocsInFolder: createListDocsInFolderTool(context),
    listDocComments: createListDocCommentsTool(context),
    insertDocImage: createInsertDocImageTool(context),
    findAndReplaceDoc: createFindAndReplaceDocTool(context),
    updateParagraphStyle: createUpdateParagraphStyleTool(context),
    updateDocHeadersFooters: createUpdateDocHeadersFootersTool(context),
    inspectDocStructure: createInspectDocStructureTool(context),
    createTableWithData: createCreateTableWithDataTool(context),
    convertFileToGoogleDoc: createConvertFileToGoogleDocTool(context, sensitive("convertFileToGoogleDoc")),
    readPdfContent: createReadPdfContentTool(context, sensitive("readPdfContent")),
    createPresentation: createCreatePresentationTool(context),
    getPresentation: createGetPresentationTool(context),
    batchUpdatePresentation: createBatchUpdatePresentationTool(context),
    getPage: createGetPageTool(context),
    getPageThumbnail: createGetPageThumbnailTool(context),
    listPresentationComments: createListPresentationCommentsTool(context),
    createForm: createCreateFormTool(context),
    getForm: createGetFormTool(context),
    batchUpdateForm: createBatchUpdateFormTool(context),
    listFormResponses: createListFormResponsesTool(context),
    getFormResponse: createGetFormResponseTool(context),
    setPublishSettings: createSetPublishSettingsTool(context),
    listTaskLists: createListTaskListsTool(context),
    getTaskList: createGetTaskListTool(context),
    manageTaskList: createManageTaskListTool(context),
    listTasks: createListTasksTool(context),
    getTask: createGetTaskTool(context),
    manageTask: createManageTaskTool(context),
    listContacts: createListContactsTool(context),
    getContact: createGetContactTool(context),
    searchContacts: createSearchContactsTool(context),
    manageContact: createManageContactTool(context),
    manageContactsBatch: createManageContactsBatchTool(context),
    listContactGroups: createListContactGroupsTool(context),
    getContactGroup: createGetContactGroupTool(context),
    manageContactGroup: createManageContactGroupTool(context),
    listChatSpaces: createListSpacesTool(context),
    getChatMessages: createGetMessagesTool(context),
    sendChatMessage: createSendMessageTool(context),
    searchChatMessages: createSearchMessagesTool(context),
    createChatReaction: createCreateReactionTool(context),
    readOutlookEmails: createReadOutlookEmailsTool(context),
    sendOutlookEmail: createSendOutlookEmailTool(
      context,
      sensitive("sendOutlookEmail")
    ),
    readOutlookMessage: createReadOutlookMessageTool(context),
    getOutlookAttachment: createGetOutlookAttachmentTool(context),
    replyOutlookEmail: createReplyOutlookEmailTool(
      context,
      sensitive("replyOutlookEmail")
    ),
    draftOutlookReplyAll: createDraftOutlookReplyAllTool(context),
    draftOutlookEmail: createDraftOutlookEmailTool(context),
    updateOutlookDraft: createUpdateOutlookDraftTool(context),
    sendOutlookDraft: createSendOutlookDraftTool(
      context,
      sensitive("sendOutlookDraft")
    ),
    listOutlookDrafts: createListOutlookDraftsTool(context),
    searchOutlookMessages: createSearchOutlookMessagesTool(context),
    moveOutlookMessages: createMoveOutlookMessagesTool(
      context,
      sensitive("moveOutlookMessages")
    ),
    listOutlookFolders: createListOutlookFoldersTool(context),
    createOutlookFolder: createCreateOutlookFolderTool(context),
    listOutlookRules: createListOutlookRulesTool(context),
    createOutlookRule: createCreateOutlookRuleTool(
      context,
      sensitive("createOutlookRule")
    ),
    getOutlookFocusedInbox: createGetOutlookFocusedInboxTool(context),
    listOutlookCategories: createListOutlookCategoriesTool(context),
    createOutlookCategory: createCreateOutlookCategoryTool(
      context,
      sensitive("createOutlookCategory")
    ),
    updateOutlookCategory: createUpdateOutlookCategoryTool(context),
    deleteOutlookCategory: createDeleteOutlookCategoryTool(
      context,
      sensitive("deleteOutlookCategory")
    ),
    applyOutlookCategories: createApplyOutlookCategoriesTool(
      context,
      sensitive("applyOutlookCategories")
    ),
    removeOutlookCategories: createRemoveOutlookCategoriesTool(
      context,
      sensitive("removeOutlookCategories")
    ),
    readOutlookCalendar: createReadOutlookCalendarTool(context),
    createOutlookEvent: createCreateOutlookEventTool(
      context,
      sensitive("createOutlookEvent")
    ),
    getOutlookEvent: createGetOutlookEventTool(context),
    updateOutlookEvent: createUpdateOutlookEventTool(
      context,
      sensitive("updateOutlookEvent")
    ),
    deleteOutlookEvent: createDeleteOutlookEventTool(
      context,
      sensitive("deleteOutlookEvent")
    ),
    searchOneDrive: createSearchOneDriveTool(
      context,
      sensitive("searchOneDrive")
    ),
    searchOneDriveAll: createSearchOneDriveAllTool(context),
    listOneDriveItems: createListOneDriveItemsTool(context),
    getOneDriveItem: createGetOneDriveItemTool(context),
    readOneDriveFile: createReadOneDriveFileTool(
      context,
      sensitive("readOneDriveFile")
    ),
    downloadOneDriveFile: createDownloadOneDriveFileTool(context),
    uploadOneDriveFile: createUploadOneDriveFileTool(
      context,
      sensitive("uploadOneDriveFile")
    ),
    deleteOneDriveItem: createDeleteOneDriveItemTool(
      context,
      sensitive("deleteOneDriveItem")
    ),
    shareOneDriveItem: createShareOneDriveItemTool(
      context,
      sensitive("shareOneDriveItem")
    ),
    moveOneDriveItem: createMoveOneDriveItemTool(
      context,
      sensitive("moveOneDriveItem")
    ),
    copyOneDriveItem: createCopyOneDriveItemTool(context),
    createOneDriveFolder: createCreateOneDriveFolderTool(context),
    searchM365: createSearchM365Tool(context),
    listOutlookContacts: createListOutlookContactsTool(context),
    searchOutlookContacts: createSearchOutlookContactsTool(context),
    getOutlookContact: createGetOutlookContactTool(context),
    createOutlookContact: createCreateOutlookContactTool(
      context,
      sensitive("createOutlookContact")
    ),
    updateOutlookContact: createUpdateOutlookContactTool(
      context,
      sensitive("updateOutlookContact")
    ),
    deleteOutlookContact: createDeleteOutlookContactTool(
      context,
      sensitive("deleteOutlookContact")
    ),
    listOutlookContactFolders: createListOutlookContactFoldersTool(context),
    createOutlookContactFolder: createCreateOutlookContactFolderTool(context),
    listTodoLists: createListTodoListsTool(context),
    createTodoList: createCreateTodoListTool(context),
    getTodoList: createGetTodoListTool(context),
    updateTodoList: createUpdateTodoListTool(context),
    deleteTodoList: createDeleteTodoListTool(
      context,
      sensitive("deleteTodoList")
    ),
    listTodoTasks: createListTodoTasksTool(context),
    createTodoTask: createCreateTodoTaskTool(
      context,
      sensitive("createTodoTask")
    ),
    getTodoTask: createGetTodoTaskTool(context),
    updateTodoTask: createUpdateTodoTaskTool(
      context,
      sensitive("updateTodoTask")
    ),
    deleteTodoTask: createDeleteTodoTaskTool(
      context,
      sensitive("deleteTodoTask")
    ),
    listTodoChecklist: createListTodoChecklistTool(context),
    addTodoChecklistItem: createAddTodoChecklistItemTool(
      context,
      sensitive("addTodoChecklistItem")
    ),
    updateTodoChecklistItem: createUpdateTodoChecklistItemTool(
      context,
      sensitive("updateTodoChecklistItem")
    ),
    scheduleTask: createScheduleTaskTool(context),
    createEventTrigger: createEventTriggerTool(context),
  };
}

export async function generateChatResponse({
  context,
  messages,
}: {
  context: AgentContext;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<ChatResponse> {
  const { textStream, steps } = streamChatResponse({ context, messages });

  let text = "";
  for await (const chunk of textStream) {
    text += chunk;
  }

  return { text, steps };
}

/**
 * Ask the model to rewrite a pending tool-call input according to a
 * natural-language instruction (the doctor's edit request). Returns the
 * revised input object, or null if the model did not return valid JSON.
 */
export async function rewriteToolInput({
  toolName,
  input,
  instruction,
  conversation,
}: {
  toolName: string;
  input: unknown;
  instruction: string;
  conversation?: Array<{ role: "user" | "assistant" | "tool"; content: string }>;
}): Promise<unknown | null> {
  const model = getModel();

  const { text } = await generateText({
    model,
    system: SYSTEM_PROMPT,
    prompt: [
      `You are the professor's AI assistant, mid-conversation. A tool call is waiting for approval, and the professor wants you to adjust the tool's arguments based on their instruction. You have the FULL conversation context below — use it to resolve any references in the instruction (names, dates, email addresses, file references, etc.).`,
      ``,
      `=== Conversation so far ===`,
      ...(conversation && conversation.length > 0
        ? conversation.map(
            (m) => `${m.role === "tool" ? "tool-result" : m.role}: ${m.content}`
          )
        : ["(no prior messages)"]),
      ``,
      `=== Tool call to modify ===`,
      `Tool: ${toolName}`,
      `Current input:`,
      `\`\`\`json`,
      JSON.stringify(input ?? {}, null, 2),
      `\`\`\``,
      ``,
      `Professor's instruction: ${instruction}`,
      ``,
      `The instruction is EITHER a plain-language change request OR the professor's directly-edited JSON for the tool input. If it parses as valid JSON, treat it as the final desired input (just normalize and return it, preserving its fields). Otherwise, apply the requested change to the current input.`,
      ``,
      `Return ONLY the revised tool input as a single JSON object, with no explanation, no markdown fences, and no code block markers. Keep every field the schema needs, changing only what the instruction requires.`,
    ].join("\n"),
    temperature: 0,
  });

  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

export function streamChatResponse({
  context,
  messages,
}: {
  context: AgentContext;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}): StreamChatResponse {
  const model = getModel();
  const steps: ChatResponse["steps"] = [];

  const result = streamText({
    model,
    system: SYSTEM_PROMPT,
    messages,
    tools: buildTools(context),
    stopWhen: isStepCount(10),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onStepFinish: ({ text, toolCalls, toolResults }: any) => {
      steps.push({
        text,
        toolCalls: toolCalls.map((call: any, i: number) => ({
          toolName: call.toolName,
          args: call.input,
          result: toolResults[i]?.output ?? null,
        })),
      });
    },
  });

  return {
    textStream: result.textStream,
    steps,
  };
}

/**
 * A single model step for the manual chat loop: run one `streamText` step
 * (stops after the first step) with a schema-only toolset so the SDK returns
 * tool calls instead of executing them. The caller decides whether to execute
 * a tool (sensitivity gate / approval) and feeds the tool result back as the
 * next message. Returns the text stream plus the tool calls captured for this
 * step (populated once the stream is fully consumed).
 */
export interface ChatStepToolCall {
  toolCallId: string;
  toolName: string;
  input: unknown;
}

export interface ChatStepResult {
  textStream: AsyncIterable<string>;
  toolCalls: ChatStepToolCall[];
}

export function runChatStep({
  messages,
  tools,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools: Record<string, any>;
}): ChatStepResult {
  const model = getModel();
  const toolCalls: ChatStepToolCall[] = [];

  const result = streamText({
    model,
    system: SYSTEM_PROMPT,
    messages,
    tools,
    stopWhen: isStepCount(1),
    onStepFinish: ({ toolCalls: calls }) => {
      for (const c of calls) {
        toolCalls.push({
          toolCallId: c.toolCallId,
          toolName: c.toolName,
          input: c.input,
        });
      }
    },
  });

  return { textStream: result.textStream, toolCalls };
}

/**
 * Build a chat toolset for the manual loop: schema-only tools (so the SDK
 * never auto-executes) plus a map of `name -> execute(input, toolCallId)`
 * closures. Sensitivity is intentionally NOT applied here — the caller loads
 * `toolSensitivity` separately and decides whether to execute or pause.
 */
export interface ChatTools {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schemas: Record<string, any>;
  executors: Record<
    string,
    (input: unknown, toolCallId: string) => Promise<unknown> | unknown
  >;
}

export function buildChatTools(context: AgentContext): ChatTools {
  const tools = buildTools(context) as Record<
    string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >;
  const schemas: ChatTools["schemas"] = {};
  const executors: ChatTools["executors"] = {};

  for (const [name, t] of Object.entries(tools)) {
    schemas[name] = {
      description: t.description,
      inputSchema: t.inputSchema ?? t.parameters,
    };
    if (typeof t.execute === "function") {
      executors[name] = (input: unknown, toolCallId: string) =>
        t.execute(input, { toolCallId });
    }
  }

  return { schemas, executors };
}
