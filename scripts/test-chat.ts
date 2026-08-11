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
 * Talks to the agent through POST /api/chat like a human would.
 *
 * Usage:
 *   pnpm test:chat                       -> default scenario (new session)
 *   pnpm test:chat "message"             -> single custom message (new session)
 *   pnpm test:chat -n 3 "msg"            -> repeat 3 times (new session)
 *   pnpm test:chat --session-id <uuid>   -> continue existing session
 *   pnpm test:chat --session-id <uuid> "msg" -> send to existing session
 */

async function main() {
  const args = process.argv.slice(2);

  let sessionId: string | null = null;
  let scenarioArgs: string[] = [];

  // parse --session-id flag
  let i = 0;
  while (i < args.length) {
    if (args[i] === "--session-id" && i + 1 < args.length) {
      sessionId = args[i + 1];
      i += 2;
    } else {
      scenarioArgs.push(args[i]);
      i++;
    }
  }

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
  if (sessionId) console.log("Session:", sessionId);
  console.log("");

  let scenario: string[];
  if (scenarioArgs.length === 0) {
    scenario = [
      "Hello, who are you and what can you help me with?",
      "Read my latest 2 emails and summarize them.",
      "Now check my calendar for the next 7 days.",
    ];
    console.log("Scenario: (default 3-turn conversation)\n");
  } else if (scenarioArgs[0] === "-n" && scenarioArgs.length >= 3) {
    const n = parseInt(scenarioArgs[1], 10);
    const msg = scenarioArgs.slice(2).join(" ");
    scenario = Array.from({ length: n }, () => msg);
  } else {
    scenario = [scenarioArgs.join(" ")];
  }

  let currentSessionId = sessionId;

  for (const message of scenario) {
    console.log("──────────────────────────────────────────────");
    console.log(`YOU: ${message}\n`);
    const reply = await sendMessage(authCookie, message, currentSessionId);
    if (!reply) {
      console.log("  ❌ FAILED — no reply (see error above)\n");
      process.exit(1);
    }

    if (reply.sessionId) {
      currentSessionId = reply.sessionId;
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

  if (currentSessionId) {
    console.log(`Session: ${currentSessionId} (${scenario.length} turns)`);
  }
  console.log("──────────────────────────────────────────────");
  console.log(`DONE — ${scenario.length} turn(s) completed.`);
}

async function sendMessage(
  authCookie: string,
  message: string,
  sessionId: string | null
): Promise<{ text: string; steps: any[]; sessionId?: string } | null> {
  const body: Record<string, unknown> = { message, sessionType: "chat" };
  if (sessionId) {
    body.sessionId = sessionId;
  }

  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: authCookie,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const resBody = await res.json().catch(() => ({}));
    console.log(`  ❌ HTTP ${res.status}:`, JSON.stringify(resBody).slice(0, 300));
    return null;
  }

  if (!res.body) return null;

  // Parse SSE stream: {type:"text"|"done"|"error", ...}
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let steps: any[] = [];
  let doneSessionId: string | undefined;
  let done = false;

  while (true) {
    const { done: readerDone, value } = await reader.read();
    if (readerDone) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const rawEvent of events) {
      const line = rawEvent.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      const data = JSON.parse(line.slice(6));

      if (data.type === "text") {
        text += data.text;
      } else if (data.type === "error") {
        console.log(`  ❌ Stream error: ${data.error}`);
        return null;
      } else if (data.type === "done") {
        done = true;
        text = data.text ?? text;
        steps = data.steps ?? steps;
        doneSessionId = data.sessionId;
      }
    }
  }

  if (!done) return null;
  return { text, steps, sessionId: doneSessionId };
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
