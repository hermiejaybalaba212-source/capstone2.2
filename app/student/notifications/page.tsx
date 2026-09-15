"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase/browser";
import { formatDateTime } from "@/lib/utils";
import { NOTIFICATION_TYPE_STYLES } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";

interface Notification {
  notification_id: number;
  student_id: number;
  title: string;
  message: string;
  notification_type: string;
  date_sent: string;
  is_read?: boolean;
  status?: string;
}

export default function NotificationsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [studentId, setStudentId] = useState<number | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => {
    let ignore = false;
    async function startFetching() {
      const sb = getSupabase();
      const { data: sessionData } = await sb.auth.getSession();
      if (!sessionData.session) {
        router.push("/login");
        return;
      }

      const { data: authUser } = await sb.auth.getUser();

      const userId = authUser.user?.id;
      if (!userId) { setLoading(false); return; }

      const userQuery = await sb
        .from("users")
        .select("user_id")
        .eq("auth_user_id", userId)
        .maybeSingle();

      if (userQuery.error || !userQuery.data) {
        setLoading(false);
        return;
      }

      const accountQuery = await sb
        .from("student_accounts")
        .select("student_id")
        .eq("user_id", userQuery.data.user_id)
        .maybeSingle();

      if (accountQuery.error || !accountQuery.data) {
        setLoading(false);
        return;
      }

      const sid = accountQuery.data.student_id;
      setStudentId(sid);

      const { data, error } = await sb
        .from("notifications_announcements")
        .select("*")
        .eq("student_id", sid)
        .order("date_sent", { ascending: false });

      if (!error && data) {
        setNotifications(data);
      }

      if (!ignore) setLoading(false);
    }
    startFetching();
    return () => { ignore = true; };
  }, [router]);

  async function markAllAsRead() {
    if (!studentId) return;
    const unread = notifications.filter((n) => n.status === "Unread");
    if (unread.length === 0) return;

    setMarkingAll(true);
    const sb = getSupabase();

    const ids = unread.map((n) => n.notification_id);
    const { error } = await sb
      .from("notifications_announcements")
      .update({ status: "Read" })
      .eq("student_id", studentId)
      .in("notification_id", ids);

    if (!error) {
      setNotifications((prev) => prev.map((n) => ({ ...n, status: "Read" })));
    }

    setMarkingAll(false);
  }

  const unreadCount = notifications.filter((n) => n.status === "Unread").length;

  if (loading) {
    return <Spinner label="Loading notifications..." />;
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-900">Notifications</h1>
        {unreadCount > 0 && (
          <button
            onClick={markAllAsRead}
            disabled={markingAll}
            className="rounded-lg bg-[#7B1113] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#540111] disabled:opacity-60"
          >
            {markingAll ? "Marking\u2026" : `Mark all as read (${unreadCount})`}
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon="🔔"
            title="No notifications yet"
            hint="You will see updates here when available."
          />
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {notifications.map((n) => (
            <div
              key={n.notification_id}
              className={`rounded-xl border p-5 shadow-sm ${
                n.status === "Unread"
                  ? "border-[#7B1113]/20 bg-white"
                  : "border-gray-200 bg-gray-50"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {n.status === "Unread" && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-[#7B1113]" />
                    )}
                    <p
                      className={`text-xs ${
                        n.status === "Unread"
                          ? "font-bold text-gray-900"
                          : "text-gray-600"
                      }`}
                    >
                      {n.title}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{n.message}</p>
                  <p className="mt-1 text-[11px] text-gray-400">
                    {formatDateTime(n.date_sent)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {n.notification_type && (
                    <Badge className={NOTIFICATION_TYPE_STYLES[n.notification_type] || ""}>
                      {n.notification_type}
                    </Badge>
                  )}
                  <Badge
                    className={
                      n.status === "Unread"
                        ? "border-amber-200 bg-amber-100 text-amber-800"
                        : "border-gray-200 bg-gray-100 text-gray-600"
                    }
                  >
                    {n.status === "Unread" ? "Unread" : "Read"}
                  </Badge>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
