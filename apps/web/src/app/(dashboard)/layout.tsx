import { createServerSupabase } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabase();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="flex h-screen">
      <Sidebar userEmail={session.user.email} />
      <main className="flex-1 overflow-auto p-6">
        {children}
      </main>
    </div>
  );
}
