"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase/browser";
import { Sidebar, type SidebarItem } from "@/components/layout/sidebar";

const MENU_ITEMS: SidebarItem[] = [
  { label: "Dashboard", href: "/ched", icon: "🏠", processFn: "1.0" },
  { label: "Scholarships Applications", href: "/ched/applications", icon: "📄", processFn: "2.0" },
  { label: "Ranking Result", href: "/ched/ranking", icon: "🤖", processFn: "3.0" },
  { label: "Scholarships Approval List", href: "/ched/approvals", icon: "✅", processFn: "4.0" },
];

export default function ChedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [username, setUsername] = useState("CHED");
  const [notifCount, setNotifCount] = useState(0);
  useEffect(() => {
    const sb = getSupabase();
    sb.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push("/login"); return; }
      const { data: rows } = await sb.from("users").select("username, role").eq("auth_user_id", session.user.id);
      const row = (rows || []).find((u) => u.role !== "Student") || rows?.[0];
      if (!row) { router.push("/login"); return; }
      if (row.username) setUsername(row.username);
      if (row.role !== "CHED") {
        const home = row.role === "Admin" ? "/admin" : row.role === "Faculty" ? "/faculty" : "/student";
        router.replace(home);
        return;
      }
      sb.from("scholarship_applications").select("application_id", { count: "exact", head: true }).eq("application_status", "Pending").then(({ count }) => { setNotifCount(count ?? 0); });
    });
  }, [router]);
  const handleLogout = async () => { await getSupabase().auth.signOut(); router.push("/login"); };
  return (
    <div className="min-h-screen bg-[#FAF7F5]">
      <Sidebar items={MENU_ITEMS} title="St. Peter's College" subtitle="CHED Review Portal" username={username} userRole="CHED Personnel" onLogout={handleLogout} notificationCount={notifCount} notificationHref="/ched/applications" />
      <main className="min-h-screen p-4 pt-16 lg:ml-64 lg:p-8 lg:pt-6">{children}</main>
    </div>
  );
}
