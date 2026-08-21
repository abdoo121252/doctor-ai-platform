import "./lib/polyfill";
import { createClient } from "@supabase/supabase-js";
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  TEST_DOCTOR_ID,
} from "./lib/config";
import { listMessages, sendMessage } from "@repo/agent/google/gmail";
import { listEvents, insertEvent } from "@repo/agent/google/calendar";
import { searchFiles } from "@repo/agent/google/drive";
import { getSheetValues } from "@repo/agent/google/sheets";
import { filterMatchesCondition, routeEventToPath } from "@repo/agent";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}` } },
});

async function main() {
  const args = process.argv.slice(2);
  const only = args[0] ?? "all";
  console.log("=== AGENT TOOL TEST ===");
  console.log("Doctor:", TEST_DOCTOR_ID);
  console.log("Test:", only);

  if (only === "all" || only === "gmail") await testGmail();
  if (only === "all" || only === "calendar") await testCalendar();
  if (only === "all" || only === "drive") await testDrive();
  if (only === "all" || only === "sheets") await testSheets();
  if (only === "all" || only === "filter") await testFilter();
}

async function testGmail() {
  console.log("\n--- Gmail ---");
  try {
    const emails = await listMessages(TEST_DOCTOR_ID, 3, undefined, supabase);
    console.log("READ EMAILS OK:", JSON.stringify(emails, null, 2).slice(0, 800));
  } catch (err) {
    console.log("READ EMAILS FAILED:", (err as Error).message);
  }

  try {
    const sent = await sendMessage(
      TEST_DOCTOR_ID,
      "a.abdalziad@gmail.com",
      "[Local Test] Hello from agent test",
      "<p>This is a <b>test</b> email sent from the local test harness.</p>",
      supabase
    );
    console.log("SEND EMAIL OK:", JSON.stringify(sent));
  } catch (err) {
    console.log("SEND EMAIL FAILED:", (err as Error).message);
  }
}

async function testCalendar() {
  console.log("\n--- Calendar ---");
  try {
    const events = await listEvents(TEST_DOCTOR_ID, 7, 5, supabase);
    console.log("READ CALENDAR OK:", JSON.stringify(events, null, 2).slice(0, 600));
  } catch (err) {
    console.log("READ CALENDAR FAILED:", (err as Error).message);
  }

  try {
    const start = new Date(Date.now() + 3600_000).toISOString();
    const end = new Date(Date.now() + 2 * 3600_000).toISOString();
    const created = await insertEvent(
      TEST_DOCTOR_ID,
      "Local Test Event",
      start,
      end,
      undefined,
      "Created by local test harness",
      supabase
    );
    console.log("CREATE EVENT OK:", JSON.stringify(created));
  } catch (err) {
    console.log("CREATE EVENT FAILED:", (err as Error).message);
  }
}

async function testDrive() {
  console.log("\n--- Drive ---");
  try {
    const files = await searchFiles(TEST_DOCTOR_ID, "name contains 'report'", 5, supabase);
    console.log("SEARCH DRIVE OK:", JSON.stringify(files, null, 2).slice(0, 600));
  } catch (err) {
    console.log("SEARCH DRIVE FAILED:", (err as Error).message);
  }
}

async function testSheets() {
  console.log("\n--- Sheets ---");
  try {
    const values = await getSheetValues(TEST_DOCTOR_ID, "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms", "Sheet1!A1:C5", supabase);
    console.log("READ SHEET OK:", JSON.stringify(values, null, 2).slice(0, 600));
  } catch (err) {
    console.log("READ SHEET FAILED:", (err as Error).message);
  }
}

async function testFilter() {
  console.log("\n--- Semantic filter + path routing ---");

  const eventData = {
    from: "khalid@univ.edu",
    to: "professor@univ.edu",
    subject: "Trip plans and travel",
    snippet: "Dear professor, I arranged the رحلة trip for next week. Please confirm.",
    date: "2026-08-21T10:00:00Z",
    hasAttachment: false,
  };

  try {
    const { matches, reason } = await filterMatchesCondition(
      "email is from Khalid",
      eventData
    );
    console.log("filterMatchesCondition(from Khalid) ->", matches, "|", reason);
  } catch (err) {
    console.log("filterMatchesCondition FAILED:", (err as Error).message);
  }

  try {
    const { pathId, reason } = await routeEventToPath(
      [
        {
          id: "p_ahmed",
          name: "From Ahmed",
          filter: { mode: "ai", condition: "email is from Ahmed" },
          instructions: "Summarize the email",
        },
        {
          id: "p_trip",
          name: "Trip from Khalid",
          filter: {
            mode: "ai",
            condition: "email is from Khalid and contains the word trip",
          },
          instructions: "Send a thank-you note",
        },
        {
          id: "p_default",
          name: "Anything else",
          filter: { mode: "ai", condition: "" },
          instructions: "Just file it",
        },
      ],
      eventData
    );
    console.log("routeEventToPath ->", pathId, "|", reason);
    if (pathId === "p_trip") {
      console.log("ROUTE OK: picked p_trip (Khalid + trip)");
    } else {
      console.log("ROUTE MISMATCH: expected p_trip, got", pathId);
    }
  } catch (err) {
    console.log("routeEventToPath FAILED:", (err as Error).message);
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
