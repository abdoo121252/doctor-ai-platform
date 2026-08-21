import "./lib/polyfill";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_KEY } from "./lib/config";

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const chatId = process.argv[2] ?? "bbe9dfb0-93e4-4874-ad34-04f0434a51a2";

  const { data: sess, error: se } = await supabase
    .from("chat_sessions")
    .select("id, doctor_id, public_access_token, last_event_id, updated_at")
    .eq("id", chatId)
    .maybeSingle();
  console.log("SESSION:", se ? "ERR " + se.message : JSON.stringify(sess));

  const { data: msgs, error: me } = await supabase
    .from("conversations")
    .select("role, content, created_at")
    .eq("session_id", chatId)
    .order("created_at", { ascending: true });
  console.log("MSGS:", me ? "ERR " + me.message : msgs?.map((m) => `${m.role}: ${String(m.content).slice(0, 40)}`).join(" | ") || "NONE");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
