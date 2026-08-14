"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send,
  Loader2,
  Wrench,
  Plus,
  Trash2,
  Check,
  X,
  Pencil,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface Session {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastMessage?: string;
}

interface ChatPart {
  type: string;
  text?: string;
  toolName?: string;
  toolCallId?: string;
  state?: "approval-requested" | "complete" | "error" | "rejected";
  input?: unknown;
  output?: unknown;
  approvalId?: string;
  revised?: boolean;
}

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  parts: ChatPart[];
  live?: boolean;
}

interface LoadedData {
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    parts?: ChatPart[] | string;
  }>;
  state: {
    status: string | null;
    pendingApproval: {
      approvalId: string;
      toolName: string;
      toolCallId: string;
      input: unknown;
    } | null;
    crashedToolCalls: string[];
  };
}

function uid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Module-level cache of loaded session transcripts so switching back to an
// already-viewed session is instant. Cleared per-session whenever it changes.
const sessionCache = new Map<string, LoadedData>();

function normalizeParts(parts: ChatPart[] | string | undefined): ChatPart[] {
  if (Array.isArray(parts)) return parts;
  if (typeof parts === "string") {
    try {
      const parsed = JSON.parse(parts);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export default function ChatPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sidebarLoading, setSidebarLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [isNewChat, setIsNewChat] = useState(false);
  const [chatKey, setChatKey] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/sessions");
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
        if (data.length > 0 && !activeSessionId && !isNewChat) {
          setActiveSessionId(data[0].id);
        }
      }
    } catch {
      // silently fail
    } finally {
      setSidebarLoading(false);
    }
  }, [activeSessionId, isNewChat]);

  useEffect(() => {
    fetchSessions();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleNewSession() {
    setActiveSessionId(null);
    setChatKey((k) => k + 1);
    setIsNewChat(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function handleSelectSession(id: string) {
    setActiveSessionId(id);
    if (id !== activeSessionId) setChatKey((k) => k + 1);
    setIsNewChat(false);
  }

  async function handleDeleteSession(id: string) {
    try {
      await fetch(`/api/sessions/${id}`, { method: "DELETE" });
      sessionCache.delete(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (activeSessionId === id) {
        const remaining = sessions.filter((s) => s.id !== id);
        if (remaining.length > 0 && remaining[0]) {
          setActiveSessionId(remaining[0].id);
        } else {
          setActiveSessionId(null);
          setIsNewChat(true);
        }
        setChatKey((k) => k + 1);
      }
    } catch {
      // silently fail
    }
  }

  function handleStartEdit(id: string, currentTitle: string) {
    setEditingId(id);
    setEditTitle(currentTitle);
  }

  async function handleSaveEdit(id: string) {
    if (!editTitle.trim()) return;
    try {
      await fetch(`/api/sessions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle.trim() }),
      });
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, title: editTitle.trim() } : s))
      );
    } catch {
      // silently fail
    }
    setEditingId(null);
  }

  function formatTime(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return d.toLocaleDateString();
  }

  return (
    <div className="flex h-full -m-6">
      <aside className="flex w-64 flex-col border-r bg-card">
        <div className="flex items-center justify-between border-b p-3">
          <span className="text-sm font-semibold">Chats</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleNewSession}
            title="New chat"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {sidebarLoading ? (
            <div className="flex items-center justify-center p-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : sessions.length === 0 ? (
            <p className="p-4 text-xs text-muted-foreground text-center">
              No chats yet. Start one!
            </p>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                className={`group flex items-center justify-between px-3 py-2 cursor-pointer border-b border-border/40 transition-colors ${
                  activeSessionId === session.id
                    ? "bg-accent"
                    : "hover:bg-accent/50"
                }`}
                onClick={() => handleSelectSession(session.id)}
              >
                <div className="min-w-0 flex-1">
                  {editingId === session.id ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="w-full rounded border border-input bg-background px-1 py-0.5 text-xs"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveEdit(session.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSaveEdit(session.id);
                        }}
                        className="text-green-600 hover:text-green-700"
                      >
                        <Check className="h-3 w-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingId(null);
                        }}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs font-medium truncate">
                        {session.title}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatTime(session.updatedAt)}
                      </p>
                    </>
                  )}
                </div>

                {editingId !== session.id && (
                  <div className="ml-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartEdit(session.id, session.title);
                      }}
                      className="text-muted-foreground hover:text-foreground"
                      title="Rename"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSession(session.id);
                      }}
                      className="text-muted-foreground hover:text-destructive"
                      title="Delete"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </aside>

      <div className="flex flex-1 flex-col p-6">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold">
            {activeSessionId
              ? sessions.find((s) => s.id === activeSessionId)?.title ?? "Chat"
              : "New Chat"}
          </h1>
        </div>

        <ChatView
          key={chatKey}
          sessionId={activeSessionId}
          inputRef={inputRef}
          onSessionCreated={(id, title) => {
            setIsNewChat(false);
            setActiveSessionId(id);
            setSessions((prev) => [
              {
                id,
                title,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              ...prev,
            ]);
          }}
          onSessionUpdated={(id, lastMessage) => {
            setSessions((prev) =>
              prev.map((s) =>
                s.id === id
                  ? {
                      ...s,
                      updatedAt: new Date().toISOString(),
                      lastMessage: lastMessage ?? s.lastMessage,
                    }
                  : s
              )
            );
          }}
        />
      </div>
    </div>
  );
}

function ChatView({
  sessionId,
  inputRef,
  onSessionCreated,
  onSessionUpdated,
}: {
  sessionId: string | null;
  inputRef: React.RefObject<HTMLInputElement>;
  onSessionCreated: (id: string, title: string) => void;
  onSessionUpdated: (id: string, lastMessage?: string) => void;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [awaitingApproval, setAwaitingApproval] = useState(false);
  const [crashedToolCalls, setCrashedToolCalls] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{
    part: ChatPart;
    instruction: string;
    loading: boolean;
    error: string | null;
  } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const skipNextFetchRef = useRef<string | null>(null);

  const applyLoaded = useCallback((data: LoadedData) => {
    const msgs: ChatMsg[] = (data.messages ?? []).map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content ?? "",
      parts: normalizeParts(m.parts),
    }));

    // If the state is awaiting approval but the transcript has no pending
    // card (e.g. old row shape), synthesize one from chat_state.
    if (data.state?.pendingApproval) {
      setAwaitingApproval(true);
      const has = msgs.some((m) =>
        m.parts.some(
          (p) =>
            p.state === "approval-requested" &&
            p.approvalId === data.state.pendingApproval!.approvalId
        )
      );
      if (!has && msgs.length > 0) {
        const last = msgs[msgs.length - 1];
        if (last && last.role === "assistant") {
          last.parts = [
            ...last.parts,
            {
              type: `tool-${data.state.pendingApproval.toolName}`,
              toolName: data.state.pendingApproval.toolName,
              toolCallId: data.state.pendingApproval.toolCallId,
              approvalId: data.state.pendingApproval.approvalId,
              state: "approval-requested",
              input: data.state.pendingApproval.input,
            },
          ];
        }
      }
    } else {
      setAwaitingApproval(false);
    }
    setCrashedToolCalls(data.state?.crashedToolCalls ?? []);
    setMessages(msgs);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!sessionId) {
      setMessages([]);
      setCrashedToolCalls([]);
      setAwaitingApproval(false);
      setLoaded(true);
      return;
    }
    // This session was just created by a message we already streamed, so its
    // transcript is already on screen — skip the refetch to avoid a flash.
    if (skipNextFetchRef.current === sessionId) {
      skipNextFetchRef.current = null;
      setLoaded(true);
      return;
    }
    // Serve a previously-loaded session from cache for an instant switch.
    const cached = sessionCache.get(sessionId);
    if (cached) {
      applyLoaded(cached);
      setLoaded(true);
      return;
    }
    setLoaded(false);
    fetch(`/api/sessions/${sessionId}/messages`)
      .then((res) => res.json())
      .then((data: LoadedData) => {
        if (cancelled) return;
        sessionCache.set(sessionId, data);
        applyLoaded(data);
      })
      .catch(() => {
        if (!cancelled) setMessages([]);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, applyLoaded]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  function toolLabel(partType: string) {
    return partType.replace(/^tool-/, "");
  }

  function serializeConversation(all: ChatMsg[]): Array<{
    role: "user" | "assistant" | "tool";
    content: string;
  }> {
    const out: Array<{ role: "user" | "assistant" | "tool"; content: string }> =
      [];
    for (const msg of all) {
      if (msg.content) out.push({ role: msg.role, content: msg.content });
      for (const p of msg.parts) {
        if (p.type === "text") continue;
        if (p.type.startsWith("tool-")) {
          const line = [
            `[tool-call: ${toolLabel(p.type)}]`,
            JSON.stringify(p.input ?? {}),
          ];
          if (p.output !== undefined)
            line.push(`→ ${JSON.stringify(p.output)}`);
          out.push({ role: "tool", content: line.join(" ") });
        }
      }
    }
    return out;
  }

  async function streamEvents(
    url: string,
    body: Record<string, unknown>,
    onEvent: (event: Record<string, unknown>) => void
  ) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error ?? "Request failed");
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const line = chunk.trim();
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        let event: Record<string, unknown>;
        try {
          event = JSON.parse(payload);
        } catch {
          continue;
        }
        onEvent(event);
      }
    }
  }

  function appendLiveAssistant(
    content: string,
    parts: ChatPart[] = []
  ): ChatMsg {
    const msg: ChatMsg = {
      id: uid(),
      role: "assistant",
      content,
      parts,
      live: true,
    };
    setMessages((prev) => [...prev, msg]);
    return msg;
  }

  async function sendMessage(text: string) {
    const userMsg: ChatMsg = {
      id: uid(),
      role: "user",
      content: text,
      parts: [],
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setError(null);
    setStreaming(true);
    appendLiveAssistant("");

    let resolvedSessionId = sessionId;

    try {
      await streamEvents("/api/chat", { message: text, sessionId }, (event) => {
        switch (event.type) {
          case "text":
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === "assistant" && last.live) {
                return [
                  ...prev.slice(0, -1),
                  { ...last, content: last.content + String(event.text ?? "") },
                ];
              }
              return [...prev, ...[]];
            });
            break;
          case "tool":
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              const part: ChatPart = {
                type: `tool-${event.toolName}`,
                toolName: String(event.toolName),
                toolCallId: String(event.toolCallId),
                state: "complete",
                input: event.input,
              };
              if (last && last.role === "assistant" && last.live) {
                return [
                  ...prev.slice(0, -1),
                  { ...last, parts: [...last.parts, part] },
                ];
              }
              return [...prev, ...[]];
            });
            break;
          case "tool-result":
            applyToolResult(event);
            break;
          case "approval": {
            const part: ChatPart = {
              type: `tool-${event.toolName}`,
              toolName: String(event.toolName),
              toolCallId: String(event.toolCallId),
              approvalId: String(event.approvalId),
              state: "approval-requested",
              input: event.input,
            };
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === "assistant" && last.live) {
                return [
                  ...prev.slice(0, -1),
                  { ...last, parts: [...last.parts, part] },
                ];
              }
              return [...prev, ...[]];
            });
            setAwaitingApproval(true);
            break;
          }
          case "done":
            if (!resolvedSessionId && typeof event.sessionId === "string") {
              resolvedSessionId = event.sessionId;
              const title = text.length > 60 ? text.slice(0, 57) + "..." : text;
              skipNextFetchRef.current = event.sessionId;
              onSessionCreated(event.sessionId, title);
            }
            onSessionUpdated(resolvedSessionId ?? "", text);
            break;
          case "error":
            setError(String(event.error ?? "Something went wrong"));
            break;
        }
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setStreaming(false);
      setMessages((prev) =>
        prev.map((m) => (m.live ? { ...m, live: false } : m))
      );
      if (resolvedSessionId) sessionCache.delete(resolvedSessionId);
    }
  }

  function applyToolResult(event: Record<string, unknown>) {
    const toolCallId = String(event.toolCallId);
    const output = event.output;
    setMessages((prev) =>
      prev.map((m) => ({
        ...m,
        parts: m.parts.map((p) => {
          if (p.toolCallId !== toolCallId) return p;
          const rejected =
            output && typeof output === "object" && (output as { rejected?: boolean }).rejected;
          return {
            ...p,
            output,
            state: rejected ? "rejected" : "complete",
          };
        }),
      }))
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || streaming || awaitingApproval) return;
    await sendMessage(input.trim());
  }

  async function handleApprove(part: ChatPart) {
    if (!sessionId || !part.approvalId) return;
    setAwaitingApproval(false);
    setStreaming(true);
    setError(null);
    appendLiveAssistant("");
    try {
      await streamEvents(
        "/api/chat/approval",
        {
          sessionId,
          approvalId: part.approvalId,
          approved: true,
          input: part.revised ? part.input : undefined,
        },
        (event) => {
          switch (event.type) {
            case "text":
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last && last.role === "assistant" && last.live) {
                  return [
                    ...prev.slice(0, -1),
                    {
                      ...last,
                      content: last.content + String(event.text ?? ""),
                    },
                  ];
                }
                return prev;
              });
              break;
            case "tool":
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                const part: ChatPart = {
                  type: `tool-${event.toolName}`,
                  toolName: String(event.toolName),
                  toolCallId: String(event.toolCallId),
                  state: "complete",
                  input: event.input,
                };
                if (last && last.role === "assistant" && last.live) {
                  return [
                    ...prev.slice(0, -1),
                    { ...last, parts: [...last.parts, part] },
                  ];
                }
                return prev;
              });
              break;
            case "tool-result":
              applyToolResult(event);
              break;
            case "approval":
              setAwaitingApproval(true);
              break;
            case "done":
              onSessionUpdated(sessionId, "");
              break;
            case "error":
              setError(String(event.error ?? "Something went wrong"));
              break;
          }
        }
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setStreaming(false);
      setMessages((prev) =>
        prev.map((m) => (m.live ? { ...m, live: false } : m))
      );
      sessionCache.delete(sessionId);
    }
  }

  async function handleReject(part: ChatPart) {
    if (!sessionId || !part.approvalId) return;
    setAwaitingApproval(false);
    setStreaming(true);
    setError(null);
    appendLiveAssistant("");
    try {
      await streamEvents(
        "/api/chat/approval",
        {
          sessionId,
          approvalId: part.approvalId,
          approved: false,
        },
        (event) => {
          if (event.type === "text") {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === "assistant" && last.live) {
                return [
                  ...prev.slice(0, -1),
                  { ...last, content: last.content + String(event.text ?? "") },
                ];
              }
              return prev;
            });
          } else if (event.type === "tool-result") {
            applyToolResult(event);
          } else if (event.type === "done") {
            onSessionUpdated(sessionId, "");
          } else if (event.type === "error") {
            setError(String(event.error ?? "Something went wrong"));
          }
        }
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setStreaming(false);
      setMessages((prev) =>
        prev.map((m) => (m.live ? { ...m, live: false } : m))
      );
      sessionCache.delete(sessionId);
    }
  }

  function handleStartEdit(part: ChatPart) {
    setEditing({
      part,
      instruction: JSON.stringify(part.input ?? {}, null, 2),
      loading: false,
      error: null,
    });
  }

  async function handleModifySave() {
    if (!editing) return;
    const { part, instruction } = editing;
    if (!instruction.trim()) return;
    setEditing((prev) => (prev ? { ...prev, loading: true, error: null } : prev));

    try {
      const res = await fetch("/api/chat/modify-tool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolName: toolLabel(part.type),
          input: part.input ?? {},
          instruction: instruction.trim(),
          conversation: serializeConversation(messages),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setEditing((prev) =>
          prev
            ? { ...prev, loading: false, error: data?.error ?? "Failed to revise input" }
            : prev
        );
        return;
      }
      const { input: revised } = await res.json();
      setMessages((prev) =>
        prev.map((m) => ({
          ...m,
          parts: m.parts.map((p) =>
            p.approvalId === part.approvalId
              ? { ...p, input: revised, revised: true }
              : p
          ),
        }))
      );
      setEditing(null);
    } catch {
      setEditing((prev) =>
        prev
          ? { ...prev, loading: false, error: "Failed to revise input" }
          : prev
      );
    }
  }

  if (!loaded) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const inputDisabled = streaming || awaitingApproval;

  return (
    <>
      <div className="flex-1 overflow-y-auto space-y-4 pr-2">
        {crashedToolCalls.length > 0 && (
          <Card className="p-4 border-amber-500/50 bg-amber-50/50">
            <div className="flex items-center gap-2 text-sm text-amber-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                A sensitive action was interrupted before it could be confirmed
                to have completed. Please review your connected accounts before
                asking the assistant to repeat it.
              </span>
            </div>
          </Card>
        )}

        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-muted-foreground text-sm">
              Start a conversation — ask about emails, calendar, files, or
              sheets.
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div className="max-w-[80%] space-y-2">
                <Card
                  className={`p-4 ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-card"
                  }`}
                >
                  {msg.content ? (
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  ) : msg.role === "assistant" && msg.live ? (
                    <p className="text-sm text-muted-foreground">
                      <Loader2 className="inline h-3 w-3 animate-spin" /> Thinking…
                    </p>
                  ) : null}
                </Card>

                {msg.parts.map((part, pi) => {
                  if (part.state === "approval-requested") {
                    return (
                      <Card
                        key={pi}
                        className="p-4 border-amber-500/50 bg-amber-50/50"
                      >
                        <div className="flex items-center gap-2 text-xs text-amber-700 mb-2">
                          <ShieldAlert className="h-4 w-4" />
                          <span className="font-medium">
                            {toolLabel(part.type)} — requires approval
                          </span>
                        </div>
                        <pre className="mt-2 text-xs whitespace-pre-wrap bg-background p-3 rounded-md max-h-48 overflow-auto">
                          {JSON.stringify(part.input ?? {}, null, 2)}
                        </pre>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            className="h-8"
                            onClick={() => handleApprove(part)}
                          >
                            <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() => handleStartEdit(part)}
                          >
                            <Pencil className="mr-1 h-3.5 w-3.5" />
                            Modify
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-8"
                            onClick={() => handleReject(part)}
                          >
                            <X className="mr-1 h-3.5 w-3.5" />
                            Reject
                          </Button>
                        </div>
                      </Card>
                    );
                  }
                  if (
                    part.state === "complete" ||
                    part.state === "rejected" ||
                    part.state === "error"
                  ) {
                    return (
                      <Card key={pi} className="p-3 bg-muted/50">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                          <Wrench className="h-3 w-3" />
                          <span className="font-medium">
                            {toolLabel(part.type)}
                            {part.state === "rejected" && " (rejected)"}
                            {part.state === "error" && " (failed)"}
                          </span>
                        </div>
                        <details className="mt-1">
                          <summary className="cursor-pointer text-muted-foreground">
                            Details
                          </summary>
                          <pre className="mt-1 text-xs whitespace-pre-wrap bg-background p-2 rounded max-h-48 overflow-auto">
                            {JSON.stringify(
                              { input: part.input, output: part.output },
                              null,
                              2
                            )}
                          </pre>
                        </details>
                      </Card>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          ))
        )}

        {error && (
          <div className="flex justify-center">
            <Card className="p-3 border-destructive/50 bg-destructive/10">
              <p className="text-xs text-destructive">{error}</p>
            </Card>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg border bg-background p-4 shadow-lg">
            <h3 className="text-sm font-semibold mb-1">Modify tool input</h3>
            <p className="text-xs text-muted-foreground mb-2">
              Edit the JSON directly, or describe the change in plain language —
              the AI will apply it, then ask for approval again.
            </p>
            <textarea
              value={editing.instruction}
              onChange={(e) =>
                setEditing((prev) =>
                  prev ? { ...prev, instruction: e.target.value, error: null } : prev
                )
              }
              rows={8}
              placeholder="مثال: بدّل الموضوع إلى اجتماع عاجل وأضف كربون كوبي"
              className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              spellCheck={false}
              disabled={editing.loading}
            />
            {editing.error && (
              <p className="mt-2 text-xs text-destructive">{editing.error}</p>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing(null)}
                disabled={editing.loading}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleModifySave}
                disabled={editing.loading || !editing.instruction.trim()}
              >
                {editing.loading ? (
                  <>
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    Revising…
                  </>
                ) : (
                  "Revise input"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-4 flex gap-2 border-t pt-4">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            awaitingApproval
              ? "Resolve the pending approval first…"
              : "Ask about emails, calendar, files..."
          }
          disabled={inputDisabled}
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        />
        <Button type="submit" disabled={inputDisabled || !input.trim()}>
          {streaming ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </form>
    </>
  );
}
