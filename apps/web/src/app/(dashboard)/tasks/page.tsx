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
} from "lucide-react";

interface ScheduledTask {
  id: string;
  name: string;
  cron_expression: string;
  instructions: string;
  enabled: boolean;
  created_at: string;
}

interface EventTrigger {
  id: string;
  name: string;
  event_source: string;
  instructions: string;
  enabled: boolean;
  created_at: string;
}

const CRON_PRESETS = [
  { label: "Every morning (8 AM)", value: "0 8 * * *" },
  { label: "Every evening (6 PM)", value: "0 18 * * *" },
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every Monday 9 AM", value: "0 9 * * 1" },
  { label: "Daily noon", value: "0 12 * * *" },
];

const EVENT_SOURCES = [
  { value: "gmail_new_message", label: "New Gmail Message" },
  { value: "calendar_event_soon", label: "Calendar Event Starting Soon" },
  { value: "drive_new_file", label: "New File in Drive" },
];

function formatCron(cron: string): string {
  return CRON_PRESETS.find((p) => p.value === cron)?.label ?? cron;
}

function formatSource(source: string): string {
  return EVENT_SOURCES.find((s) => s.value === source)?.label ?? source;
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [events, setEvents] = useState<EventTrigger[]>([]);
  const [loading, setLoading] = useState(true);

  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [taskName, setTaskName] = useState("");
  const [taskCron, setTaskCron] = useState(CRON_PRESETS[0]!.value);
  const [taskInst, setTaskInst] = useState("");
  const [eventName, setEventName] = useState("");
  const [eventSource, setEventSource] = useState(EVENT_SOURCES[0]!.value);
  const [eventInst, setEventInst] = useState("");
  const [submitting, setSubmitting] = useState(false);

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

  const createTask = async (e: FormEvent) => {
    e.preventDefault();
    if (!taskName || !taskInst) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: taskName,
          cron_expression: taskCron,
          instructions: taskInst,
        }),
      });
      if (res.ok) {
        setTaskName("");
        setTaskInst("");
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
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: eventName,
          event_source: eventSource,
          instructions: eventInst,
        }),
      });
      if (res.ok) {
        setEventName("");
        setEventInst("");
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
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={taskCron}
                  onChange={(e) => setTaskCron(e.target.value)}
                >
                  {CRON_PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
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
                  <Button type="submit" size="sm" disabled={submitting}>
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
                      {formatCron(task.cron_expression)}
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
                <textarea
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  rows={3}
                  placeholder="Instructions for the AI agent when this event fires"
                  value={eventInst}
                  onChange={(e) => setEventInst(e.target.value)}
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
                    <p className="truncate text-xs text-muted-foreground">
                      {ev.instructions}
                    </p>
                  </div>
                  <div className="ml-3 flex shrink-0 items-center gap-1">
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
