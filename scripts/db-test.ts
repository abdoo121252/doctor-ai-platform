import "./lib/polyfill";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_KEY, TEST_DOCTOR_ID } from "./lib/config";

async function main() {
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const t0 = Date.now();
  const r = await sb
    .from("tool_sensitivity_settings")
    .select("tool_name, sensitive")
    .eq("doctor_id", TEST_DOCTOR_ID);
  console.log("elapsed ms:", Date.now() - t0);
  console.log("error:", r.error?.message ?? "none");
  console.log("data:", JSON.stringify(r.data ?? null).slice(0, 200));
}

main();
