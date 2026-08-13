"use client";

import { Component, useEffect, type ReactNode } from "react";

function report(
  level: "error" | "warn",
  source: string,
  message: string,
  details?: Record<string, unknown>
) {
  fetch("/api/logs/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ level, source, message, details }),
  }).catch(() => {});
}

/** Captures unhandled window errors and promise rejections. */
export function ErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      report("error", "client", e.message || "window error", {
        filename: e.filename,
        lineno: e.lineno,
        colno: e.colno,
        stack: e.error instanceof Error ? e.error.stack : undefined,
      });
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      report(
        "error",
        "client",
        r instanceof Error ? r.message : String(r),
        { stack: r instanceof Error ? r.stack : undefined }
      );
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}

/** Catches React render errors and reports them before showing a fallback. */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    report("error", "react", error.message, {
      stack: error.stack,
      componentStack: info.componentStack,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: "40px 24px",
            textAlign: "center",
            fontFamily: "monospace",
            fontSize: 14,
          }}
        >
          Something went wrong. Check the Logs page.
        </div>
      );
    }
    return this.props.children;
  }
}
