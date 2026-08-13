"use client";

import { useCallback, useEffect, useState } from "react";
import {
  RefreshCw,
  AlertCircle,
  Info,
  AlertTriangle,
  Copy,
  Check,
  Search,
  Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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

function formatLogEntry(entry: LogEntry): string {
  const ts = new Date(entry.created_at).toISOString();
  const doctor = entry.doctor_id ? ` doctor=${entry.doctor_id}` : "";
  const lines = [`[${ts}] ${entry.level.toUpperCase()} [${entry.source}]${doctor} ${entry.message}`];
  if (entry.details && Object.keys(entry.details).length > 0) {
    lines.push(`  details: ${JSON.stringify(entry.details)}`);
  }
  return lines.join("\n");
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [level, setLevel] = useState("");
  const [search, setSearch] = useState("");
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchLogs = useCallback(async (level: string, search: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "500" });
      if (level) params.set("level", level);
      if (search) params.set("q", search);
      const res = await fetch(`/api/logs?${params}`);
      const data = await res.json();
      setLogs(data.logs ?? []);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => fetchLogs(level, search), 300);
    return () => clearTimeout(t);
  }, [level, search, fetchLogs]);

  const handleCopyAll = async () => {
    const scope = [
      `level=${level || "all"}`,
      search ? `q="${search}"` : null,
    ].filter(Boolean).join(", ");
    const header = `===== Doctor AI Logs — ${logs.length} entries (${scope}) =====`;
    const body = logs.map(formatLogEntry).join("\n\n");
    const ok = await copyText(`${header}\n\n${body || "(no logs)"}`);
    if (ok) {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1500);
    }
  };

  const handleCopyEntry = async (entry: LogEntry) => {
    const ok = await copyText(formatLogEntry(entry));
    if (ok) {
      setCopiedId(entry.id);
      setTimeout(() => setCopiedId(null), 1500);
    }
  };

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col">
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-2xl font-semibold">Logs</h1>
            {!loading && (
              <Badge variant="secondary" className="ml-1">
                {logs.length}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchLogs.bind(null, level, search)} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button size="sm" onClick={handleCopyAll} disabled={loading || logs.length === 0}>
              {copiedAll ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copiedAll ? "Copied!" : "Copy all"}
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search message or source…"
              className="w-full rounded-md border border-input bg-background pl-8 pr-3 py-1.5 text-sm"
            />
          </div>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          >
            <option value="">All levels</option>
            <option value="error">Errors only</option>
            <option value="warn">Warnings</option>
            <option value="info">Info</option>
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2">
        {loading && logs.length === 0 && (
          <p className="text-muted-foreground text-sm">Loading…</p>
        )}
        {!loading && logs.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No logs match. They&apos;ll appear here when actions happen.
          </p>
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
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 h-7 w-7 p-0"
                onClick={() => handleCopyEntry(entry)}
                title="Copy this log"
              >
                {copiedId === entry.id ? (
                  <Check className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
