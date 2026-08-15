import { task } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import { dispatchEventItem } from "../dispatch";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

/**
 * Thin webhook-style task for a future push source (e.g. Gmail Pub/Sub). It
 * applies the deterministic filter and forwards matches to Vercel. Not
 * scheduled — event delivery currently runs through `checkEventTriggers`.
 */
export const onNewEmail = task({
  id: "doctor-on-new-email",
  run: async (payload: {
    doctorId: string;
    eventSource: string;
    eventData?: unknown;
    itemId?: string;
  }) => {
    const supabase = getSupabase();
    const { doctorId, eventSource, eventData, itemId } = payload;

    if (!itemId) return { status: "skipped", processed: 0 };

    const processed = await dispatchEventItem(
      supabase,
      doctorId,
      eventSource,
      eventData,
      itemId
    );

    return { status: "completed", processed };
  },
});
