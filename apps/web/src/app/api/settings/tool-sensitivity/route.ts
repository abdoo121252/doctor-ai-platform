import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { invalidateToolSensitivityCache } from "@repo/agent";
import {
  AGENT_TOOL_NAMES,
  TOOL_SENSITIVITY_DEFAULTS,
  type AgentToolName,
} from "@repo/shared";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data } = await supabase
      .from("tool_sensitivity_settings")
      .select("tool_name, sensitive")
      .eq("doctor_id", auth.user.id);

    const settings = { ...TOOL_SENSITIVITY_DEFAULTS } as Record<
      AgentToolName,
      boolean
    >;
    if (Array.isArray(data)) {
      for (const row of data as Array<{ tool_name: string; sensitive: boolean }>) {
        if ((AGENT_TOOL_NAMES as readonly string[]).includes(row.tool_name)) {
          settings[row.tool_name as AgentToolName] = row.sensitive;
        }
      }
    }

    return NextResponse.json({ settings });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

const BodySchema = z.object({
  toolName: z.string(),
  sensitive: z.boolean(),
});

export async function PUT(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "toolName and sensitive are required" },
        { status: 400 }
      );
    }
    const { toolName, sensitive } = parsed.data;

    if (!(AGENT_TOOL_NAMES as readonly string[]).includes(toolName)) {
      return NextResponse.json({ error: "Unknown tool" }, { status: 400 });
    }

    const { error } = await supabase.from("tool_sensitivity_settings").upsert(
      {
        doctor_id: auth.user.id,
        tool_name: toolName,
        sensitive,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "doctor_id,tool_name" }
    );

    if (error) {
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }

    invalidateToolSensitivityCache(auth.user.id);

    return NextResponse.json({ ok: true, toolName, sensitive });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
