import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { rewriteToolInput } from "@repo/agent";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const { toolName, input, instruction, conversation } = body ?? {};
  if (!toolName || typeof toolName !== "string" || !instruction || typeof instruction !== "string") {
    return NextResponse.json(
      { error: "toolName and instruction are required" },
      { status: 400 }
    );
  }

  try {
    const revised = await rewriteToolInput({
      toolName,
      input,
      instruction,
      conversation: Array.isArray(conversation) ? conversation : undefined,
    });
    if (revised === null) {
      return NextResponse.json(
        { error: "Model did not return valid JSON input" },
        { status: 422 }
      );
    }
    return NextResponse.json({ input: revised });
  } catch (error) {
    console.error("[modify-tool] rewrite failed:", error);
    return NextResponse.json(
      { error: "Failed to revise tool input" },
      { status: 500 }
    );
  }
}
