"use client";

import { useEffect, useState, useCallback, FormEvent } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CalendarCheck,
  Plus,
  Trash2,
  Power,
  PowerOff,
  Loader2,
  Clock,
  SlidersHorizontal,
  Play,
} from "lucide-react";
import { TOOL_DESCRIPTORS } from "@/lib/tool-descriptors";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { format } from "date-fns";
import {
  buildDailyCron,
  buildDaysOfWeekCron,
  buildDaysOfMonthCron,
  parseCron,
} from "@repo/shared";

interface ScheduledTask {
  id: string;
  name: string;
  cron_expression: string | null;
  schedule_type: string;
  instructions: string;
  enabled: boolean;
  timezone: string;
  created_at: string;
  dates?: Array<{ run_at: string; fired_at: string | null }>;
}

interface EventTrigger {
  id: string;
  name: string;
  event_source: string;
  instructions: string;
  enabled: boolean;
  filter_rules: Record<string, unknown> | null;
  condition: string | null;
  created_at: string;
}

interface OverrideTarget {
  type: "scheduled_task" | "event_trigger";
  id: string;
  name: string;
}

const EVENT_SOURCES = [
  { value: "gmail_new_message", label: "New Gmail Message" },
  { value: "calendar_event_soon", label: "Calendar Event Starting Soon" },
  { value: "drive_new_file", label: "New File in Drive" },
  { value: "outlook_new_message", label: "New Outlook Message" },
  { value: "outlook_calendar_soon", label: "Outlook Event Starting Soon" },
  { value: "onedrive_new_file", label: "New File in OneDrive" },
];

const FREQ_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "days_of_week", label: "Days of week" },
  { value: "days_of_month", label: "Days of month" },
  { value: "specific_dates", label: "Specific dates" },
] as const;

type TaskFreq = (typeof FREQ_OPTIONS)[number]["value"];

const DOW_OPTIONS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

const COMMON_TIMEZONES = [
  "UTC",
  "Africa/Cairo",
  "Africa/Casablanca",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/New_York",
  "America/Toronto",
  "Asia/Beirut",
  "Asia/Dubai",
  "Asia/Jerusalem",
  "Asia/Kolkata",
  "Asia/Riyadh",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Europe/Berlin",
  "Europe/London",
  "Europe/Paris",
  "Europe/Moscow",
];

function detectBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function getTimezoneOptions(): string[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supported = (Intl as any).supportedValuesOf?.("timeZone") as
      | string[]
      | undefined;
    if (supported && supported.length > 0) return supported;
  } catch {
    /* ignore */
  }
  return COMMON_TIMEZONES;
}

function formatSource(source: string): string {
  return EVENT_SOURCES.find((s) => s.value === source)?.label ?? source;
}

