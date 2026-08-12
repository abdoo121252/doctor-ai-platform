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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useChat } from "@ai-sdk/react";
import { lastAssistantMessageIsCompleteWithApprovalResponses } from "ai";
import { useTriggerChatTransport } from "@trigger.dev/sdk/chat/react";
import {
  startChatSession,
  mintChatAccessToken,
  getCurrentDoctorId,
} from "@/app/actions";

interface Session {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastMessage?: string;
}

interface SessionResumeState {
  publicAccessToken: string | null;
  lastEventId: string | null;
}

interface LoadedMessages {
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    parts?: AnyUIMessage["parts"] | string;
  }>;
  session: SessionResumeState;
}

const CHAT_TASK_ID = "doctor-chat";

const sessionMessagesCache = new Map<string, AnyUIMessage[]>();
const sessionResumeCache = new Map<
  string,
  { publicAccessToken: string; lastEventId?: string }
>();

export default function ChatPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sidebarLoading, setSidebarLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [isNewChat, setIsNewChat] = useState(false);
  const [pendingFirstMessage, setPendingFirstMessage] = useState<string | null>(null);
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
    setIsNewChat(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function handleSelectSession(id: string) {
    setActiveSessionId(id);
    setIsNewChat(false);
    setPendingFirstMessage(null);
  }

  async function handleDeleteSession(id: string) {
    try {
      await fetch(`/api/sessions/${id}`, { method: "DELETE" });
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (activeSessionId === id) {
        const remaining = sessions.filter((s) => s.id !== id);
        if (remaining.length > 0 && remaining[0]) {
          setActiveSessionId(remaining[0].id);
        } else {
          setActiveSessionId(null);
          setIsNewChat(true);
        }
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

  function handleCancelEdit() {
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
                          if (e.key === "Escape") handleCancelEdit();
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
                          handleCancelEdit();
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
              ? sessions.find((s) => s.id === activeSessionId)?.title ??
                "Chat"
              : "New Chat"}
          </h1>
        </div>

        <ChatSession
          key={activeSessionId ?? "new"}
          sessionId={activeSessionId}
          pendingFirstMessage={pendingFirstMessage}
          inputRef={inputRef}
          onSessionCreated={(id, title, firstMessage) => {
            // Pre-seed the cache so ChatSession skips the DB round-trip
            // when it remounts with the new session id.
            sessionMessagesCache.set(id, []);
            setIsNewChat(false);
            setActiveSessionId(id);
            setPendingFirstMessage(firstMessage ?? null);
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
          onSessionUpdated={(id, title, lastMessage) => {
            setSessions((prev) =>
              prev.map((s) =>
                s.id === id
                  ? {
                      ...s,
                      title: title ?? s.title,
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyUIMessage = any;

/**
 * Loads history + resume state for the given session, then renders the
 * transport-backed chat. `useChat` initializes from `initialMessages` at
 * mount, so we gate rendering until history is loaded.
 */
function ChatSession({
  sessionId,
  pendingFirstMessage,
  inputRef,
  onSessionCreated,
  onSessionUpdated,
}: {
  sessionId: string | null;
  pendingFirstMessage: string | null;
  inputRef: React.RefObject<HTMLInputElement>;
  onSessionCreated: (id: string, title: string, firstMessage?: string) => void;
  onSessionUpdated: (id: string, title?: string, lastMessage?: string) => void;
}) {
  const [initialMessages, setInitialMessages] = useState<AnyUIMessage[]>([]);
  const [resumeSessions, setResumeSessions] = useState<
    Record<string, { publicAccessToken: string; lastEventId?: string }> | undefined
  >(undefined);
  const [doctorId, setDoctorId] = useState<string | undefined>(undefined);
  const [doctorIdReady, setDoctorIdReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const messagesSnapshotRef = useRef<AnyUIMessage[]>([]);

  useEffect(() => {
    let cancelled = false;
    getCurrentDoctorId()
      .then((id) => {
        if (!cancelled) setDoctorId(id);
      })
      .catch(() => {
        if (!cancelled) setDoctorId(undefined);
      })
      .finally(() => {
        if (!cancelled) setDoctorIdReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Save messages to cache before unmount (session switch or page close)
  useEffect(() => {
    return () => {
      if (sessionId && messagesSnapshotRef.current.length > 0) {
        sessionMessagesCache.set(sessionId, [...messagesSnapshotRef.current]);
      }
    };
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;
    if (!doctorIdReady) return;
    if (!sessionId) {
      setInitialMessages([]);
      setResumeSessions(undefined);
      setLoaded(true);
      return;
    }

    const cached = sessionMessagesCache.get(sessionId);
    if (cached !== undefined) {
      setInitialMessages(cached);
      const cr = sessionResumeCache.get(sessionId);
      setResumeSessions(
        cr ? { [sessionId]: cr } : undefined
      );
      setLoaded(true);
      // Background refresh: retry up to 6 times (1s→2s→4s→8s→16s→32s) so
      // the worker has enough time to persist new messages to the DB before
      // we give up. Stops early once the API returns more messages than the
      // cache (meaning the worker completed and persisted).
      (function refresh(attempt: number) {
        const maxAttempts = 6;
        fetch(`/api/sessions/${sessionId}/messages`)
          .then((res) => res.json())
          .then((data: LoadedMessages) => {
            const apiLen = data.messages?.length ?? 0;
            const cacheLen = cached?.length ?? 0;
            if (apiLen > cacheLen || attempt >= maxAttempts) {
              const target =
                apiLen >= cacheLen ? data.messages : cached;
              setInitialMessages(
                target.map((m) => {
                  const storedParts =
                    Array.isArray(m.parts) && m.parts.length > 0
                      ? (m.parts as AnyUIMessage["parts"])
                      : undefined;
                  const parts = storedParts ?? [
                    { type: "text", text: m.content } as AnyUIMessage,
                  ];
                  return {
                    id: m.id,
                    role: m.role,
                    content: m.content,
                    parts,
                  };
                })
              );
              if (data.session?.publicAccessToken) {
                setResumeSessions({
                  [sessionId]: {
                    publicAccessToken: data.session.publicAccessToken,
                    lastEventId: data.session.lastEventId ?? undefined,
                  },
                });
              }
            } else {
              setTimeout(() => refresh(attempt + 1), 1000 * 2 ** attempt);
            }
          })
          .catch(() => {
            if (attempt < maxAttempts) {
              setTimeout(() => refresh(attempt + 1), 1000 * 2 ** attempt);
            }
          });
      })(0);
      return;
    }

    setLoaded(false);
    fetch(`/api/sessions/${sessionId}/messages`)
      .then((res) => res.json())
      .then((data: LoadedMessages) => {
        if (cancelled) return;
        setInitialMessages(
          data.messages.map((m) => {
            const storedParts =
              Array.isArray(m.parts) && m.parts.length > 0
                ? (m.parts as AnyUIMessage["parts"])
                : undefined;
            const parts = storedParts ?? [
              { type: "text", text: m.content } as AnyUIMessage,
            ];
            return {
              id: m.id,
              role: m.role,
              content: m.content,
              parts,
            };
          })
        );
        if (data.session?.publicAccessToken) {
          setResumeSessions({
            [sessionId]: {
              publicAccessToken: data.session.publicAccessToken,
              lastEventId: data.session.lastEventId ?? undefined,
            },
          });
        } else {
          setResumeSessions(undefined);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setInitialMessages([]);
        setResumeSessions(undefined);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, doctorIdReady]);

  if (!loaded || !doctorIdReady) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <ChatInner
      sessionId={sessionId}
      initialMessages={initialMessages}
      resumeSessions={resumeSessions}
      doctorId={doctorId}
      pendingFirstMessage={pendingFirstMessage}
      inputRef={inputRef}
      onSessionCreated={onSessionCreated}
      onSessionUpdated={onSessionUpdated}
      onMessagesSnapshot={(msgs) => {
        messagesSnapshotRef.current = msgs;
      }}
    />
  );
}

function ChatInner({
  sessionId,
  initialMessages,
  resumeSessions,
  doctorId,
  pendingFirstMessage,
  inputRef,
  onSessionCreated,
  onSessionUpdated,
  onMessagesSnapshot,
}: {
  sessionId: string | null;
  initialMessages: AnyUIMessage[];
  resumeSessions:
    | Record<string, { publicAccessToken: string; lastEventId?: string }>
    | undefined;
  doctorId?: string;
  pendingFirstMessage: string | null;
  inputRef: React.RefObject<HTMLInputElement>;
  onSessionCreated: (id: string, title: string, firstMessage?: string) => void;
  onSessionUpdated: (id: string, title?: string, lastMessage?: string) => void;
  onMessagesSnapshot?: (msgs: AnyUIMessage[]) => void;
}) {
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<{
    index: number;
    partIndex: number;
    instruction: string;
    loading: boolean;
    error: string | null;
  } | null>(null);
  const sentFirst = useRef(false);

  const transport = useTriggerChatTransport({
    task: CHAT_TASK_ID,
    clientData: doctorId ? { doctorId } : undefined,
    accessToken: ({ chatId }) => mintChatAccessToken(chatId),
    startSession: ({ chatId, clientData }) =>
      startChatSession({ chatId, clientData }),
    sessions: resumeSessions,
  });

  const handleInputFocus = useCallback(() => {
    if (sessionId) {
      transport.preload(sessionId);
    }
  }, [sessionId, transport]);

  const {
    messages,
    sendMessage,
    addToolApprovalResponse,
    setMessages,
    status,
  } = useChat<AnyUIMessage>({
    id: sessionId ?? "new",
    messages: initialMessages,
    transport,
    resume: initialMessages.length > 0 && !!sessionId,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });

  // Feed the current messages back to ChatSession for cross-session caching
  useEffect(() => {
    onMessagesSnapshot?.(messages);
  }, [messages, onMessagesSnapshot]);

  // Auto-send the pending first message for a brand-new chat
  useEffect(() => {
    if (pendingFirstMessage && sessionId && !sentFirst.current) {
      sentFirst.current = true;
      void sendMessage({ text: pendingFirstMessage });
      onSessionUpdated(
        sessionId,
        undefined,
        pendingFirstMessage.length > 60
          ? pendingFirstMessage.slice(0, 57) + "..."
          : pendingFirstMessage
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFirstMessage, sessionId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  const streaming = status === "streaming" || status === "submitted";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || streaming) return;

    const text = input.trim();
    setInput("");

    if (!sessionId) {
      // Brand-new chat: create the session row, await the Trigger.dev
      // session start so the run is registered, then seed both caches
      // before the parent remounts ChatSession. This eliminates the
      // session-switch spinner (cache hit → no API load) AND the
      // transport connection handshake (session already exists on
      // Trigger.dev → no server-action round-trip).
      try {
        const res = await fetch("/api/sessions", { method: "POST" });
        if (!res.ok) throw new Error("Failed to create session");
        const session = await res.json();

        // Await — the run is registered on Trigger.dev before we switch.
        const triggerResult = await startChatSession({
          chatId: session.id,
          clientData: doctorId ? { doctorId } : undefined,
        });

        // Seed caches so ChatSession sees the session as "already loaded"
        // and the transport can skip the startSession handshake.
        sessionMessagesCache.set(session.id, []);
        if (triggerResult?.publicAccessToken) {
          sessionResumeCache.set(session.id, {
            publicAccessToken: triggerResult.publicAccessToken,
          });
        }

        onSessionCreated(
          session.id,
          text.length > 60 ? text.slice(0, 57) + "..." : text,
          text
        );
      } catch (error) {
        console.error("Failed to create session", error);
        setInput(text);
      }
      return;
    }

    // Fire-and-forget: save message to DB and wake the Trigger.dev agent
    // via the submit endpoint. Uses keepalive so the request survives
    // tab close — even if the user navigates away, the message is
    // persisted and the agent processes it.
    fetch(`/api/sessions/${sessionId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text }),
      keepalive: true,
    }).catch(() => {
      // endpoint handled or tab closed — nothing to do
    });

    await sendMessage({ text });
    onSessionUpdated(
      sessionId,
      undefined,
      text.length > 60 ? text.slice(0, 57) + "..." : text
    );
  }

  function handleApprove(index: number, partIndex: number) {
    const part = messages[index]?.parts?.[partIndex];
    const approvalId = part?.approval?.id;
    if (!approvalId) return;
    addToolApprovalResponse({ id: approvalId, approved: true });
  }

  function handleReject(index: number, partIndex: number) {
    const part = messages[index]?.parts?.[partIndex];
    const approvalId = part?.approval?.id;
    if (!approvalId) return;
    addToolApprovalResponse({
      id: approvalId,
      approved: false,
      reason: "Rejected by doctor",
    });
  }

  function handleStartEdit(index: number, partIndex: number) {
    const part = messages[index]?.parts?.[partIndex];
    const approvalId = part?.approval?.id;
    if (!approvalId) return;
    setEditing({
      index,
      partIndex,
      instruction: JSON.stringify(part.input ?? {}, null, 2),
      loading: false,
      error: null,
    });
  }

  async function handleModifySave() {
    if (!editing) return;
    const { index, partIndex, instruction } = editing;
    const part = messages[index]?.parts?.[partIndex];
    const approvalId = part?.approval?.id;
    if (!approvalId || !instruction.trim()) return;

    setEditing((prev) => (prev ? { ...prev, loading: true, error: null } : prev));

    try {
      const res = await fetch("/api/chat/modify-tool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolName: String(part.type).replace(/^tool-/, ""),
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

      // Show the revised input on the card, still awaiting approval
      setMessages((prev: AnyUIMessage[]) => {
        return prev.map((m, i) =>
          i === index
            ? {
                ...m,
                parts: m.parts.map((p: AnyUIMessage, pi: number) =>
                  pi === partIndex ? { ...p, input: revised } : p
                ),
              }
            : m
        );
      });

      // Persist the revised input in the worker's durable chain so the
      // subsequent Approve executes the modified input, not the original.
      const message = messages[index];
      if (sessionId && message) {
        void transport.sendAction(sessionId, {
          type: "modify-tool-input",
          messageId: message.id,
          toolCallId: part.toolCallId,
          input: revised,
        });
      }

      setEditing(null);
    } catch {
      setEditing((prev) =>
        prev
          ? { ...prev, loading: false, error: "Failed to revise input" }
          : prev
      );
    }
  }

  function handleCancelEdit() {
    setEditing(null);
  }

  function toolLabel(partType: string) {
    return partType.replace(/^tool-/, "");
  }

  // AI SDK v7 UIMessage has no `content` field — text lives in parts.
  // This extracts the plain text (and any tool metadata summary) for
  // rendering inside the bubble.
  function messageText(msg: AnyUIMessage): string {
    if (typeof msg.content === "string" && msg.content) return msg.content;
    if (!msg.parts || !Array.isArray(msg.parts)) return "";
    return msg.parts
      .filter((p: AnyUIMessage) => p?.type === "text" && typeof p?.text === "string")
      .map((p: AnyUIMessage) => p.text)
      .join("");
  }

  // Serialize the visible conversation into the same transcript shape the
  // main agent receives ({role, content}[]), including tool calls, so the
  // edit-AI can resolve references from the full context.
  function serializeConversation(all: AnyUIMessage[]): Array<{
    role: "user" | "assistant" | "tool";
    content: string;
  }> {
    const out: Array<{ role: "user" | "assistant" | "tool"; content: string }> =
      [];
    for (const msg of all) {
      const text = messageText(msg);
      if (text) out.push({ role: msg.role, content: text });
      for (const p of (msg.parts ?? []) as AnyUIMessage[]) {
        if (p?.type === "text") continue;
        if (typeof p?.type === "string" && p.type.startsWith("tool-")) {
          const name = p.type.replace(/^tool-/, "");
          const line = [`[tool-call: ${name}]`, JSON.stringify(p.input ?? {})];
          if (p.output !== undefined) line.push(`→ ${JSON.stringify(p.output)}`);
          out.push({ role: "tool", content: line.join(" ") });
        }
      }
    }
    return out;
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto space-y-4 pr-2">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-muted-foreground text-sm">
              Start a conversation — ask about emails, calendar, files, or
              sheets.
            </p>
          </div>
        ) : (
          messages.map((msg: AnyUIMessage, i: number) => (
            <div
              key={msg.id ?? i}
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
                  <p className="text-sm whitespace-pre-wrap">
                    {messageText(msg) ||
                      (streaming && msg.role === "assistant" ? (
                        <span className="text-muted-foreground">
                          <Loader2 className="inline h-3 w-3 animate-spin" />{" "}
                          Thinking…
                        </span>
                      ) : (
                        ""
                      ))}
                  </p>
                </Card>

                {msg.parts
                  ?.map((part: AnyUIMessage, pi: number) => ({ part, pi }))
                  .filter(({ part }: { part: AnyUIMessage }) => {
                    if (part.type === "text") return false;
                    return (
                      part.state === "approval-requested" ||
                      part.state === "approval-responded" ||
                      (part.type.startsWith("tool-") && part.state === "complete")
                    );
                  })
                  .map(({ part, pi }: { part: AnyUIMessage; pi: number }) => {
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
                              onClick={() => handleApprove(i, pi)}
                            >
                              <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8"
                              onClick={() => handleStartEdit(i, pi)}
                            >
                              <Pencil className="mr-1 h-3.5 w-3.5" />
                              Modify
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-8"
                              onClick={() => handleReject(i, pi)}
                            >
                              <X className="mr-1 h-3.5 w-3.5" />
                              Reject
                            </Button>
                          </div>
                        </Card>
                      );
                    }
                    if (
                      part.state === "approval-responded" ||
                      (part.type.startsWith("tool-") && part.state === "complete")
                    ) {
                      return (
                        <Card key={pi} className="p-3 bg-muted/50">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                            <Wrench className="h-3 w-3" />
                            <span className="font-medium">
                              {toolLabel(part.type)}
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

        {editing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-lg rounded-lg border bg-background p-4 shadow-lg">
              <h3 className="text-sm font-semibold mb-1">Modify tool input</h3>
              <p className="text-xs text-muted-foreground mb-2">
                Edit the JSON directly, or describe the change in plain language
                — the AI will apply it, then ask for approval again.
              </p>
              <textarea
                value={editing.instruction}
                onChange={(e) =>
                  setEditing((prev) =>
                    prev
                      ? { ...prev, instruction: e.target.value, error: null }
                      : prev
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
                  onClick={handleCancelEdit}
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

        <div ref={endRef} />
      </div>

      <form onSubmit={handleSubmit} className="mt-4 flex gap-2 border-t pt-4">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={handleInputFocus}
          placeholder="Ask about emails, calendar, files..."
          disabled={streaming}
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        />
        <Button type="submit" disabled={streaming || !input.trim()}>
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
