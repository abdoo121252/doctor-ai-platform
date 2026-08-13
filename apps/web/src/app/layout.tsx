import type { Metadata } from "next";
import "./globals.css";
import { ErrorBoundary, ErrorReporter } from "@/components/error-reporter";

export const metadata: Metadata = {
  title: "Doctor AI Assistant",
  description: "AI-powered personal assistant for doctors",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background antialiased">
        <ErrorReporter />
        <ErrorBoundary>{children}</ErrorBoundary>
      </body>
    </html>
  );
}
