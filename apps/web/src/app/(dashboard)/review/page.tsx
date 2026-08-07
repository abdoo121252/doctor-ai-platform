"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, Check, X, Loader2, Clock } from "lucide-react";

interface Approval {
  id: string;
  doctor_id: string;
  session_id: string | null;
  action_type: string;
  action_payload: Record<string, unknown>;
  status: string;
  requested_at: string;
  resolved_at: string | null;
  rejection_reason: string | null;
}

function formatActionType(type: string): string {
  return type
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function formatPayload(type: string, payload: Record<string, unknown>): string {
  switch (type) {
    case "send_email":
      return `To: ${payload.to ?? "—"}\nSubject: ${payload.subject ?? "—"}`;
    case "create_event":
      return `${payload.summary ?? "—"}\n${payload.start ?? "—"} → ${payload.end ?? "—"}`;
    case "delete_email":
    case "delete_event":
    case "delete_file":
    case "write_sheet":
    case "share_file":
      return JSON.stringify(payload, null, 2);
    default:
      return JSON.stringify(payload, null, 2);
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function ReviewPage() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const fetchApprovals = useCallback(async () => {
    try {
      const res = await fetch("/api/approvals");
      if (!res.ok) return;
      const data = await res.json();
      setApprovals(data.approvals ?? []);
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals]);

  const handleAction = async (approvalId: string, status: "approved" | "rejected") => {
    setActing(approvalId);
    try {
      const res = await fetch(`/api/approval/${approvalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setApprovals((prev) => prev.filter((a) => a.id !== approvalId));
      }
    } catch {
      // silently handle
    } finally {
      setActing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="h-5 w-5" />
        <h1 className="text-xl font-semibold">Awaiting Review</h1>
        <Badge variant="secondary">{approvals.length}</Badge>
      </div>

      {approvals.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No pending approvals. Actions from automated sessions will appear here when they need your review.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {approvals.map((approval) => (
            <Card key={approval.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base">
                      {formatActionType(approval.action_type)}
                    </CardTitle>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {timeAgo(approval.requested_at)}
                    </div>
                  </div>
                  <Badge>Pending</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 text-xs leading-relaxed">
                  {formatPayload(approval.action_type, approval.action_payload)}
                </pre>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleAction(approval.id, "approved")}
                    disabled={acting === approval.id}
                  >
                    {acting === approval.id ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAction(approval.id, "rejected")}
                    disabled={acting === approval.id}
                  >
                    <X className="mr-1.5 h-3.5 w-3.5" />
                    Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
