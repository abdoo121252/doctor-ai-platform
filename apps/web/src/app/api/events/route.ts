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
    const { name, event_source, instructions } = body;

    if (!name || !event_source || !instructions) {
      return NextResponse.json(
        { error: "name, event_source, and instructions are required" },
        { status: 400 }
      );
    }

    const validSources = ["gmail_new_message", "calendar_event_soon", "drive_new_file"];
    if (!validSources.includes(event_source)) {
      return NextResponse.json(
        { error: `event_source must be one of: ${validSources.join(", ")}` },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("event_triggers")
      .insert({
        doctor_id: auth.user.id,
        name,
        event_source,
        instructions,
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
