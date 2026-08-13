export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initServerLogging } = await import("@/lib/server-logging");
    initServerLogging();
  }
}
