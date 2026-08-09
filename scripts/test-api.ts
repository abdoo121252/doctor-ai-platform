import "./lib/polyfill";
import { createClient } from "@supabase/supabase-js";
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  TEST_EMAIL,
  TEST_PASSWORD,
} from "./lib/config";

const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";

async function main() {
  const args = process.argv.slice(2);
  const only = args[0] ?? "all";
  console.log("=== E2E API TEST ===");
  console.log("Base URL:", BASE_URL);
  console.log("User:", TEST_EMAIL);
  console.log("Test:", only);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (error || !data.session) {
    console.log("SIGN IN FAILED:", error?.message ?? "no session");
    process.exit(1);
  }
  const token = data.session.access_token;
  const doctorId = data.session.user.id;
  const projectRef = SUPABASE_URL.split(".")[0].replace("https://", "");
  const cookieName = `sb-${projectRef}-auth-token`;
  const cookieValue = encodeURIComponent(
    JSON.stringify({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: Math.floor((Date.now() + 3600_000) / 1000),
      expires_in: 3600,
      token_type: "bearer",
      user: data.session.user,
    })
  );
  const authCookie = `${cookieName}=${cookieValue}`;
  console.log("SIGN IN OK:", doctorId);
  console.log("COOKIE:", cookieName);

  if (only === "all" || only === "chat") await testChat(authCookie, doctorId);
  if (only === "all" || only === "connection") await testConnection(authCookie);
  if (only === "all" || only === "logs") await testLogs(authCookie);
}

async function testChat(authCookie: string, doctorId: string) {
  console.log("\n--- Chat /api/chat ---");
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: authCookie,
    },
    body: JSON.stringify({
      message: "Read my latest 2 emails and summarize them",
      sessionType: "chat",
    }),
  });
  const body = await res.json();
  console.log("STATUS:", res.status);
  if (!res.ok) {
    console.log("ERROR:", JSON.stringify(body).slice(0, 500));
    return;
  }
  console.log("TEXT:", String(body.text).slice(0, 600));
  console.log(
    "STEPS:",
    (body.steps ?? [])
      .flatMap((s: any) => s.toolCalls ?? [])
      .map((t: any) => t.toolName)
      .join(", ") || "(none)"
  );
}

async function testConnection(authCookie: string) {
  console.log("\n--- Settings google-connection ---");
  const res = await fetch(`${BASE_URL}/api/settings/google-connection`, {
    headers: { Cookie: authCookie },
  });
  const body = await res.json().catch(() => ({}));
  console.log("STATUS:", res.status, JSON.stringify(body).slice(0, 400));
}

async function testLogs(authCookie: string) {
  console.log("\n--- Logs /api/logs ---");
  const res = await fetch(`${BASE_URL}/api/logs`, {
    headers: { Cookie: authCookie },
  });
  const body = await res.json().catch(() => ({}));
  console.log("STATUS:", res.status);
  console.log(
    "LOGS:",
    Array.isArray(body.logs) ? `${body.logs.length} entries` : JSON.stringify(body).slice(0, 300)
  );
  if (Array.isArray(body.logs) && body.logs.length > 0) {
    console.log("SAMPLE:", JSON.stringify(body.logs[0]));
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
