import "./lib/polyfill";
import { loadToolSensitivity } from "@repo/agent";

console.log("step 1: module loaded");

async function main() {
  console.log("step 2: calling loadToolSensitivity");
  const t0 = Date.now();
  try {
    const r = await loadToolSensitivity("3a8f5d9f-d667-4494-a044-11252eaff411");
    console.log("resolved in", Date.now() - t0, "ms:", Object.keys(r).length, "tools");
  } catch (e) {
    console.log("threw in", Date.now() - t0, "ms:", (e as Error).message);
  }
  console.log("step 3: done");
}

main().catch((e) => console.log("main error:", e.message));
