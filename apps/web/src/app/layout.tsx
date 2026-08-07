import type { Metadata } from "next";
import "./globals.css";

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
        {children}
      </body>
    </html>
  );
}
