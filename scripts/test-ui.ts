import "./lib/polyfill";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  TEST_EMAIL,
  TEST_PASSWORD,
  TEST_DOCTOR_ID,
} from "./lib/config";

const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const SCREENSHOT_DIR = "logs/screenshots";

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

async function main() {
  const args = process.argv.slice(2);
  const only = args[0] ?? "all";
  console.log("=== UI TEST (headless browser) ===");
  console.log("Base URL:", BASE_URL);
  console.log("User:", TEST_EMAIL);

  mkdirSync(SCREENSHOT_DIR, { recursive: true });

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

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([
    { name: cookieName, value: cookieValue, domain: "localhost", path: "/" },
  ]);
  const page = await context.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("  [browser console.error]", msg.text());
  });

  try {
    if (only === "all" || only === "chat") await testChat(page);
    if (only === "all" || only === "settings") await testSettings(page);
    if (only === "all" || only === "logs") await testLogs(page);
    if (only === "all" || only === "tasks") await testTasks(page);
    if (only === "all" || only === "review") await testReview(page);
    if (only === "all" || only === "nav") await testNav(page);
  } finally {
    await browser.close();
  }

  console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

async function goto(page: import("playwright").Page, path: string, name: string) {
  const res = await page.goto(`${BASE_URL}${path}`, { waitUntil: "networkidle", timeout: 60000 });
  const status = res?.status() ?? 0;
  if (status >= 400) {
    bad(`${name} loaded (status ${status})`);
    return false;
  }
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${path.replaceAll("/", "_")}.png` });
  return true;
}

async function testChat(page: import("playwright").Page) {
  console.log("\n--- Chat: talk to the agent like a human ---");
  if (!(await goto(page, "/chat", "chat page"))) return;
  ok("chat page loads");

  await page.waitForSelector('input[placeholder*="Ask about emails"]', { timeout: 30000 });
  ok("chat input present");

  const input = page.locator('input[placeholder*="Ask about emails"]');
  await input.fill("Read my latest 2 emails and tell me who they are from");
  await page.screenshot({ path: `${SCREENSHOT_DIR}/chat_typed.png` });

  await page.keyboard.press("Enter");
  ok("message sent (Enter pressed)");

  await page.waitForFunction(
    () => {
      const text = document.body.innerText;
      return text.includes("Error") === false && document.querySelectorAll('[class*="animate-spin"]').length === 0;
    },
    null,
    { timeout: 120000 }
  ).catch(() => {});

  await page.waitForTimeout(3000);

  const bodyText = await page.locator("body").innerText();
  const hasToolCall = await page.locator("text=Tool calls").count();

  if (bodyText.includes("Error:")) {
    bad("agent replied without error", "saw 'Error:' in the chat");
  } else {
    ok("agent replied without error");
  }

  if (hasToolCall > 0) {
    ok("tool call card shown (readEmails ran)");
  } else {
    bad("tool call card shown");
  }

  await page.screenshot({ path: `${SCREENSHOT_DIR}/chat_reply.png`, fullPage: false });
  const assistantMsg = bodyText.split("\n").filter((l) => l.trim()).slice(-15);
  console.log("  Reply preview:", assistantMsg.slice(0, 8).join(" | "));
}

async function testSettings(page: import("playwright").Page) {
  console.log("\n--- Settings page ---");
  if (!(await goto(page, "/settings", "settings page"))) return;
  await page.waitForSelector("text=Google Account Connection", { timeout: 30000 });
  ok("settings page renders Google Account Connection");

  const hasConnected = await page.locator("text=Connected").count();
  const hasConnectBtn = await page.locator("button:has-text('Reconnect Google Account')").count();
  if (hasConnected > 0 && hasConnectBtn > 0) {
    ok("shows Connected state + Reconnect button");
  } else if (hasConnectBtn > 0) {
    ok("shows Connect button (not connected)");
  } else {
    bad("connection status rendered");
  }

  const serviceCount = await page.locator("text=Gmail").count();
  if (serviceCount > 0) ok("service status rows shown (Gmail)");
  else bad("service status rows shown");
}

async function testLogs(page: import("playwright").Page) {
  console.log("\n--- Logs page ---");
  if (!(await goto(page, "/logs", "logs page"))) return;
  await page.waitForTimeout(4000);
  const hasEmpty = await page.locator("text=No logs yet").count();
  const cardCount = await page.locator("[class*='border-l-4']").count();
  if (cardCount > 0) {
    ok(`log entries rendered (${cardCount} cards)`);
  } else if (hasEmpty > 0) {
    bad("log entries rendered", "no entries for this user");
  } else {
    bad("log entries rendered");
  }

  const hasLevelFilter = await page.locator("select").count();
  if (hasLevelFilter > 0) ok("level filter dropdown present");
  else bad("level filter dropdown present");
}

async function testTasks(page: import("playwright").Page) {
  console.log("\n--- Tasks page ---");
  if (!(await goto(page, "/tasks", "tasks page"))) return;
  await page.waitForTimeout(3000);
  const hasTasks = await page.locator("text=Scheduled Tasks").count();
  const hasEvents = await page.locator("text=Event Triggers").count();
  if (hasTasks > 0 && hasEvents > 0) ok("Scheduled Tasks + Event Triggers sections render");
  else bad("Scheduled Tasks + Event Triggers sections render");

  const newTaskBtn = page.locator("button:has-text('New Task')");
  if ((await newTaskBtn.count()) > 0) {
    await newTaskBtn.click();
    await page.waitForSelector('input[placeholder*="Task name"]', { timeout: 10000 });
    await page.fill('input[placeholder*="Task name"]', "UI Test Task");
    await page.fill('textarea[placeholder*="Instructions for the AI agent"]', "Read latest email and summarize");
    await page.screenshot({ path: `${SCREENSHOT_DIR}/tasks_form_filled.png` });
    await page.locator('button:has-text("Create")').click();
    await page.waitForTimeout(3000);
    const created = await page.locator("text=UI Test Task").count();
    if (created > 0) ok("created a new scheduled task via UI");
    else bad("created a new scheduled task via UI");
  } else {
    bad("New Task button present");
  }
}

async function testReview(page: import("playwright").Page) {
  console.log("\n--- Review page ---");
  if (!(await goto(page, "/review", "review page"))) return;
  await page.waitForTimeout(3000);
  const hasTitle = await page.locator("text=Awaiting Review").count();
  if (hasTitle > 0) ok("review page renders");
  else bad("review page renders");
  const emptyText = await page.locator("text=No pending approvals").count();
  console.log(`  (pending approvals: ${emptyText > 0 ? "none" : "some"})`);
}

async function testNav(page: import("playwright").Page) {
  console.log("\n--- Sidebar navigation ---");
  if (!(await goto(page, "/chat", "chat page for nav"))) return;
  const links = page.locator("nav a");
  const labels = ["Chat", "Review", "Tasks", "Settings"];
  let allFound = true;
  for (const label of labels) {
    if ((await page.locator(`nav a:has-text("${label}")`).count()) === 0) {
      allFound = false;
      bad(`nav link "${label}"`);
    }
  }
  if (allFound) ok("all 4 sidebar nav links present");
  const email = await page.locator("text=test.doctor.local@example.com").count();
  if (email > 0) ok("user email shown in sidebar");
  else bad("user email shown in sidebar");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
