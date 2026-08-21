import "./lib/polyfill";
import { createClient } from "@supabase/supabase-js";
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_KEY,
  TEST_EMAIL,
  TEST_PASSWORD,
} from "./lib/config";

const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";

let passed = 0;
let failed = 0;

function ok(name: string) {
  passed++;
  console.log(`  ✅ ${name}`);
}

function bad(name: string, detail?: string) {
  failed++;
  console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
}

async function call(
  label: string,
  method: string,
  path: string,
  opts: { cookie?: string; body?: unknown } = {}
) {
  const headers: Record<string, string> = {};
  if (opts.cookie) headers["Cookie"] = opts.cookie;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  console.log(`  → ${method} ${path} => ${res.status} ${label}`);
  return { status: res.status, json };
}

async function main() {
  const args = process.argv.slice(2);
  const only = args[0] ?? "all";
  console.log("=== API TEST SUITE ===");
  console.log("Base URL:", BASE_URL);
  console.log("User:", TEST_EMAIL);
  console.log("Suite:", only);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (error || !data.session) {
    console.log("SIGN IN FAILED:", error?.message ?? "no session");
    process.exit(1);
  }
  const session = data.session;
  const projectRef = SUPABASE_URL.split(".")[0].replace("https://", "");
  const cookieName = `sb-${projectRef}-auth-token`;
  const cookieValue = encodeURIComponent(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: Math.floor((Date.now() + 3600_000) / 1000),
      expires_in: 3600,
      token_type: "bearer",
      user: session.user,
    })
  );
  const authCookie = `${cookieName}=${cookieValue}`;
  const doctorId = session.user.id;
  console.log("AUTH:", cookieName, "OK");

  // pass doctorId into approval test via global
  (globalThis as any).__DOCTOR_ID = doctorId;

  if (only === "all" || only === "auth") await testAuth();
  if (only === "all" || only === "settings") await testSettings(authCookie);
  if (only === "all" || only === "tasks") await testTasks(authCookie);
  if (only === "all" || only === "events") await testEvents(authCookie);
  if (only === "all" || only === "approvals") await testApprovals(authCookie);
  if (only === "all" || only === "logs") await testLogs(authCookie);

  console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

async function testAuth() {
  console.log("\n--- Auth / unauthorized ---");
  const res = await fetch(`${BASE_URL}/api/tasks`, { method: "GET", redirect: "manual" });
  if (res.status === 307) ok("middleware redirects unauthenticated API call to /login (307)");
  else bad("middleware redirects unauthenticated API call", `got ${res.status}`);
}

async function testSettings(authCookie: string) {
  console.log("\n--- Settings / google-connection ---");
  const conn = await call("", "GET", "/api/settings/google-connection", { cookie: authCookie });
  if (conn.status === 200 && conn.json.connection) {
    ok(`connection status: ${conn.json.connection.status}`);
  } else {
    bad("GET /api/settings/google-connection", `status ${conn.status}`);
  }

  console.log("\n--- Settings / google-connect (OAuth URL) ---");
  const oauth = await call("", "GET", "/api/settings/google-connect", { cookie: authCookie });
  const url = oauth.json?.url ?? "";
  if (oauth.status === 200 && url.startsWith("https://accounts.google.com")) {
    ok("google-connect returns valid OAuth URL");
    const redirectUri = decodeURIComponent(url.match(/redirect_uri=([^&]+)/)?.[1] ?? "");
    if (redirectUri === "http://localhost:3000/api/auth/google-callback") {
      ok("OAuth URL redirects to LOCALHOST callback");
    } else {
      bad("OAuth URL redirects to LOCALHOST callback", `redirect is: ${redirectUri}`);
    }
  } else {
    bad("GET /api/settings/google-connect", `status ${oauth.status}`);
  }
}

