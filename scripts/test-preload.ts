import "./lib/polyfill";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_KEY } from "./lib/config";
import { chat } from "@trigger.dev/sdk/ai";
import { runs } from "@trigger.dev/sdk/v3";

const API_BASE = "https://api.trigger.dev";

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data: session, error } = await supabase
    .from("chat_sessions")
    .insert({ doctor_id: "c403bcf2-cf51-41c7-b4f8-93ec214c001b", title: "preload-repro" })
    .select()
    .single();
  if (error || !session) throw new Error("create session: " + error?.message);
  const chatId = session.id as string;
  console.log("Session created:", chatId);

  const start = chat.createStartSessionAction("doctor-chat");
  const result = await start({
    chatId,
    clientData: { doctorId: "c403bcf2-cf51-41c7-b4f8-93ec214c001b" },
  });
  console.log("Started (preload), sessionId:", result.sessionId, "runId:", result.runId);

  // Read the .out stream briefly to catch any error events during preload
  const res = await fetch(`${API_BASE}/realtime/v1/sessions/${result.sessionId}/out`, {
    headers: { Authorization: `Bearer ${result.publicAccessToken}`, Accept: "text/event-stream" },
  });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
  }
  console.log("STREAM BUFFER:", buffer.slice(0, 1000));

  // Poll run status
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const run: any = await runs.retrieve(result.runId);
    console.log(`  run[${i}] status=${run.status} err=${JSON.stringify(run.error)?.slice(0, 300) ?? "none"}`);
    if (run.status === "COMPLETED" || run.status === "FAILED" || run.status === "CANCELED") break;
  }

  await supabase.from("chat_sessions").delete().eq("id", chatId);
  console.log("cleaned up");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
