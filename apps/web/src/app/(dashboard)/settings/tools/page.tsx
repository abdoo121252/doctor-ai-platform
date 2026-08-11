"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, ShieldCheck, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AgentToolName } from "@repo/shared";

interface ToolDescriptor {
  name: AgentToolName;
  label: string;
  description: string;
}

const TOOL_DESCRIPTORS: ToolDescriptor[] = [
  { name: "readEmails", label: "Read Gmail", description: "Read the latest emails from Gmail" },
  { name: "sendEmail", label: "Send Gmail", description: "Send an email from the doctor's Gmail account" },
  { name: "readCalendar", label: "Read Google Calendar", description: "Read events from the doctor's Google Calendar" },
  { name: "createEvent", label: "Create Google Calendar Event", description: "Create a Google Calendar event (may invite attendees)" },
  { name: "searchDrive", label: "Search Google Drive", description: "Search for files in the doctor's Google Drive" },
  { name: "readSheet", label: "Read Google Sheets", description: "Read data from a Google Sheet" },
  { name: "readOutlookEmails", label: "Read Outlook Email", description: "Read the latest emails from Outlook" },
  { name: "sendOutlookEmail", label: "Send Outlook Email", description: "Send an email from the doctor's Outlook account" },
  { name: "readOutlookCalendar", label: "Read Outlook Calendar", description: "Read events from the doctor's Outlook calendar" },
  { name: "createOutlookEvent", label: "Create Outlook Calendar Event", description: "Create an Outlook calendar event (may invite attendees)" },
  { name: "searchOneDrive", label: "Search OneDrive", description: "Search for files in the doctor's OneDrive" },
  { name: "readOneDriveFile", label: "Read OneDrive File", description: "Read the content of a file in OneDrive" },
];

export default function ToolSensitivityPage() {
  const [settings, setSettings] = useState<Record<AgentToolName, boolean> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<AgentToolName | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/tool-sensitivity");
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleToggle(name: AgentToolName, current: boolean) {
    setSaving(name);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/tool-sensitivity", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolName: name, sensitive: !current }),
      });
      if (!res.ok) throw new Error();
      setSettings((prev) => (prev ? { ...prev, [name]: !current } : prev));
    } catch {
      setMessage("Failed to save. Try again.");
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link
            href="/settings"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            title="Back to settings"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-xl font-semibold">Tool Approval Settings</h1>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sensitive Tools</CardTitle>
          <p className="text-sm text-muted-foreground">
            Sensitive tools pause the chat and ask for your approval before
            running. Non-sensitive tools execute automatically. You can approve,
            modify, or reject a sensitive tool call directly in the chat.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {message && (
            <div className="rounded-md border bg-muted/50 px-4 py-3 text-sm text-destructive">
              {message}
            </div>
          )}
          {TOOL_DESCRIPTORS.map((tool) => {
            const sensitive = settings?.[tool.name] ?? false;
            return (
              <div
                key={tool.name}
                className="flex items-center justify-between rounded-md border px-4 py-3"
              >
                <div className="flex items-start gap-3">
                  {sensitive ? (
                    <ShieldAlert className="mt-0.5 h-4 w-4 text-amber-600" />
                  ) : (
                    <ShieldCheck className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  )}
                  <div>
                    <p className="text-sm font-medium">{tool.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {tool.description}
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                      {tool.name}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleToggle(tool.name, sensitive)}
                  disabled={saving === tool.name}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    sensitive ? "bg-amber-600" : "bg-muted"
                  }`}
                  title={
                    sensitive
                      ? "Sensitive — approval required"
                      : "Not sensitive — runs automatically"
                  }
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      sensitive ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
