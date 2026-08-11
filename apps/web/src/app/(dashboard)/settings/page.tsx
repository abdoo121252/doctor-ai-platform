"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Settings,
  Mail,
  Calendar,
  HardDrive,
  Table2,
  Loader2,
  Link,
  ShieldCheck,
} from "lucide-react";

interface ConnectionStatus {
  status: string;
  connected_at: string | null;
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [msConnecting, setMsConnecting] = useState(false);
  const [connection, setConnection] = useState<ConnectionStatus | null>(null);
  const [msConnection, setMsConnection] = useState<ConnectionStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadConnection = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/google-connection");
      if (res.ok) {
        const data = (await res.json()) as { connection: ConnectionStatus };
        setConnection(data.connection);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMsConnection = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/microsoft-connection");
      if (res.ok) {
        const data = (await res.json()) as { connection: ConnectionStatus };
        setMsConnection(data.connection);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConnection();
    loadMsConnection();
  }, [loadConnection, loadMsConnection]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "1") {
      setMessage("Google account connected successfully.");
      loadConnection();
      window.history.replaceState({}, "", "/settings");
    }
    if (params.get("msconnected") === "1") {
      setMessage("Microsoft account connected successfully.");
      loadMsConnection();
      window.history.replaceState({}, "", "/settings");
    }
    const error = params.get("error");
    if (error) {
      const messages: Record<string, string> = {
        "missing-code": "OAuth failed: no authorization code received.",
        "db-write-failed": "Failed to save connection. Try again.",
        "oauth-failed": "OAuth failed. Please try again.",
      };
      setMessage(messages[error] ?? "An unknown error occurred.");
      window.history.replaceState({}, "", "/settings");
    }
  }, [loadConnection, loadMsConnection]);

  const handleConnect = async () => {
    setConnecting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/google-connect");
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { url: string };
      window.location.href = data.url;
    } catch {
      setMessage("Failed to start Google connection. Check server configuration.");
      setConnecting(false);
    }
  };

  const handleMsConnect = async () => {
    setMsConnecting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/microsoft-connect");
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { url: string };
      window.location.href = data.url;
    } catch {
      setMessage("Failed to start Microsoft connection. Check server configuration.");
      setMsConnecting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const connected = connection?.status === "active";
  const msConnected = msConnection?.status === "active";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-2">
        <Settings className="h-5 w-5" />
        <h1 className="text-xl font-semibold">Settings</h1>
      </div>

      {message && (
        <div className="rounded-md border bg-muted/50 px-4 py-3 text-sm">{message}</div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Google Account Connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-sm font-medium">Google API Access</span>
                <p className="text-xs text-muted-foreground">
                  Gmail, Calendar, Drive, Sheets
                </p>
              </div>
              {connected ? (
                <Badge>Connected</Badge>
              ) : (
                <Badge variant="secondary">Not Connected</Badge>
              )}
            </div>
          </div>

          {connected && connection?.connected_at && (
            <p className="text-xs text-muted-foreground">
              Connected on{" "}
              {new Date(connection.connected_at).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}

          <p className="text-sm text-muted-foreground">
            Connecting your Google account allows the AI assistant to read
            emails, manage your calendar, search Drive, and read Sheets on your
            behalf. This is a separate OAuth grant from your login.
          </p>

          <Button onClick={handleConnect} disabled={connecting}>
            {connecting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Link className="mr-2 h-4 w-4" />
            )}
            {connected ? "Reconnect Google Account" : "Connect Google Account"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Microsoft Account Connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-sm font-medium">Microsoft 365 API Access</span>
                <p className="text-xs text-muted-foreground">
                  Outlook Mail, Outlook Calendar, OneDrive
                </p>
              </div>
              {msConnected ? (
                <Badge>Connected</Badge>
              ) : (
                <Badge variant="secondary">Not Connected</Badge>
              )}
            </div>
          </div>

          {msConnected && msConnection?.connected_at && (
            <p className="text-xs text-muted-foreground">
              Connected on{" "}
              {new Date(msConnection.connected_at).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}

          <p className="text-sm text-muted-foreground">
            Connecting your Microsoft account allows the AI assistant to read
            Outlook emails, manage your Outlook calendar, and search/read
            OneDrive files on your behalf. This is a separate OAuth grant from
            your login.
          </p>

          <Button onClick={handleMsConnect} disabled={msConnecting} variant="outline">
            {msConnecting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Link className="mr-2 h-4 w-4" />
            )}
            {msConnected ? "Reconnect Microsoft Account" : "Connect Microsoft Account"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tool Approval Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    Sensitive tool approvals
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Choose which tools pause for your approval before running in
                  chat (send email, create event, read files, etc.)
                </p>
              </div>
            </div>
          </div>
          <Button onClick={() => (window.location.href = "/settings/tools")}>
            Manage Tool Approvals
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Service Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3">
            <ServiceRow
              icon={<Mail className="h-4 w-4" />}
              name="Gmail"
              connected={connected}
            />
            <ServiceRow
              icon={<Calendar className="h-4 w-4" />}
              name="Google Calendar"
              connected={connected}
            />
            <ServiceRow
              icon={<HardDrive className="h-4 w-4" />}
              name="Google Drive"
              connected={connected}
            />
            <ServiceRow
              icon={<Table2 className="h-4 w-4" />}
              name="Sheets"
              connected={connected}
            />
            <ServiceRow
              icon={<Mail className="h-4 w-4" />}
              name="Outlook Mail"
              connected={msConnected}
            />
            <ServiceRow
              icon={<Calendar className="h-4 w-4" />}
              name="Outlook Calendar"
              connected={msConnected}
            />
            <ServiceRow
              icon={<HardDrive className="h-4 w-4" />}
              name="OneDrive"
              connected={msConnected}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ServiceRow({
  icon,
  name,
  connected,
}: {
  icon: React.ReactNode;
  name: string;
  connected: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-sm font-medium">{name}</span>
      </div>
      <Badge variant={connected ? "default" : "secondary"}>
        {connected ? "Ready" : "Offline"}
      </Badge>
    </div>
  );
}
