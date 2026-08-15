import { schedules } from "@trigger.dev/sdk/v3";
import { pingAutomationPoll } from "../dispatch";

/**
 * Thin scheduler only. All event polling, filtering, dedupe, and agent
 * execution now live on Vercel in /api/automation/poll. This task pings the
 * Vercel orchestrator every 5 minutes and does nothing else.
 */
export const checkEventTriggers = schedules.task({
  id: "check-event-triggers",
  cron: "*/5 * * * *",
  ttl: "5m",
  run: async () => {
    const res = await pingAutomationPoll();
    if (!res.ok) {
      console.error(
        `[EventPoll] Vercel poll ping failed: ${res.status ?? "no response"}`
      );
      return { status: "error" };
    }
    return { status: "completed" };
  },
});
