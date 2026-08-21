import "./lib/polyfill";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, TEST_DOCTOR_ID } from "./lib/config";

import {
  listOutlookMessages, getOutlookMessage, getOutlookAttachment, listOutlookFolders,
  listOutlookDrafts, listOutlookCategories, searchOutlookMessages,
  createOutlookDraft, createOutlookCategory, deleteOutlookCategory,
  createOutlookFolder,
} from "@repo/agent/microsoft/mail";
import { listOutlookEvents, getOutlookEvent, createOutlookEvent, updateOutlookEvent, deleteOutlookEvent } from "@repo/agent/microsoft/calendar";
import {
  searchOneDrive, listOneDriveItems, getOneDriveItem, downloadOneDriveFile, readOneDriveFile,
  uploadOneDriveFile, deleteOneDriveItem, shareOneDriveItem, moveOneDriveItem, createOneDriveFolder,
} from "@repo/agent/microsoft/drive";
import {
  listOutlookContacts, searchOutlookContacts, getOutlookContact, createOutlookContact,
  updateOutlookContact, deleteOutlookContact, listOutlookContactFolders, createOutlookContactFolder,
} from "@repo/agent/microsoft/contacts";
import {
  listTodoLists, createTodoList, getTodoList, updateTodoList, deleteTodoList,
  listTodoTasks, createTodoTask, getTodoTask, updateTodoTask, deleteTodoTask,
  listTodoChecklist, addTodoChecklistItem, updateTodoChecklistItem,
} from "@repo/agent/microsoft/todo";
import { searchM365 } from "@repo/agent/microsoft/search";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}` } },
});

let ok = 0, fail = 0;
async function assert(label: string, fn: () => Promise<unknown>) {
  try {
    const r = await fn();
    console.log(`  ✅ ${label}`);
    ok++;
    return r;
  } catch (e) {
    console.log(`  ❌ ${label}: ${(e as Error).message}`);
    fail++;
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const filter = args[0] ?? "all";

  console.log("=== MICROSOFT 365 FULL TOOL TEST ===");
  console.log("Doctor:", TEST_DOCTOR_ID);
  console.log("Filter:", filter);

  if (filter === "all" || filter === "mail") await testMail();
  if (filter === "all" || filter === "calendar") await testCalendar();
  if (filter === "all" || filter === "drive") await testDrive();
  if (filter === "all" || filter === "contacts") await testContacts();
  if (filter === "all" || filter === "todo") await testTodo();
  if (filter === "all" || filter === "search") await testSearch();

  console.log(`\n=== RESULTS: ${ok} passed, ${fail} failed ===`);
  if (fail > 0) process.exit(1);
}

async function testMail() {
  console.log("\n--- Outlook Mail ---");

  const msgs = await assert("listOutlookMessages", () => listOutlookMessages(TEST_DOCTOR_ID, 3, undefined, supabase)) as { messages: { id: string; attachments?: { id: string }[] }[] } | null;
  if (msgs?.messages?.length) {
    const msgId = msgs.messages[0].id;
    await assert("getOutlookMessage", () => getOutlookMessage(TEST_DOCTOR_ID, msgId, supabase));
    const full = await getOutlookMessage(TEST_DOCTOR_ID, msgId, supabase) as { attachments?: { id: string }[] };
    if (full?.attachments?.length) {
      await assert("getOutlookAttachment", () => getOutlookAttachment(TEST_DOCTOR_ID, msgId, full.attachments[0].id, supabase));
    } else {
      console.log("  ⚠️  getOutlookAttachment: skipped (no attachments on first message)");
    }
  }
  await assert("listOutlookFolders", () => listOutlookFolders(TEST_DOCTOR_ID, supabase));
  await assert("listOutlookDrafts", () => listOutlookDrafts(TEST_DOCTOR_ID, 3, supabase));
  await assert("listOutlookCategories", () => listOutlookCategories(TEST_DOCTOR_ID, supabase));
  await assert("searchOutlookMessages", () => searchOutlookMessages(TEST_DOCTOR_ID, "hello", supabase));

  await assert("createOutlookDraft", () => createOutlookDraft(TEST_DOCTOR_ID, { subject: "test draft", to: "test@test.com", body: "test" }, supabase));

  const cat = await assert("createOutlookCategory", () => createOutlookCategory(TEST_DOCTOR_ID, "TestCat", "preset0", supabase)) as { categoryId: string } | null;
  if (cat?.categoryId) {
    await assert("deleteOutlookCategory", () => deleteOutlookCategory(TEST_DOCTOR_ID, cat.categoryId, supabase));
  }

  const folderName = `TestFolder_${Date.now()}`;
  await assert("createOutlookFolder", () => createOutlookFolder(TEST_DOCTOR_ID, folderName, undefined, supabase));
}

async function testCalendar() {
  console.log("\n--- Outlook Calendar ---");

  await assert("listOutlookEvents", () => listOutlookEvents(TEST_DOCTOR_ID, 7, 5, supabase));

  const start = new Date(Date.now() + 60000).toISOString();
  const end = new Date(Date.now() + 120000).toISOString();
  const evt = await assert("createOutlookEvent", () => createOutlookEvent(TEST_DOCTOR_ID, "Test Event", start, end, undefined, undefined, supabase)) as { eventId: string } | null;

  if (evt?.eventId) {
    await assert("getOutlookEvent", () => getOutlookEvent(TEST_DOCTOR_ID, evt.eventId, supabase));
    await assert("updateOutlookEvent", () => updateOutlookEvent(TEST_DOCTOR_ID, evt.eventId, { summary: "Test Event Updated" }, supabase));
    await assert("deleteOutlookEvent", () => deleteOutlookEvent(TEST_DOCTOR_ID, evt.eventId, supabase));
  }
}

async function testDrive() {
  console.log("\n--- OneDrive ---");

  await assert("searchOneDrive", () => searchOneDrive(TEST_DOCTOR_ID, "report", supabase));
  const items = await assert("listOneDriveItems", () => listOneDriveItems(TEST_DOCTOR_ID, {}, supabase)) as { items: { id: string; isFolder: boolean }[] } | null;

  const itemId = items?.items?.[0]?.id;
  const isFolder = items?.items?.[0]?.isFolder;
  if (itemId) {
    await assert("getOneDriveItem", () => getOneDriveItem(TEST_DOCTOR_ID, { fileId: itemId }, supabase));
    if (!isFolder) {
      await assert("downloadOneDriveFile", () => downloadOneDriveFile(TEST_DOCTOR_ID, { fileId: itemId }, supabase));
      await assert("readOneDriveFile", () => readOneDriveFile(TEST_DOCTOR_ID, itemId, supabase));
    }
  } else {
    console.log("  ⚠️  getOneDriveItem/download/read: skipped (empty drive)");
  }

  const folderName = `TestFolder_${Date.now()}`;
  const folder = await assert("createOneDriveFolder", () => createOneDriveFolder(TEST_DOCTOR_ID, folderName, {}, supabase)) as { folderId: string } | null;
  if (folder?.folderId) {
    const file = await assert("uploadOneDriveFile", () => uploadOneDriveFile(TEST_DOCTOR_ID, { name: "test.txt", content: Buffer.from("hello").toString("base64"), contentType: "text/plain" }, { parentId: folder.folderId }, supabase)) as { fileId: string } | null;
    if (file?.fileId) {
      await assert("shareOneDriveItem", () => shareOneDriveItem(TEST_DOCTOR_ID, { fileId: file.fileId, type: "view" }, supabase));
      const moved = await assert("moveOneDriveItem", () => moveOneDriveItem(TEST_DOCTOR_ID, { fileId: file.fileId, destinationId: folder.folderId, newName: "test_moved.txt" }, supabase)) as { fileId: string } | null;
      if (moved?.fileId) {
        await assert("deleteOneDriveItem", () => deleteOneDriveItem(TEST_DOCTOR_ID, { fileId: moved.fileId }, supabase));
      }
    }
    await assert("deleteOneDriveItem", () => deleteOneDriveItem(TEST_DOCTOR_ID, { fileId: folder.folderId }, supabase));
  }
}

async function testContacts() {
  console.log("\n--- Outlook Contacts ---");

  await assert("listOutlookContacts", () => listOutlookContacts(TEST_DOCTOR_ID, {}, supabase));
  await assert("searchOutlookContacts", () => searchOutlookContacts(TEST_DOCTOR_ID, "test", supabase));
  await assert("listOutlookContactFolders", () => listOutlookContactFolders(TEST_DOCTOR_ID, 50, supabase));

  const contact = await assert("createOutlookContact", () => createOutlookContact(TEST_DOCTOR_ID, {
    givenName: "Test",
    surname: "Contact",
    emailAddresses: "test@test.com",
  }, supabase)) as { contactId: string } | null;

  if (contact?.contactId) {
    await assert("getOutlookContact", () => getOutlookContact(TEST_DOCTOR_ID, contact.contactId, supabase));
    await assert("updateOutlookContact", () => updateOutlookContact(TEST_DOCTOR_ID, contact.contactId, { companyName: "Test Corp" }, supabase));
    await assert("deleteOutlookContact", () => deleteOutlookContact(TEST_DOCTOR_ID, contact.contactId, supabase));
  }

  await assert("createOutlookContactFolder", () => createOutlookContactFolder(TEST_DOCTOR_ID, `TestContactFolder_${Date.now()}`, undefined, supabase));
}

async function testTodo() {
  console.log("\n--- Microsoft To Do ---");

  await assert("listTodoLists", () => listTodoLists(TEST_DOCTOR_ID, 50, supabase));

  const list = await assert("createTodoList", () => createTodoList(TEST_DOCTOR_ID, "TestList", supabase)) as { listId: string } | null;
  if (list?.listId) {
    const listId = list.listId;
    await assert("getTodoList", () => getTodoList(TEST_DOCTOR_ID, listId, supabase));
    await assert("updateTodoList", () => updateTodoList(TEST_DOCTOR_ID, listId, "TestList Renamed", supabase));
    await assert("listTodoTasks", () => listTodoTasks(TEST_DOCTOR_ID, listId, {}, supabase));

    const task = await assert("createTodoTask", () => createTodoTask(TEST_DOCTOR_ID, listId, { title: "Test Task" }, supabase)) as { taskId: string } | null;
    if (task?.taskId) {
      await assert("getTodoTask", () => getTodoTask(TEST_DOCTOR_ID, listId, task.taskId, supabase));
      await assert("updateTodoTask", () => updateTodoTask(TEST_DOCTOR_ID, listId, task.taskId, { status: "inProgress" }, supabase));

      await assert("listTodoChecklist", () => listTodoChecklist(TEST_DOCTOR_ID, listId, task.taskId, supabase));
      const chk = await assert("addTodoChecklistItem", () => addTodoChecklistItem(TEST_DOCTOR_ID, listId, task.taskId, "Check item", supabase)) as { itemId: string } | null;
      if (chk?.itemId) {
        await assert("updateTodoChecklistItem", () => updateTodoChecklistItem(TEST_DOCTOR_ID, listId, task.taskId, chk.itemId, { isChecked: true }, supabase));
      }

      await assert("deleteTodoTask", () => deleteTodoTask(TEST_DOCTOR_ID, listId, task.taskId, supabase));
    }

    await assert("deleteTodoList", () => deleteTodoList(TEST_DOCTOR_ID, listId, supabase));
  }
}

async function testSearch() {
  console.log("\n--- Microsoft Search ---");

  const result = await assert("searchM365", () => searchM365(TEST_DOCTOR_ID, { query: "test", entityTypes: ["message", "driveItem", "person"] }, supabase)) as { results: unknown[] } | null;
  console.log("  search results count:", result?.results?.length ?? 0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});