async function testTasks(authCookie: string) {
  console.log("\n--- Tasks CRUD ---");
  const list = await call("", "GET", "/api/tasks", { cookie: authCookie });
  if (list.status === 200 && Array.isArray(list.json.tasks)) ok("GET /api/tasks returns array");
  else bad("GET /api/tasks", `status ${list.status}`);

  const created = await call("", "POST", "/api/tasks", {
    cookie: authCookie,
    body: {
      name: `API Test Task ${Date.now()}`,
      cron_expression: "0 8 * * *",
      instructions: "Read today's emails and summarize urgent ones",
      timezone: "Asia/Riyadh",
    },
  });
  const task = created.json?.task;
  if (created.status === 201 && task?.id) {
    ok(`POST /api/tasks created id=${task.id.slice(0, 8)}`);
    if (task.timezone === "Asia/Riyadh") ok("POST /api/tasks stores timezone");
    else bad("POST /api/tasks stores timezone", `got ${task.timezone}`);
  } else {
    bad("POST /api/tasks", `status ${created.status} ${JSON.stringify(created.json).slice(0, 120)}`);
    return;
  }
  const taskId = task.id;

  const patched = await call("", "PATCH", `/api/tasks/${taskId}`, {
    cookie: authCookie,
    body: { enabled: false },
  });
  if (patched.status === 200 && patched.json.task?.enabled === false) ok("PATCH /api/tasks/:id disables task");
  else bad("PATCH /api/tasks/:id", `status ${patched.status}`);

  const del = await call("", "DELETE", `/api/tasks/${taskId}`, { cookie: authCookie });
  if (del.status === 200 && del.json.success === true) ok("DELETE /api/tasks/:id removes task");
  else bad("DELETE /api/tasks/:id", `status ${del.status}`);

  const reget = await call("", "GET", "/api/tasks", { cookie: authCookie });
  const stillThere = (reget.json.tasks ?? []).some((t: { id: string }) => t.id === taskId);
  if (!stillThere) ok("task confirmed removed from list");
  else bad("task confirmed removed from list");

  // One-off dates
  const oneOff = await call("", "POST", "/api/tasks", {
    cookie: authCookie,
    body: {
      name: `API One-off Task ${Date.now()}`,
      instructions: "Summarize on the given dates",
      schedule_type: "one_off_dates",
      dates: ["2099-01-13", "2099-01-16"],
      time: "09:00",
      timezone: "UTC",
    },
  });
  const oneOffTask = oneOff.json?.task;
  if (oneOff.status === 201 && oneOffTask?.id && oneOffTask?.schedule_type === "one_off_dates") {
    ok(`POST /api/tasks one-off created id=${oneOffTask.id.slice(0, 8)}`);
    const listRes = await call("", "GET", "/api/tasks", { cookie: authCookie });
    const fetched = (listRes.json.tasks ?? []).find((t: { id: string }) => t.id === oneOffTask.id);
    if (Array.isArray(fetched?.dates) && fetched.dates.length === 2) {
      ok("GET /api/tasks returns one-off dates");
    } else {
      bad("GET /api/tasks returns one-off dates", JSON.stringify(fetched?.dates));
    }
  } else {
    bad("POST /api/tasks one-off", `status ${oneOff.status} ${JSON.stringify(oneOff.json).slice(0, 160)}`);
    return;
  }

  const oneOffDel = await call("", "DELETE", `/api/tasks/${oneOffTask.id}`, { cookie: authCookie });
  if (oneOffDel.status === 200) ok("DELETE /api/tasks/:id removes one-off task");
  else bad("DELETE /api/tasks/:id removes one-off task", `status ${oneOffDel.status}`);
}

