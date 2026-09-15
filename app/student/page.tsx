"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase/browser";
import { getRegistrarSupabase } from "@/lib/supabase/registrar";
import { formatDateTime } from "@/lib/utils";
import { STATUS_STYLES, NOTIFICATION_TYPE_STYLES } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { StatCard } from "@/components/ui/stat-card";

interface EarlyWarningAlert {
  warning_id: number;
  student_id: number;
  status: string;
  risk_level?: string;
  warning_message?: string;
  gpa?: number;
  average_grade?: number;
  warning_date: string;
}

interface Notification {
  notification_id: number;
  student_id?: number;
  title?: string;
  message: string;
  notification_type?: string;
  date_sent: string;
  is_read?: boolean;
  status?: string;
}

interface Stats {
  activePrograms: number;
  myApplications: number;
  unreadNotifications: number;
  academicRecords: number;
}

export default function StudentDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState("");
  const [verified, setVerified] = useState<boolean | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [stats, setStats] = useState<Stats>({ activePrograms: 0, myApplications: 0, unreadNotifications: 0, academicRecords: 0 });
  const [alerts, setAlerts] = useState<EarlyWarningAlert[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    let ignore = false;
    async function startFetching() {
      setFatalError("");

      const sb = getSupabase();
      const { data: sessionData } = await sb.auth.getSession();
      if (!sessionData.session) {
        router.push("/login");
        return;
      }

      const { data: authUser } = await sb.auth.getUser();
      const authUserId = authUser.user?.id;
      if (!authUserId) {
        setFatalError("Your session is invalid. Please log in again.");
        setLoading(false);
        return;
      }

      try {
      const userQuery = await sb
        .from("users")
        .select("user_id")
        .eq("auth_user_id", authUserId)
        .maybeSingle();

      if (userQuery.error || !userQuery.data) {
        setFatalError("Could not find your user record. Please contact the Scholarship Office.");
        setLoading(false);
        return;
      }

      const accountQuery = await sb
        .from("student_accounts")
        .select("student_id")
        .eq("user_id", userQuery.data.user_id)
        .maybeSingle();

      if (accountQuery.error || !accountQuery.data) {
        setFatalError("Could not find your student account.");
        setLoading(false);
        return;
      }

      const studentId = accountQuery.data.student_id;

      const [
        programsQuery,
        applicationsQuery,
        notificationsQuery,
        alertsQuery,
        acadsQuery,
        studentProfile,
      ] = await Promise.all([
        sb
          .from("scholarship_programs")
          .select("scholarship_id")
          .eq("status", "Open"),
        sb
          .from("scholarship_applications")
          .select("application_id")
          .eq("student_id", studentId),
        sb
          .from("notifications_announcements")
          .select("*")
          .eq("student_id", studentId)
          .order("date_sent", { ascending: false }),
        sb
          .from("early_warning_alerts")
          .select("*")
          .eq("student_id", studentId)
          .eq("status", "Active")
          .order("warning_date", { ascending: false }),
        sb
          .from("support_academic_records")
          .select("record_id")
          .eq("student_id", studentId),
        sb
          .from("student_accounts")
          .select("student_number, given_name, last_name")
          .eq("student_id", studentId)
          .maybeSingle(),
      ]);

      if (studentProfile.data) {
        const { student_number, given_name, last_name } = studentProfile.data;
        try {
          const registrar = getRegistrarSupabase();
          const { data: regMatch } = await registrar
            .from("registrar_students")
            .select("student_number")
            .eq("student_number", student_number)
            .eq("given_name", given_name)
            .eq("last_name", last_name)
            .maybeSingle();
          setVerified(!!regMatch);
        } catch {
          setVerified(false);
        }
      }

      const loadedNotifications = (notificationsQuery.data || []) as Notification[];
      const unreadCount = loadedNotifications.filter((n) => n.status === "Unread").length;

      setStats({
        activePrograms: programsQuery.data?.length || 0,
        myApplications: applicationsQuery.data?.length || 0,
        unreadNotifications: unreadCount,
        academicRecords: acadsQuery.data?.length || 0,
      });

      setAlerts((alertsQuery.data || []) as EarlyWarningAlert[]);
      setNotifications(loadedNotifications.slice(0, 5));

      if (!ignore) setLoading(false);
      } catch (err) {
        if (!ignore) {
          setFatalError("Failed to load your dashboard. Please try again.");
          setLoading(false);
        }
      }
    }
    startFetching();
    return () => { ignore = true; };
  }, [router]);

  async function handleVerify() {
    setVerifying(true);
    const sb = getSupabase();
    const { data: authUser } = await sb.auth.getUser();
    const uid = authUser.user?.id;
    if (!uid) { setVerifying(false); return; }
    const userQ = await sb.from("users").select("user_id").eq("auth_user_id", uid).maybeSingle();
    if (!userQ.data) { setVerifying(false); return; }
    const studentQ = await sb.from("student_accounts").select("student_id, student_number, given_name, last_name").eq("user_id", userQ.data.user_id).maybeSingle();
    if (!studentQ.data) { setVerifying(false); return; }
    const { student_id, student_number, given_name, last_name } = studentQ.data;
    try {
      const registrar = getRegistrarSupabase();
      const { data: regMatch } = await registrar
        .from("registrar_students")
        .select("student_number")
        .eq("student_number", student_number)
        .eq("given_name", given_name)
        .eq("last_name", last_name)
        .maybeSingle();
      const verified = !!regMatch;
      setVerified(verified);
      if (verified) {
        await sb.from("student_accounts").update({ registration_status: "Verified" }).eq("student_id", student_id);
      }
    } catch {
      setVerified(false);
    }
    setVerifying(false);
  }

  if (loading) {
    return <Spinner label="Loading dashboard..." />;
  }

  if (fatalError) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-bold text-red-700">Something went wrong</p>
          <p className="mt-2 text-sm text-red-600">{fatalError}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>

      {verified === false && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800 shadow-sm">
          <span>Your account is not yet verified. Please visit the Registrar&rsquo;s Office or click Verify to check your records.</span>
          <button
            onClick={handleVerify}
            disabled={verifying}
            className="rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-[11px] font-bold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
          >
            {verifying ? "Verifying..." : "Verify again"}
          </button>
        </div>
      )}

      <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Active Programs" value={stats.activePrograms} />
        <StatCard label="My Applications" value={stats.myApplications} tone="blue" />
        <StatCard label="Unread Notifications" value={stats.unreadNotifications} tone="green" />
        <StatCard
          label="Academic Records"
          value={stats.academicRecords}
          tone={alerts.length > 0 ? "red" : "maroon"}
        />
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-bold text-gray-700">Active Early Warning Alerts</h2>
        {alerts.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              icon="✅"
              title="No active alerts"
              hint="Your academic standing is on track."
            />
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {alerts.map((alert) => (
              <div
                key={alert.warning_id}
                className="rounded-xl border border-red-200 bg-red-50 p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={STATUS_STYLES["Active"] || ""}>
                    {alert.status}
                  </Badge>
                  {alert.risk_level && (
                    <span className="text-xs font-bold text-red-700">
                      Risk: {alert.risk_level}
                    </span>
                  )}
                  <span className="ml-auto text-[11px] text-gray-500">
                    {formatDateTime(alert.warning_date)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-gray-800">{alert.warning_message}</p>
                <div className="mt-2 flex gap-4 text-xs text-gray-600">
                  {alert.gpa != null && (
                    <span>
                      GPA: <strong>{alert.gpa}</strong>
                    </span>
                  )}
                  {alert.average_grade != null && (
                    <span>
                      Average: <strong>{alert.average_grade}%</strong>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-bold text-gray-700">Recent Notifications</h2>
        {notifications.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              icon="🔔"
              title="No notifications yet"
              hint="You will see updates here when available."
            />
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {notifications.map((n) => (
              <div
                key={n.notification_id}
                className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs ${n.status === "Unread" ? "font-bold text-gray-900" : "text-gray-600"}`}>
                      {n.title || "Notification"}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">{n.message}</p>
                    <p className="mt-1 text-[11px] text-gray-400">{formatDateTime(n.date_sent)}</p>
                  </div>
                  {n.notification_type && (
                    <Badge className={NOTIFICATION_TYPE_STYLES[n.notification_type] || ""}>
                      {n.notification_type}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
