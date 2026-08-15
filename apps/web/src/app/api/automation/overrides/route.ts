import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import {
  AGENT_TOOL_NAMES,
  AUTOMATION_TYPES,
  TOOL_SENSITIVITY_DEFAULTS,
  type AgentToolName,
  type AutomationType,
} from "@repo/shared";
import { z } from "zod";

export const dynamic = "force-dynamic";

function isAutomationType(v: unknown): v is AutomationType {
  return typeof v === "string" && (AUTOMATION_TYPES as readonly string[]).includes(v);
}

/**
 * GET /api/automation/overrides?type=scheduled_task|event_trigger&id=<automationId>
 * Returns the general sensitivity map plus the per-automation overrides.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const type = url.searchParams.get("type");
    const id = url.searchParams.get("id");
    if (!isAutomationType(type) || !id) {
      return NextResponse.json(
        { error: "type and id query params are required" },
        { status: 400 }
      );
    }

    const { data: overrideRows } = await supabase
      .from("automation_tool_overrides")
      .select("tool_name, sensitive")
      .eq("doctor_id", auth.user.id)
      .eq("automation_type", type)
      .eq("automation_id", id);

    const overrides: Partial<Record<AgentToolName, boolean>> = {};
    if (Array.isArray(overrideRows)) {
      for (const row of overrideRows as Array<{ tool_name: string; sensitive: boolean }>) {
        if ((AGENT_TOOL_NAMES as readonly string[]).includes(row.tool_name)) {
          overrides[row.tool_name as AgentToolName] = row.sensitive;
        }
      }
    }

    return NextResponse.json({
      general: { ...TOOL_SENSITIVITY_DEFAULTS },
      overrides,
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

const BodySchema = z.object({
  type: z.string(),
  automationId: z.string(),
  overrides: z.record(z.boolean()),
});

/**
 * PUT /api/automation/overrides
 * Replaces the full set of overrides for one automation. An empty map removes
 * all overrides (revert to the general settings).
 */
export async function PUT(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success || !isAutomationType(parsed.data.type)) {
      return NextResponse.json(
        { error: "type, automationId, and overrides are required" },
        { status: 400 }
      );
    }

    const { type, automationId, overrides } = parsed.data;
    const toolNames = Object.keys(overrides).filter((n) =>
      (AGENT_TOOL_NAMES as readonly string[]).includes(n)
    );

    const { error: deleteError } = await supabase
      .from("automation_tool_overrides")
      .delete()
      .eq("doctor_id", auth.user.id)
      .eq("automation_type", type)
      .eq("automation_id", automationId);

    if (deleteError) {
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }

    if (toolNames.length > 0) {
      const rows = toolNames.map((toolName) => ({
        doctor_id: auth.user.id,
        automation_type: type,
        automation_id: automationId,
        tool_name: toolName,
        sensitive: overrides[toolName],
      }));
      const { error: insertError } = await supabase
        .from("automation_tool_overrides")
        .insert(rows);
      if (insertError) {
        return NextResponse.json({ error: "Failed to save" }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
