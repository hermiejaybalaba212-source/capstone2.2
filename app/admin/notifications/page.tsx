"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase/browser";
import { formatDateTime } from "@/lib/utils";
import { NOTIFICATION_TYPE_STYLES } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";

interface StudentAccount {
  student_id: number;
  given_name?: string;
  last_name?: string;
  student_number?: string;
}

interface Notification {
  notification_id: number;
  student_id: number;
  title: string;
  message: string;
  notification_type: string;
  date_sent: string;
  student_accounts?: { given_name?: string; last_name?: string };
}

const NOTIFICATION_TYPES = ["Announcement", "Status Update", "Warning", "Scholarship"];

export default function NotificationsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<StudentAccount[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [message, setMessage] = useState("");

  const [form, setForm] = useState({ student_id: "", title: "", message: "", notification_type: "Announcement" });
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let ignore = false;
    async function startFetching() {
      const sb = getSupabase();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { router.push("/login"); return; }

      const [studentsQ, notifQ] = await Promise.all([
        sb.from("student_accounts").select("student_id, given_name, last_name, student_number").order("last_name", { ascending: true }),
        sb.from("notifications_announcements").select("*, student_accounts(given_name, last_name)").order("date_sent", { ascending: false }),
      ]);

      if (!studentsQ.error) setStudents(studentsQ.data || []);
      if (!notifQ.error) setNotifications(notifQ.data || []);
      if (!ignore) setLoading(false);
    }
    startFetching();
    return () => { ignore = true; };
  }, [router]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setSending(true);
    const sb = getSupabase();

    const { error } = await sb.from("notifications_announcements").insert({
      student_id: Number(form.student_id),
      title: form.title.trim(),
      message: form.message.trim(),
      notification_type: form.notification_type,
      status: "Unread",
    });

    setSending(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setForm({ student_id: "", title: "", message: "", notification_type: "Announcement" });
    setMessage("Notification sent successfully.");

    const { data } = await sb
      .from("notifications_announcements")
      .select("*, student_accounts(given_name, last_name)")
      .order("date_sent", { ascending: false });

    if (data) setNotifications(data);
  }

  if (loading) return <Spinner label="Loading notifications..." color="maroon" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-[#241012]">Notifications</h1>
        <span className="text-xs text-[#8B7376]">Process 8.0</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-bold text-[#241012]">Compose Notification</h2>
          <form onSubmit={handleSend} className="space-y-4">
            <label className="block text-xs font-semibold text-[#241012]">
              Recipient (Student)
              <select
                value={form.student_id}
                onChange={(e) => setForm({ ...form, student_id: e.target.value })}
                required
                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-xs outline-none focus:border-[#7B1113]"
              >
                <option value="">Select a student...</option>
                {students.map((s) => (
                  <option key={s.student_id} value={s.student_id}>
                    {s.last_name}, {s.given_name} ({s.student_number})
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs font-semibold text-[#241012]">
              Title
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-xs outline-none focus:border-[#7B1113]"
                placeholder="Notification title"
              />
            </label>

            <label className="block text-xs font-semibold text-[#241012]">
              Message
              <textarea
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                required
                rows={4}
                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-xs outline-none focus:border-[#7B1113]"
                placeholder="Type your message..."
              />
            </label>

            <label className="block text-xs font-semibold text-[#241012]">
              Type
              <select
                value={form.notification_type}
                onChange={(e) => setForm({ ...form, notification_type: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-xs outline-none focus:border-[#7B1113]"
              >
                {NOTIFICATION_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>

            {message && (
              <div className={`rounded-lg px-4 py-3 text-xs font-medium ${
                message.includes("success")
                  ? "border border-green-200 bg-green-50 text-green-700"
                  : "border border-red-200 bg-red-50 text-red-700"
              }`}>
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={sending}
              className="rounded-lg bg-[#7B1113] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#540111] disabled:opacity-50"
            >
              {sending ? "Sending..." : "Send Notification"}
            </button>
          </form>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-bold text-[#241012]">Sent Notifications</h2>
          {notifications.length === 0 ? (
            <EmptyState icon="&#128276;" title="No notifications sent yet" />
          ) : (
            <ul className="space-y-3">
              {notifications.map((n) => (
                <li key={n.notification_id} className="rounded-lg border border-gray-100 bg-gray-50/50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#241012]">{n.title}</p>
                      <p className="mt-0.5 text-[11px] text-[#6B5458]">
                        To: {n.student_accounts?.last_name}, {n.student_accounts?.given_name}
                      </p>
                      <p className="mt-1 text-[11px] text-[#8B7376] line-clamp-2">{n.message}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge className={NOTIFICATION_TYPE_STYLES[n.notification_type] || ""}>
                        {n.notification_type}
                      </Badge>
                      <span className="text-[10px] text-[#8B7376]">{formatDateTime(n.date_sent)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