async function testEvents(authCookie: string) {
  console.log("\n--- Event Triggers CRUD ---");
  const list = await call("", "GET", "/api/events", { cookie: authCookie });
  if (list.status === 200 && Array.isArray(list.json.events)) ok("GET /api/events returns array");
  else bad("GET /api/events", `status ${list.status}`);

  const created = await call("", "POST", "/api/events", {
    cookie: authCookie,
    body: {
      name: `API Test Trigger ${Date.now()}`,
      event_source: "gmail_new_message",
      instructions: "Summarize the new email",
      filter_rules: { from: "admissions@univ.edu", subjectContains: "appeal" },
    },
  });
  const event = created.json?.event;
  if (created.status === 201 && event?.id) {
    ok(`POST /api/events created id=${event.id.slice(0, 8)}`);
    if (event.filter_rules?.from === "admissions@univ.edu" && event.filter_rules?.subjectContains === "appeal") {
      ok("POST /api/events stores filter_rules");
    } else {
      bad("POST /api/events stores filter_rules", JSON.stringify(event.filter_rules));
    }
  } else {
    bad("POST /api/events", `status ${created.status} ${JSON.stringify(created.json).slice(0, 120)}`);
    return;
  }
  const eventId = event.id;

  const badSource = await call("expected 400", "POST", "/api/events", {
    cookie: authCookie,
    body: { name: "x", event_source: "not_valid", instructions: "x" },
  });
  if (badSource.status === 400) ok("POST /api/events rejects invalid event_source");
  else bad("POST /api/events rejects invalid event_source", `got ${badSource.status}`);

  const patched = await call("", "PATCH", `/api/events/${eventId}`, {
    cookie: authCookie,
    body: { enabled: false },
  });
  if (patched.status === 200 && patched.json.event?.enabled === false) ok("PATCH /api/events/:id disables trigger");
  else bad("PATCH /api/events/:id", `status ${patched.status}`);

  const del = await call("", "DELETE", `/api/events/${eventId}`, { cookie: authCookie });
  if (del.status === 200 && del.json.success === true) ok("DELETE /api/events/:id removes trigger");
  else bad("DELETE /api/events/:id", `status ${del.status}`);

  // Microsoft source + new filter fields
  const ms = await call("", "POST", "/api/events", {
    cookie: authCookie,
    body: {
      name: `API OneDrive Trigger ${Date.now()}`,
      event_source: "onedrive_new_file",
      instructions: "Summarize the new OneDrive file",
      filter_rules: { mimeType: "application/pdf", folderId: "abc123" },
    },
  });
  const msEvent = ms.json?.event;
  if (ms.status === 201 && msEvent?.id && msEvent?.event_source === "onedrive_new_file") {
    ok("POST /api/events accepts onedrive_new_file source");
    if (msEvent.filter_rules?.mimeType === "application/pdf") ok("POST /api/events stores mimeType");
    else bad("POST /api/events stores mimeType", JSON.stringify(msEvent.filter_rules));
  } else {
    bad("POST /api/events onedrive source", `status ${ms.status} ${JSON.stringify(ms.json).slice(0, 160)}`);
    return;
  }
  const msDel = await call("", "DELETE", `/api/events/${msEvent.id}`, { cookie: authCookie });
  if (msDel.status === 200) ok("DELETE /api/events/:id removes onedrive trigger");
  else bad("DELETE /api/events/:id removes onedrive trigger", `status ${msDel.status}`);

  // Multi-path event trigger: two paths (one fields-mode, one AI-mode)
  const multiPath = await call("", "POST", "/api/events", {
    cookie: authCookie,
    body: {
      name: `API Paths Trigger ${Date.now()}`,
      event_source: "gmail_new_message",
      paths: [
        {
          id: "p1",
          name: "From Ahmed",
          filter: { mode: "fields", fields: { from: "ahmed@univ.edu" } },
          instructions: "Summarize the email from Ahmed",
        },
        {
          id: "p2",
          name: "Trip",
          filter: { mode: "ai", condition: "email is from Khalid and contains the word رحلة" },
          instructions: "Send a thank-you note",
        },
      ],
    },
  });
  const mpEvent = multiPath.json?.event;
  if (multiPath.status === 201 && mpEvent?.id) {
    ok("POST /api/events accepts multi-path trigger");
    const stored = mpEvent.paths;
    if (Array.isArray(stored) && stored.length === 2) {
      ok("POST /api/events stores 2 paths");
      if (stored[0]?.filter?.mode === "fields" && stored[1]?.filter?.mode === "ai") {
        ok("POST /api/events stores fields + ai path filters");
      } else {
        bad("POST /api/events stores fields + ai path filters", JSON.stringify(stored));
      }
      if (stored[0]?.name === "From Ahmed" && stored[1]?.instructions === "Send a thank-you note") {
        ok("POST /api/events stores path name + instructions");
      } else {
        bad("POST /api/events stores path name + instructions", JSON.stringify(stored));
      }
    } else {
      bad("POST /api/events stores 2 paths", JSON.stringify(stored));
    }
  } else {
    bad("POST /api/events multi-path", `status ${multiPath.status} ${JSON.stringify(multiPath.json).slice(0, 160)}`);
    return;
  }

  // PATCH paths
  const mpPatch = await call("", "PATCH", `/api/events/${mpEvent.id}`, {
    cookie: authCookie,
    body: {
      paths: [
        {
          name: "Updated path",
          filter: { mode: "ai", condition: "email mentions grading deadlines" },
          instructions: "Draft a reminder to students",
        },
      ],
    },
  });
  if (
    mpPatch.status === 200 &&
    Array.isArray(mpPatch.json.event?.paths) &&
    mpPatch.json.event.paths.length === 1 &&
    mpPatch.json.event.paths[0]?.name === "Updated path"
  ) {
    ok("PATCH /api/events/:id replaces paths");
  } else {
    bad("PATCH /api/events/:id replaces paths", `status ${mpPatch.status} ${JSON.stringify(mpPatch.json).slice(0, 160)}`);
  }

  const mpDel = await call("", "DELETE", `/api/events/${mpEvent.id}`, { cookie: authCookie });
  if (mpDel.status === 200) ok("DELETE /api/events/:id removes multi-path trigger");
  else bad("DELETE /api/events/:id removes multi-path trigger", `status ${mpDel.status}`);
}

