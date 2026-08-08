"use client";

import { useState, useEffect } from "react";
import { RefreshCw, AlertCircle, Info, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface LogEntry {
  id: string;
  doctor_id: string | null;
  level: "info" | "warn" | "error";
  source: string;
  message: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

const levelIcon: Record<string, React.ReactNode> = {
  info: <Info className="h-4 w-4 text-blue-400" />,
  warn: <AlertTriangle className="h-4 w-4 text-yellow-400" />,
  error: <AlertCircle className="h-4 w-4 text-red-400" />,
};

const levelColor: Record<string, string> = {
  info: "border-blue-500/30 bg-blue-500/5",
  warn: "border-yellow-500/30 bg-yellow-500/5",
  error: "border-red-500/30 bg-red-500/5",
};

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("");

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (filter) params.set("level", filter);
      const res = await fetch(`/api/logs?${params}`);
      const data = await res.json();
      setLogs(data.logs ?? []);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [filter]);

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Logs</h1>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-1 text-sm"
          >
            <option value="">All levels</option>
            <option value="error">Errors only</option>
            <option value="warn">Warnings</option>
            <option value="info">Info</option>
          </select>
          <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2">
        {loading && logs.length === 0 && (
          <p className="text-muted-foreground text-sm">Loading...</p>
        )}
        {!loading && logs.length === 0 && (
          <p className="text-muted-foreground text-sm">No logs yet. They&apos;ll appear here when actions happen.</p>
        )}
        {logs.map((entry) => (
          <Card
            key={entry.id}
            className={`p-3 border-l-4 text-sm ${levelColor[entry.level]}`}
          >
            <div className="flex items-start gap-2">
              <div className="mt-0.5 shrink-0">{levelIcon[entry.level]}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-semibold text-muted-foreground">
                    [{entry.source}]
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(entry.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="mt-1 break-words">{entry.message}</p>
                {entry.details && Object.keys(entry.details).length > 0 && (
                  <pre className="mt-1 text-xs bg-background/50 p-2 rounded overflow-x-auto">
                    {JSON.stringify(entry.details, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
