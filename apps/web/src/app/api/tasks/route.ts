import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { zonedTimeToUtc } from "@repo/agent";
import { buildEveryNHoursCron, intervalAnchorUtc } from "@repo/shared";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("scheduled_tasks")
      .select("*")
      .eq("doctor_id", auth.user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
    }

    const tasks = data ?? [];

    // Attach one-off dates for non-recurring tasks.
    const oneOffIds = tasks
      .filter((t) => t.schedule_type === "one_off_dates")
      .map((t) => t.id);

    if (oneOffIds.length > 0) {
      const { data: dates } = await supabase
        .from("scheduled_task_dates")
        .select("task_id, run_at, fired_at")
        .in("task_id", oneOffIds)
        .order("run_at", { ascending: true });

      const byTask = new Map<string, Array<{ run_at: string; fired_at: string | null }>>();
      for (const d of dates ?? []) {
        const arr = byTask.get(d.task_id) ?? [];
        arr.push({ run_at: d.run_at, fired_at: d.fired_at });
        byTask.set(d.task_id, arr);
      }

      for (const t of tasks) {
        (t as { dates?: unknown }).dates = byTask.get(t.id) ?? [];
      }
    }

    return NextResponse.json({ tasks });
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
    const {
      name,
      cron_expression,
      instructions,
      timezone,
      schedule_type,
      dates,
      time,
      interval_hours,
    } = body;

    if (!name || !instructions) {
      return NextResponse.json(
        { error: "name and instructions are required" },
        { status: 400 }
      );
    }

    if (schedule_type === "every_n_hours") {
      const intervalHours = Number.isInteger(interval_hours)
        ? (interval_hours as number)
        : parseInt(String(interval_hours ?? ""), 10);
      if (!Number.isInteger(intervalHours) || intervalHours < 1 || intervalHours > 23) {
        return NextResponse.json(
          { error: "interval_hours must be an integer between 1 and 23" },
          { status: 400 }
        );
      }

      const tz = timezone ?? "UTC";
      const startTime = typeof time === "string" ? time : "09:00";
      // Enumerated cron when N divides 24, null otherwise (worker computes
      // the next fire from interval_anchor + interval_hours + last_run_at).
      const cronExpression = buildEveryNHoursCron(startTime, intervalHours);
      const anchor = intervalAnchorUtc(startTime, tz).toISOString();

      const { data, error } = await supabase
        .from("scheduled_tasks")
        .insert({
          doctor_id: auth.user.id,
          name,
          cron_expression: cronExpression,
          schedule_type: "every_n_hours",
          instructions,
          timezone: tz,
          enabled: true,
          interval_hours: intervalHours,
          interval_anchor: anchor,
        })
        .select()
        .single();

      if (error || !data) {
        console.error("[Tasks] Create every_n_hours error:", error);
        return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
      }

      return NextResponse.json({ task: data }, { status: 201 });
    }

    const type = schedule_type === "one_off_dates" ? "one_off_dates" : "recurring";

    if (type === "recurring") {
      if (!cron_expression) {
        return NextResponse.json(
          { error: "cron_expression is required for recurring tasks" },
          { status: 400 }
        );
      }

      const { data, error } = await supabase
        .from("scheduled_tasks")
        .insert({
          doctor_id: auth.user.id,
          name,
          cron_expression,
          schedule_type: "recurring",
          instructions,
          timezone: timezone ?? "UTC",
          enabled: true,
        })
        .select()
        .single();

      if (error || !data) {
        console.error("[Tasks] Create error:", error);
        return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
      }

      return NextResponse.json({ task: data }, { status: 201 });
    }

    // One-off dates.
    if (!Array.isArray(dates) || dates.length === 0) {
      return NextResponse.json(
        { error: "dates is required for one-off tasks" },
        { status: 400 }
      );
    }

    const tz = timezone ?? "UTC";
    const runAtDates = dates.map((d: string) =>
      zonedTimeToUtc(d, time ?? "09:00", tz).toISOString()
    );

    const { data, error } = await supabase
      .from("scheduled_tasks")
      .insert({
        doctor_id: auth.user.id,
        name,
        cron_expression: null,
        schedule_type: "one_off_dates",
        instructions,
        timezone: tz,
        enabled: true,
      })
      .select()
      .single();

    if (error || !data) {
      console.error("[Tasks] Create error:", error);
      return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
    }

    const { error: dateErr } = await supabase
      .from("scheduled_task_dates")
      .insert(runAtDates.map((runAt) => ({ task_id: data.id, run_at: runAt })));

    if (dateErr) {
      console.error("[Tasks] Date insert error:", dateErr);
      return NextResponse.json({ error: "Failed to create task dates" }, { status: 500 });
    }

    return NextResponse.json({ task: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
