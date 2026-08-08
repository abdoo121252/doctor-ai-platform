import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const level = request.nextUrl.searchParams.get("level");
    const limit = parseInt(request.nextUrl.searchParams.get("limit") ?? "100", 10);

    let query = supabase
      .from("logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(Math.min(limit, 500));

    if (level) {
      query = query.eq("level", level);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: "Failed to fetch logs" }, { status: 500 });
    }

    return NextResponse.json({ logs: data });
  } catch (err) {
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
