import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("event_triggers")
      .select("*")
      .eq("doctor_id", auth.user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 });
    }

    return NextResponse.json({ events: data });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, event_source, instructions, filter_rules, condition, paths } = body;

    // If paths are provided, validate them; otherwise require legacy instructions
    if (paths !== undefined) {
      if (!Array.isArray(paths) || paths.length === 0) {
        return NextResponse.json(
          { error: "paths must be a non-empty array" },
          { status: 400 }
        );
      }
      for (const p of paths) {
        if (typeof p?.instructions !== "string" || p.instructions.trim() === "") {
          return NextResponse.json(
            { error: "each path must have non-empty instructions" },
            { status: 400 }
          );
        }
        const f = p.filter;
        if (
          f !== undefined &&
          (typeof f !== "object" || f === null || Array.isArray(f))
        ) {
          return NextResponse.json(
            { error: "path.filter must be an object" },
            { status: 400 }
          );
        }
        if (f !== undefined) {
          if (
            f.mode !== "fields" &&
            f.mode !== "ai"
          ) {
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
    } else if (!instructions) {
      return NextResponse.json(
        { error: "name, event_source, and instructions are required" },
        { status: 400 }
      );
    }

    if (!name || !event_source) {
      return NextResponse.json(
        { error: "name and event_source are required" },
        { status: 400 }
      );
    }

    const validSources = [
      "gmail_new_message",
      "calendar_event_soon",
      "drive_new_file",
      "outlook_new_message",
      "outlook_calendar_soon",
      "onedrive_new_file",
    ];
    if (!validSources.includes(event_source)) {
      return NextResponse.json(
        { error: `event_source must be one of: ${validSources.join(", ")}` },
        { status: 400 }
      );
    }

    // Legacy filter_rules validation
    if (
      filter_rules !== undefined &&
      (typeof filter_rules !== "object" || filter_rules === null || Array.isArray(filter_rules))
    ) {
      return NextResponse.json(
        { error: "filter_rules must be an object" },
        { status: 400 }
      );
    }

    // Normalize paths: assign ids if missing, default filter to fields+empty (always match)
    const normalizedPaths = paths?.map((p: any) => ({
      id: p.id ?? crypto.randomUUID(),
      name: p.name,
      filter:
        p.filter && p.filter.mode
          ? p.filter
          : { mode: "fields", fields: p.filter?.fields ?? {} },
      instructions: p.instructions,
    }));

    const insertInstructions = normalizedPaths?.length
      ? normalizedPaths[0].instructions
      : instructions;

    const { data, error } = await supabase
      .from("event_triggers")
      .insert({
        doctor_id: auth.user.id,
        name,
        event_source,
        instructions: insertInstructions,
        filter_rules: filter_rules ?? {},
        condition: typeof condition === "string" ? condition : null,
        paths: normalizedPaths ?? [],
        enabled: true,
      })
      .select()
      .single();

    if (error || !data) {
      console.error("[Events] Create error:", error);
      return NextResponse.json({ error: "Failed to create event" }, { status: 500 });
    }

    return NextResponse.json({ event: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
