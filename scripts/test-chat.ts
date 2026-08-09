import "./lib/polyfill";
import { createClient } from "@supabase/supabase-js";
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  TEST_EMAIL,
  TEST_PASSWORD,
} from "./lib/config";

const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";

/**
 * CONVERSATION TEST
 * Talks to the agent through POST /api/chat like a human would,
 * keeping a rolling conversation history so follow-ups have context.
 *
 * Usage:
 *   pnpm test:chat                 -> default scenario
 *   pnpm test:chat "message"       -> send a single custom message
 *   pnpm test:chat -n 3 "msg"      -> repeat a message 3 times
 */

async function main() {
  const args = process.argv.slice(2);

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

  console.log("=== AGENT CONVERSATION TEST ===");
  console.log("User:", TEST_EMAIL);
  console.log("Endpoint: POST", `${BASE_URL}/api/chat`);
  console.log("");

  // Build scenario from args or use default
  let scenario: string[];
  if (args.length === 0) {
    scenario = [
      "Hello, who are you and what can you help me with?",
      "Read my latest 2 emails and summarize them.",
      "Now check my calendar for the next 7 days.",
    ];
    console.log("Scenario: (default 3-turn conversation)\n");
  } else if (args[0] === "-n" && args.length >= 3) {
    const n = parseInt(args[1], 10);
    const msg = args.slice(2).join(" ");
    scenario = Array.from({ length: n }, () => msg);
  } else {
    scenario = [args.join(" ")];
  }

  for (const message of scenario) {
    console.log("──────────────────────────────────────────────");
    console.log(`YOU: ${message}\n`);
    const reply = await sendMessage(authCookie, message);
    if (!reply) {
      console.log("  ❌ FAILED — no reply (see error above)\n");
      process.exit(1);
    }

    console.log(`ASSISTANT: ${reply.text}\n`);
    if (reply.steps?.length) {
      const toolCalls = reply.steps.flatMap((s) => s.toolCalls ?? []);
      if (toolCalls.length) {
        console.log(`  🛠️  Tool calls: ${toolCalls.map((t) => t.toolName).join(", ")}`);
        for (const tc of toolCalls) {
          console.log(`      ${tc.toolName}:`, JSON.stringify(tc.result).slice(0, 200));
        }
      }
      console.log("");
    }
  }

  console.log("──────────────────────────────────────────────");
  console.log(`DONE — ${scenario.length} turn(s) completed.`);
}

async function sendMessage(
  authCookie: string,
  message: string
): Promise<{ text: string; steps: any[] } | null> {
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: authCookie,
    },
    body: JSON.stringify({ message, sessionType: "chat" }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.log(`  ❌ HTTP ${res.status}:`, JSON.stringify(body).slice(0, 300));
    return null;
  }

  const data = await res.json();
  return { text: data.text, steps: data.steps };
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
