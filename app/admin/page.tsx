"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase/browser";
import { formatDateTime } from "@/lib/utils";
import { STATUS_STYLES } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { StatCard } from "@/components/ui/stat-card";

interface ScholarshipApplication {
  application_id: number;
  student_id: number;
  scholarship_id: number;
  application_date: string;
  application_status: string;
  scholarship_programs?: { scholarship_name: string };
  student_accounts?: { given_name: string; last_name: string; student_number: string };
}

interface EarlyWarningAlert {
  warning_id: number;
  student_id: number;
  status: string;
  risk_level?: string;
  warning_message?: string;
  warning_date: string;
  student_accounts?: { given_name: string; last_name: string; student_number: string };
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  const [totalStudents, setTotalStudents] = useState(0);
  const [pendingApps, setPendingApps] = useState(0);
  const [approvedScholars, setApprovedScholars] = useState(0);
  const [activeAlerts, setActiveAlerts] = useState(0);

  const [recentApplications, setRecentApplications] = useState<ScholarshipApplication[]>([]);
  const [recentAlerts, setRecentAlerts] = useState<EarlyWarningAlert[]>([]);

  useEffect(() => {
    let ignore = false;
    async function startFetching() {
      const sb = getSupabase();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { router.push("/login"); return; }

      const [
        studentsQ,
        appsQ,
        approvalsQ,
        alertsQ,
        recentAppsQ,
        recentAlertsQ,
      ] = await Promise.all([
        sb.from("student_accounts").select("student_id", { count: "exact", head: true }),
        sb.from("scholarship_applications").select("*").eq("application_status", "Pending"),
        sb.from("scholarship_approval").select("approval_id", { count: "exact", head: true }),
        sb.from("early_warning_alerts").select("*").eq("status", "Active"),
        sb.from("scholarship_applications")
          .select("*, scholarship_programs(scholarship_name), student_accounts(given_name, last_name, student_number)")
          .order("application_date", { ascending: false })
          .limit(10),
        sb.from("early_warning_alerts")
          .select("*, student_accounts(given_name, last_name, student_number)")
          .order("warning_date", { ascending: false })
          .limit(5),
      ]);

      setTotalStudents(studentsQ.count ?? 0);
      setPendingApps(appsQ.data?.length ?? 0);
      setApprovedScholars(approvalsQ.count ?? 0);
      setActiveAlerts(alertsQ.data?.length ?? 0);

      if (!recentAppsQ.error) setRecentApplications(recentAppsQ.data || []);
      if (!recentAlertsQ.error) setRecentAlerts(recentAlertsQ.data || []);

      if (!ignore) setLoading(false);
    }
    startFetching();
    return () => { ignore = true; };
  }, [router]);

  if (loading) return <Spinner label="Loading dashboard..." color="maroon" />;

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold text-[#241012]">Admin Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Students" value={totalStudents} />
        <StatCard label="Pending Applications" value={pendingApps} tone="blue" />
        <StatCard label="Approved Scholars" value={approvedScholars} tone="green" />
        <StatCard label="Active Alerts" value={activeAlerts} tone="red" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-bold text-[#241012]">Recent Applications</h2>
          {recentApplications.length === 0 ? (
            <EmptyState icon="&#128196;" title="No recent applications" />
          ) : (
            <ul className="space-y-3">
              {recentApplications.map((app) => (
                <li key={app.application_id} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50/50 p-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#241012]">
                      {app.student_accounts?.last_name}, {app.student_accounts?.given_name}
                    </p>
                    <p className="text-[11px] text-[#6B5458]">
                      {app.scholarship_programs?.scholarship_name} &middot; {formatDateTime(app.application_date)}
                    </p>
                  </div>
                  <Badge className={STATUS_STYLES[app.application_status] || ""}>
                    {app.application_status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-bold text-[#241012]">Active Alerts</h2>
          {recentAlerts.length === 0 ? (
            <EmptyState icon="&#9989;" title="No active alerts" />
          ) : (
            <ul className="space-y-3">
              {recentAlerts.map((alert) => (
                <li key={alert.warning_id} className="flex items-start justify-between rounded-lg border border-red-100 bg-red-50/50 p-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#241012]">
                      {alert.student_accounts?.last_name}, {alert.student_accounts?.given_name}
                    </p>
                    <p className="text-[11px] text-[#6B5458]">
                      {alert.warning_message}
                    </p>
                    <p className="mt-1 text-[10px] text-[#8B7376]">
                      {formatDateTime(alert.warning_date)}
                    </p>
                  </div>
                  <Badge className={STATUS_STYLES[alert.status] || ""}>
                    {alert.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
