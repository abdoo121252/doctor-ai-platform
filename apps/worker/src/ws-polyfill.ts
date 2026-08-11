import WebSocket from "ws";

// Node.js 20 has no native WebSocket. @supabase/supabase-js v2.112+ (and
// @ai-sdk/react transports) require globalThis.WebSocket. The worker runs
// tasks on Node 20, so polyfill it here before any Supabase client is
// created. Must be imported before any @repo/agent / supabase usage.
if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as unknown as { WebSocket?: typeof WebSocket }).WebSocket = WebSocket;
}
