// Supabase `createClient` (v2.112+) eagerly builds a Realtime client, which
// needs a `WebSocket` constructor. Node < 22 has no native global WebSocket,
// so provide one via the `ws` package before any Supabase client is created.
import WebSocket from "ws";

if (typeof globalThis.WebSocket === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).WebSocket = WebSocket;
}