function formatFilters(rules: Record<string, unknown> | null): string {
  if (!rules) return "";
  const labels: Record<string, string> = {
    from: "From",
    to: "To",
    subjectContains: "Contains",
    bodyContains: "Body contains",
    hasAttachment: "Has attachment",
    attendeeContains: "Attendee",
    locationContains: "Location",
    folderId: "Folder",
    mimeType: "Type",
  };
  const parts = Object.entries(rules)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${labels[k] ?? k}: ${v}`);
  return parts.join(" · ");
}

function formatSchedule(task: ScheduledTask): string {
  if (task.schedule_type === "one_off_dates") {
    const dates = (task.dates ?? []).map((d) =>
      new Date(d.run_at).toLocaleString(undefined, {
        timeZone: task.timezone || "UTC",
      })
    );
    return dates.length > 0 ? dates.join(" · ") : "One-off (no dates)";
  }
  return parseCron(task.cron_expression ?? "");
}

interface FilterField {
  key: string;
  label: string;
  type: "text" | "boolean";
  sources: string[];
}

const FILTER_FIELDS: FilterField[] = [
  { key: "from", label: "From (contains)", type: "text", sources: ["gmail_new_message", "outlook_new_message"] },
  { key: "to", label: "To (contains)", type: "text", sources: ["gmail_new_message", "outlook_new_message"] },
  { key: "subjectContains", label: "Subject contains", type: "text", sources: ["gmail_new_message", "outlook_new_message", "calendar_event_soon", "outlook_calendar_soon", "drive_new_file", "onedrive_new_file"] },
  { key: "bodyContains", label: "Body contains", type: "text", sources: ["gmail_new_message", "outlook_new_message"] },
  { key: "hasAttachment", label: "Has attachment", type: "boolean", sources: ["gmail_new_message", "outlook_new_message"] },
  { key: "attendeeContains", label: "Attendee contains", type: "text", sources: ["calendar_event_soon", "outlook_calendar_soon"] },
  { key: "locationContains", label: "Location contains", type: "text", sources: ["calendar_event_soon", "outlook_calendar_soon"] },
  { key: "folderId", label: "Folder ID", type: "text", sources: ["drive_new_file", "onedrive_new_file"] },
  { key: "mimeType", label: "MIME type", type: "text", sources: ["drive_new_file", "onedrive_new_file"] },
];

export default function TasksPage() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [events, setEvents] = useState<EventTrigger[]>([]);
  const [loading, setLoading] = useState(true);

  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [taskName, setTaskName] = useState("");
  const [taskFreq, setTaskFreq] = useState<TaskFreq>("daily");
  const [taskDaysOfWeek, setTaskDaysOfWeek] = useState<number[]>([1]);
  const [taskDaysOfMonth, setTaskDaysOfMonth] = useState<number[]>([]);
  const [taskDates, setTaskDates] = useState<Date[]>([]);
  const [taskTime, setTaskTime] = useState("09:00");
  const [taskTimezone, setTaskTimezone] = useState(detectBrowserTimezone());
  const [taskInst, setTaskInst] = useState("");
  const [eventName, setEventName] = useState("");
  const [eventSource, setEventSource] = useState(EVENT_SOURCES[0]!.value);
  const [eventInst, setEventInst] = useState("");
  const [eventCondition, setEventCondition] = useState("");
  const [eventFilters, setEventFilters] = useState<Record<string, string | boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [overrideTarget, setOverrideTarget] = useState<OverrideTarget | null>(null);
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [tRes, eRes] = await Promise.all([
        fetch("/api/tasks"),
        fetch("/api/events"),
      ]);
      if (tRes.ok) setTasks(((await tRes.json()) as { tasks: ScheduledTask[] }).tasks ?? []);
      if (eRes.ok) setEvents(((await eRes.json()) as { events: EventTrigger[] }).events ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleDow = (d: number) =>
    setTaskDaysOfWeek((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
    );

  const toggleDom = (d: number) =>
    setTaskDaysOfMonth((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
    );

  const createTask = async (e: FormEvent) => {
    e.preventDefault();
    if (!taskName || !taskInst) return;
    if (taskFreq === "days_of_week" && taskDaysOfWeek.length === 0) return;
    if (taskFreq === "days_of_month" && taskDaysOfMonth.length === 0) return;
    if (taskFreq === "specific_dates" && taskDates.length === 0) return;
    setSubmitting(true);
    try {
      const body =
        taskFreq === "specific_dates"
          ? {
              name: taskName,
              instructions: taskInst,
              schedule_type: "one_off_dates",
              dates: taskDates.map((d) => format(d, "yyyy-MM-dd")),
              time: taskTime,
              timezone: taskTimezone,
            }
          : {
              name: taskName,
              instructions: taskInst,
              timezone: taskTimezone,
              cron_expression:
                taskFreq === "daily"
                  ? buildDailyCron(taskTime)
                  : taskFreq === "days_of_week"
                    ? buildDaysOfWeekCron(taskTime, taskDaysOfWeek)
                    : buildDaysOfMonthCron(taskTime, taskDaysOfMonth),
            };
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setTaskName("");
        setTaskInst("");
        setTaskFreq("daily");
        setTaskDaysOfWeek([1]);
        setTaskDaysOfMonth([]);
        setTaskDates([]);
        setShowTaskForm(false);
        fetchData();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const createEvent = async (e: FormEvent) => {
    e.preventDefault();
    if (!eventName || !eventInst) return;
    setSubmitting(true);
    try {
      const filter_rules: Record<string, unknown> = {};
      for (const f of FILTER_FIELDS) {
        if (!f.sources.includes(eventSource)) continue;
        const v = eventFilters[f.key];
        if (v === undefined || v === null || v === "" || v === false) continue;
        filter_rules[f.key] = v;
      }
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: eventName,
          event_source: eventSource,
          instructions: eventInst,
          condition: eventCondition.trim() || undefined,
          filter_rules,
        }),
      });
      if (res.ok) {
        setEventName("");
        setEventInst("");
        setEventCondition("");
        setEventFilters({});
        setShowEventForm(false);
        fetchData();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const toggleTask = async (task: ScheduledTask) => {
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !task.enabled }),
    });
    fetchData();
  };

  const deleteTask = async (id: string) => {
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    fetchData();
  };

  const runTask = async (task: ScheduledTask) => {
    setRunningTaskId(task.id);
    try {
      await fetch(`/api/tasks/${task.id}/run`, { method: "POST" });
    } finally {
      setRunningTaskId(null);
    }
  };

  const toggleEvent = async (ev: EventTrigger) => {
    await fetch(`/api/events/${ev.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !ev.enabled }),
    });
    fetchData();
  };

  const deleteEvent = async (id: string) => {
    await fetch(`/api/events/${id}`, { method: "DELETE" });
    fetchData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {overrideTarget && (
        <OverrideEditor
          type={overrideTarget.type}
          automationId={overrideTarget.id}
          name={overrideTarget.name}
          onClose={() => setOverrideTarget(null)}
        />
      )}

      {/* Scheduled Tasks */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            <h2 className="text-lg font-semibold">Scheduled Tasks</h2>
            <Badge variant="secondary">{tasks.length}</Badge>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setShowEventForm(false);
              setShowTaskForm((v) => !v);
            }}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New Task
          </Button>
        </div>

        {showTaskForm && (
          <Card className="mb-4">
            <CardContent className="pt-6">
              <form onSubmit={createTask} className="space-y-3">
                <input
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="Task name (e.g. Morning Briefing)"
                  value={taskName}
                  onChange={(e) => setTaskName(e.target.value)}
                />
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {FREQ_OPTIONS.map((opt) => (
                    <Button
                      key={opt.value}
                      type="button"
                      size="sm"
                      variant={taskFreq === opt.value ? "default" : "outline"}
                      onClick={() => setTaskFreq(opt.value)}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>

                {taskFreq === "days_of_week" && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      Days of the week
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {DOW_OPTIONS.map((d) => (
                        <Button
                          key={d.value}
                          type="button"
                          size="sm"
                          variant={
                            taskDaysOfWeek.includes(d.value) ? "default" : "outline"
                          }
                          onClick={() => toggleDow(d.value)}
                        >
                          {d.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {taskFreq === "days_of_month" && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      Days of the month
                    </p>
                    <div className="grid grid-cols-7 gap-1.5">
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                        <Button
                          key={day}
                          type="button"
                          size="sm"
                          variant={
                            taskDaysOfMonth.includes(day) ? "default" : "outline"
                          }
                          onClick={() => toggleDom(day)}
                          className="px-0"
                        >
                          {day}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {taskFreq === "specific_dates" && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      Pick specific dates
                    </p>
                    <DayPicker
                      mode="multiple"
                      selected={taskDates}
                      onSelect={(dates) => setTaskDates(dates ?? [])}
                    />
                    {taskDates.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {taskDates.length} date
                        {taskDates.length === 1 ? "" : "s"} selected
                      </p>
                    )}
                  </div>
                )}

                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Time</p>
                  <input
                    type="time"
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={taskTime}
                    onChange={(e) => setTaskTime(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    Timezone
                  </p>
                  <select
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={taskTimezone}
                    onChange={(e) => setTaskTimezone(e.target.value)}
                  >
                    {getTimezoneOptions().map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </div>
                <textarea
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  rows={3}
                  placeholder="Instructions for the AI agent (e.g. Check today's emails and summarize urgent ones)"
                  value={taskInst}
                  onChange={(e) => setTaskInst(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowTaskForm(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={
                      submitting ||
                      (taskFreq === "days_of_week" && taskDaysOfWeek.length === 0) ||
                      (taskFreq === "days_of_month" && taskDaysOfMonth.length === 0) ||
                      (taskFreq === "specific_dates" && taskDates.length === 0)
                    }
                  >
                    {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                    Create
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {tasks.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No scheduled tasks yet. Create one to automate daily agent sessions.
          </p>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <Card key={task.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{task.name}</span>
                      {task.enabled ? (
                        <Badge variant="default" className="text-[10px]">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">
                          Paused
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatSchedule(task)}
                      {task.timezone && task.timezone !== "UTC"
                        ? ` · ${task.timezone}`
                        : ""}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {task.instructions}
                    </p>
                  </div>
                  <div className="ml-3 flex shrink-0 items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => runTask(task)}
                      disabled={runningTaskId === task.id}
                      title="Run now"
                    >
                      {runningTaskId === task.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() =>
                        setOverrideTarget({
                          type: "scheduled_task",
                          id: task.id,
                          name: task.name,
                        })
                      }
                      title="Approval overrides"
                    >
                      <SlidersHorizontal className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => toggleTask(task)}
                      title={task.enabled ? "Pause" : "Enable"}
                    >
                      {task.enabled ? (
                        <PowerOff className="h-4 w-4" />
                      ) : (
                        <Power className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive"
                      onClick={() => deleteTask(task.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Event Triggers */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarCheck className="h-5 w-5" />
            <h2 className="text-lg font-semibold">Event Triggers</h2>
            <Badge variant="secondary">{events.length}</Badge>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setShowTaskForm(false);
              setShowEventForm((v) => !v);
            }}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New Trigger
          </Button>
        </div>

        {showEventForm && (
          <Card className="mb-4">
            <CardContent className="pt-6">
              <form onSubmit={createEvent} className="space-y-3">
                <input
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="Trigger name (e.g. Urgent Email Alert)"
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                />
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={eventSource}
                  onChange={(e) => setEventSource(e.target.value)}
                >
                  {EVENT_SOURCES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                {FILTER_FIELDS.filter((f) => f.sources.includes(eventSource)).map(
                  (f) =>
                    f.type === "boolean" ? (
                      <label
                        key={f.key}
                        className="flex items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={eventFilters[f.key] === true}
                          onChange={(e) =>
                            setEventFilters((prev) => ({
                              ...prev,
                              [f.key]: e.target.checked,
                            }))
                          }
                        />
                        {f.label}
                      </label>
                    ) : (
                      <input
                        key={f.key}
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                        placeholder={f.label}
                        value={String(eventFilters[f.key] ?? "")}
                        onChange={(e) =>
                          setEventFilters((prev) => ({
                            ...prev,
                            [f.key]: e.target.value,
                          }))
                        }
                      />
                    )
                )}
                <textarea
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  rows={3}
                  placeholder="Instructions for the AI agent when this event fires"
                  value={eventInst}
                  onChange={(e) => setEventInst(e.target.value)}
                />
                <input
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="Optional natural-language condition (e.g. only if the email is about grading deadlines)"
                  value={eventCondition}
                  onChange={(e) => setEventCondition(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowEventForm(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={submitting}>
                    {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                    Create
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {events.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No event triggers yet. Create one to react to Gmail, Calendar, or Drive events.
          </p>
        ) : (
          <div className="space-y-3">
            {events.map((ev) => (
              <Card key={ev.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{ev.name}</span>
                      {ev.enabled ? (
                        <Badge variant="default" className="text-[10px]">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">
                          Paused
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatSource(ev.event_source)}
                    </p>
                    {formatFilters(ev.filter_rules) && (
                      <p className="truncate text-xs text-muted-foreground">
                        {formatFilters(ev.filter_rules)}
                      </p>
                    )}
                    <p className="truncate text-xs text-muted-foreground">
                      {ev.instructions}
                    </p>
                  </div>
                  <div className="ml-3 flex shrink-0 items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() =>
                        setOverrideTarget({
                          type: "event_trigger",
                          id: ev.id,
                          name: ev.name,
                        })
                      }
                      title="Approval overrides"
                    >
                      <SlidersHorizontal className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => toggleEvent(ev)}
                      title={ev.enabled ? "Pause" : "Enable"}
                    >
                      {ev.enabled ? (
                        <PowerOff className="h-4 w-4" />
                      ) : (
                        <Power className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive"
                      onClick={() => deleteEvent(ev.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

type OverrideState = "inherit" | "true" | "false";

function OverrideEditor({
  type,
  automationId,
  name,
  onClose,
}: {
  type: "scheduled_task" | "event_trigger";
  automationId: string;
  name: string;
  onClose: () => void;
}) {
  const [general, setGeneral] = useState<Record<string, boolean> | null>(null);
  const [selections, setSelections] = useState<Record<string, OverrideState>>({});
  const [customize, setCustomize] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/automation/overrides?type=${type}&id=${automationId}`
        );
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            setGeneral(data.general ?? {});
            const overrides = data.overrides ?? {};
            const sel: Record<string, OverrideState> = {};
            for (const k of Object.keys(overrides)) {
              sel[k] = overrides[k] ? "true" : "false";
            }
            setSelections(sel);
            setCustomize(Object.keys(overrides).length > 0);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [type, automationId]);

  async function save() {
    setSaving(true);
    try {
      const overrides: Record<string, boolean> = {};
      for (const [tool, state] of Object.entries(selections)) {
        if (state === "true") overrides[tool] = true;
        else if (state === "false") overrides[tool] = false;
      }
      await fetch("/api/automation/overrides", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          automationId,
          overrides: customize ? overrides : {},
        }),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-primary/40">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold">Approval settings</h3>
            <p className="text-xs text-muted-foreground">
              {name} — override which tools require your approval for this
              automation only. Leave &quot;Use general&quot; to follow your
              global approval settings.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="mt-4 flex items-center justify-between rounded-md border px-4 py-3">
              <span className="text-sm">Use general approval settings</span>
              <button
                onClick={() => setCustomize((v) => !v)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  customize ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    customize ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {customize && (
              <div className="mt-3 max-h-80 space-y-1.5 overflow-y-auto pr-1">
                {TOOL_DESCRIPTORS.map((tool) => {
                  const state = selections[tool.name] ?? "inherit";
                  const g = general?.[tool.name] ?? false;
                  return (
                    <div
                      key={tool.name}
                      className="flex items-center justify-between rounded-md border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-medium">{tool.label}</p>
                        {state === "inherit" && (
                          <p className="text-[10px] text-muted-foreground">
                            General:{" "}
                            {g ? "requires approval" : "runs automatically"}
                          </p>
                        )}
                      </div>
                      <select
                        className="rounded-md border bg-background px-2 py-1 text-xs"
                        value={state}
                        onChange={(e) =>
                          setSelections((prev) => ({
                            ...prev,
                            [tool.name]: e.target.value as OverrideState,
                          }))
                        }
                      >
                        <option value="inherit">Inherit</option>
                        <option value="true">Require approval</option>
                        <option value="false">Run automatically</option>
                      </select>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button size="sm" onClick={save} disabled={saving}>
                {saving && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                Save
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
