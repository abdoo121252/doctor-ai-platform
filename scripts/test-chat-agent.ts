import "./lib/polyfill";
import { createClient } from "@supabase/supabase-js";
import {
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  TEST_DOCTOR_ID,
} from "./lib/config";
import { chat } from "@trigger.dev/sdk/ai";
import { runs } from "@trigger.dev/sdk/v3";

const CHAT_TASK_ID = "doctor-chat";
const API_BASE = "https://api.trigger.dev";

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // 1. Create a chat session row for the test doctor
  const { data: session, error } = await supabase
    .from("chat_sessions")
    .insert({ doctor_id: TEST_DOCTOR_ID })
    .select()
    .single();

  if (error || !session) {
    console.log("CREATE SESSION FAILED:", error?.message);
    process.exit(1);
  }
  const chatId = session.id as string;
  console.log("Session created:", chatId);

  // 2. Start the Trigger.dev chat session (creates the run + PAT)
  const start = chat.createStartSessionAction(CHAT_TASK_ID);
  const result = await start({
    chatId,
    clientData: { doctorId: TEST_DOCTOR_ID },
    triggerConfig: {
      basePayload: {
        chatId,
        trigger: "submit-message",
        message: {
          id: `u_${Date.now()}`,
          role: "user",
          parts: [{ type: "text", text: "Reply with exactly: chat-agent-ok" }],
        },
      },
    },
  });
  const pat = result.publicAccessToken;
  const sessionId = result.sessionId;
  console.log("Start session OK, sessionId:", sessionId, "runId:", result.runId);

  // 4. Open the .out SSE stream FIRST so we don't miss any chunks
  console.log("Opening stream...");
  const res = await fetch(`${API_BASE}/realtime/v1/sessions/${sessionId}/out`, {
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: "text/event-stream",
      "Timeout-Seconds": "55",
    },
  });
  if (!res.ok || !res.body) {
    console.log("Stream open failed:", res.status, await res.text());
    process.exit(1);
  }

  const msgId = `u_${Date.now()}`;
  void msgId;
  console.log("First message sent via basePayload");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let sawTurnComplete = false;
  const deadline = Date.now() + 60000;

  while (Date.now() < deadline) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const evt of events) {
      const dataLine = evt.split("\n").find((l) => l.startsWith("data: "));
      if (!dataLine) continue;
      const payload = dataLine.slice(6).trim();
      if (payload === "[DONE]") continue;
      try {
        const parsed = JSON.parse(payload);
        for (const rec of parsed.records ?? []) {
          if (!rec.body) continue;
          try {
            const inner = JSON.parse(rec.body);
            const chunk = inner.data;
            if (chunk?.type === "text-delta" && typeof chunk.delta === "string") {
              text += chunk.delta;
            }
            if (chunk?.type === "step-finish" || chunk?.type === "finish") {
              sawTurnComplete = true;
            }
          } catch {
            // control records have empty/opaque body
          }
        }
      } catch {
        // ignore
      }
    }
    if (sawTurnComplete && text.length > 0) break;
  }

  console.log("Saw turn complete:", sawTurnComplete);
  console.log("RESPONSE TEXT:", JSON.stringify(text));

  // Poll the run to confirm completion / capture errors
  try {
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const run = await runs.retrieve(result.runId);
      console.log(`  run[${i}] status=${run.status}`);
      if (run.status === "COMPLETED") {
        console.log("  output:", JSON.stringify(run.output)?.slice(0, 300));
        break;
      }
      if (run.status === "FAILED" || run.status === "CANCELED") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        console.log("  end state:", run.status, JSON.stringify((run as any).error)?.slice(0, 400));
        break;
      }
      if (i === 9) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        console.log("  FULL RUN:", JSON.stringify(run, (k, v) => (typeof v === "string" && v.length > 200 ? v.slice(0, 200) : v)).slice(0, 1500));
      }
    }
  } catch (e) {
    console.log("  run retrieve err:", (e as Error).message);
  }

  // 5. Cleanup the test session
  await supabase.from("chat_sessions").delete().eq("id", chatId);
  console.log("Cleaned up test session");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
