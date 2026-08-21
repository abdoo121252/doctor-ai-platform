import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) updates.name = body.name;
    if (body.event_source !== undefined) updates.event_source = body.event_source;
    if (body.instructions !== undefined) updates.instructions = body.instructions;
    if (body.enabled !== undefined) updates.enabled = body.enabled;
    if (body.filter_rules !== undefined) updates.filter_rules = body.filter_rules;
    if (body.condition !== undefined) updates.condition = body.condition;

    if (body.paths !== undefined) {
      if (!Array.isArray(body.paths) || body.paths.length === 0) {
        return NextResponse.json(
          { error: "paths must be a non-empty array" },
          { status: 400 }
        );
      }
      for (const p of body.paths) {
        if (typeof p?.instructions !== "string" || p.instructions.trim() === "") {
          return NextResponse.json(
            { error: "each path must have non-empty instructions" },
            { status: 400 }
          );
        }
        const f = p.filter;
        if (f !== undefined && (typeof f !== "object" || f === null || Array.isArray(f))) {
          return NextResponse.json(
            { error: "path.filter must be an object" },
            { status: 400 }
          );
        }
        if (f !== undefined) {
          if (f.mode !== "fields" && f.mode !== "ai") {
            return NextResponse.json(
              { error: "path.filter.mode must be 'fields' or 'ai'" },
              { status: 400 }
            );
          }
          if (f.mode === "ai" && typeof f.condition !== "string") {
            return NextResponse.json(
              { error: "path.filter.condition must be a string for ai mode" },
              { status: 400 }
            );
          }
        }
      }
      const normalizedPaths = body.paths.map((p: any) => ({
        id: p.id ?? crypto.randomUUID(),
        name: p.name,
        filter:
          p.filter && p.filter.mode
            ? p.filter
            : { mode: "fields", fields: p.filter?.fields ?? {} },
        instructions: p.instructions,
      }));
      updates.paths = normalizedPaths;
      // Keep legacy instructions in sync with first path for display
      updates.instructions = normalizedPaths[0].instructions;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("event_triggers")
      .update(updates)
      .eq("id", params.id)
      .eq("doctor_id", auth.user.id)
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    return NextResponse.json({ event: data });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { error } = await supabase
      .from("event_triggers")
      .delete()
      .eq("id", params.id)
      .eq("doctor_id", auth.user.id);

    if (error) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Clean up any per-automation overrides for this trigger.
    await supabase
      .from("automation_tool_overrides")
      .delete()
      .eq("doctor_id", auth.user.id)
      .eq("automation_type", "event_trigger")
      .eq("automation_id", params.id);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
