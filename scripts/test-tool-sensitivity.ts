import "./lib/polyfill";
import { createClient } from "@supabase/supabase-js";
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  TEST_EMAIL,
  TEST_PASSWORD,
} from "./lib/config";

const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";

async function call(method: string, path: string, cookie?: string, body?: unknown) {
  const headers: Record<string, string> = {};
  if (cookie) headers["Cookie"] = cookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (error || !data.session) {
    console.log("SIGN IN FAILED:", error?.message);
    process.exit(1);
  }
  const session = data.session;
  const projectRef = SUPABASE_URL.split(".")[0].replace("https://", "");
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
  const authCookie = `sb-${projectRef}-auth-token=${cookieValue}`;

  console.log("=== 1. GET /api/settings/tool-sensitivity ===");
  const get = await call("GET", "/api/settings/tool-sensitivity", authCookie);
  console.log(get.status, JSON.stringify(get.json).slice(0, 400));

  console.log("\n=== 2. PUT /api/settings/tool-sensitivity (toggle sendEmail) ===");
  const put = await call("PUT", "/api/settings/tool-sensitivity", authCookie, {
    toolName: "sendEmail",
    sensitive: false,
  });
  console.log(put.status, JSON.stringify(put.json));

  console.log("\n=== 3. GET again (verify persisted) ===");
  const get2 = await call("GET", "/api/settings/tool-sensitivity", authCookie);
  console.log(get2.status, JSON.stringify(get2.json).slice(0, 400));

  console.log("\n=== 4. GET /api/sessions ===");
  const sessions = await call("GET", "/api/sessions", authCookie);
  console.log(sessions.status, JSON.stringify(sessions.json).slice(0, 300));

  console.log("\n=== 5. GET /api/sessions/<id>/messages (resume state) ===");
  const list = sessions.json as Array<{ id: string }>;
  if (Array.isArray(list) && list.length > 0) {
    const msgs = await call("GET", `/api/sessions/${list[0].id}/messages`, authCookie);
    console.log(msgs.status, JSON.stringify(msgs.json).slice(0, 500));
  } else {
    console.log("(no sessions to test)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