async function testApprovals(authCookie: string) {
  console.log("\n--- Approvals ---");
  const list = await call("", "GET", "/api/approvals", { cookie: authCookie });
  if (list.status === 200 && Array.isArray(list.json.approvals)) ok("GET /api/approvals returns array");
  else bad("GET /api/approvals", `status ${list.status}`);

  const badPatch = await call("expected 400", "PATCH", `/api/approval/nonexistent`, {
    cookie: authCookie,
    body: { status: "maybe" },
  });
  if (badPatch.status === 400) ok("PATCH /api/approval/:id rejects invalid status");
  else bad("PATCH /api/approval/:id rejects invalid status", `got ${badPatch.status}`);

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const doctorId = (globalThis as any).__DOCTOR_ID as string;
  const { data: approval } = await service
    .from("approval_requests")
    .insert({
      doctor_id: doctorId,
      action_type: "send_email",
      action_payload: { to: "a.abdalziad@gmail.com", subject: "API Test Approval" },
      status: "pending",
    })
    .select()
    .single();

  if (!approval) {
    bad("insert pending approval via service key");
    return;
  }

  const approvalId = approval.id;
  const patch = await call("", "PATCH", `/api/approval/${approvalId}`, {
    cookie: authCookie,
    body: { status: "approved" },
  });
  if (patch.status === 200 && patch.json.success === true) ok("PATCH /api/approval/:id approves pending request");
  else bad("PATCH /api/approval/:id", `status ${patch.status}`);

  const patchAgain = await call("expected 409", "PATCH", `/api/approval/${approvalId}`, {
    cookie: authCookie,
    body: { status: "rejected" },
  });
  if (patchAgain.status === 409) ok("already-resolved approval returns 409");
  else bad("already-resolved approval returns 409", `got ${patchAgain.status}`);
}

async function testLogs(authCookie: string) {
  console.log("\n--- Logs ---");
  const test = await call("", "GET", "/api/logs/test", { cookie: authCookie });
  console.log("  log-test response:", JSON.stringify(test.json));
  if (test.status === 200 && test.json.authenticatedClient === "OK") ok("GET /api/logs/test authenticated client path OK");
  else bad("GET /api/logs/test authenticated client path OK", `got ${test.status}`);

  const list = await call("", "GET", "/api/logs?limit=20", { cookie: authCookie });
  if (list.status === 200 && Array.isArray(list.json.logs)) {
    ok(`GET /api/logs returns ${list.json.logs.length} entries`);
  } else {
    bad("GET /api/logs", `status ${list.status}`);
  }

  const errs = await call("", "GET", "/api/logs?level=error&limit=10", { cookie: authCookie });
  const allErrors = (errs.json.logs ?? []).every((l: { level: string }) => l.level === "error");
  if (errs.status === 200 && allErrors) ok("GET /api/logs?level=error filters correctly");
  else bad("GET /api/logs?level=error filters correctly", `got ${errs.status}`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
