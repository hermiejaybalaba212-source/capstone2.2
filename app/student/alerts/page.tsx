"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase/browser";
import { formatDateTime } from "@/lib/utils";
import { STATUS_STYLES } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";

interface EarlyWarningAlert {
  warning_id: number;
  student_id: number;
  status: string;
  risk_level?: string;
  warning_message?: string;
  gpa?: number;
  average_grade?: number;
  warning_date: string;
  student_accounts?: {
    given_name?: string;
    last_name?: string;
    student_number?: string;
  };
}

export default function AlertsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<EarlyWarningAlert[]>([]);

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

      const studentId = accountQuery.data.student_id;

      const { data, error } = await sb
        .from("early_warning_alerts")
        .select("*, student_accounts(given_name, last_name, student_number)")
        .eq("student_id", studentId)
        .order("warning_date", { ascending: false });

      if (!error && data) {
        setAlerts(data);
      }

      if (!ignore) setLoading(false);
    }
    startFetching();
    return () => { ignore = true; };
  }, [router]);

  if (loading) {
    return <Spinner label="Loading alerts..." />;
  }

  const activeAlerts = alerts.filter((a) => a.status === "Active");
  const resolvedAlerts = alerts.filter((a) => a.status === "Resolved");

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900">Early Warning Alerts</h1>

      {alerts.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon="✅"
            title="No alerts"
            hint="You have no early warning alerts. Your academic standing is on track."
          />
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {activeAlerts.length > 0 && (
            <section>
              <h2 className="text-sm font-bold text-gray-700">Active Alerts</h2>
              <div className="mt-3 space-y-3">
                {activeAlerts.map((alert) => (
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
                    <p className="mt-3 text-xs text-gray-800">{alert.warning_message}</p>
                    <div className="mt-3 flex gap-4 text-xs text-gray-600">
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
                    {alert.student_accounts && (
                      <p className="mt-2 text-[11px] text-gray-500">
                        Student: {alert.student_accounts.given_name}{" "}
                        {alert.student_accounts.last_name}
                        {alert.student_accounts.student_number
                          ? ` (${alert.student_accounts.student_number})`
                          : ""}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {resolvedAlerts.length > 0 && (
            <section>
              <h2 className="text-sm font-bold text-gray-700">Resolved Alerts</h2>
              <div className="mt-3 space-y-3">
                {resolvedAlerts.map((alert) => (
                  <div
                    key={alert.warning_id}
                    className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={STATUS_STYLES["Resolved"] || ""}>
                        {alert.status}
                      </Badge>
                      {alert.risk_level && (
                        <span className="text-xs text-gray-600">
                          Risk: {alert.risk_level}
                        </span>
                      )}
                      <span className="ml-auto text-[11px] text-gray-400">
                        {formatDateTime(alert.warning_date)}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-gray-500">{alert.warning_message}</p>
                    <div className="mt-2 flex gap-4 text-xs text-gray-500">
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
                    {alert.student_accounts && (
                      <p className="mt-2 text-[11px] text-gray-400">
                        Student: {alert.student_accounts.given_name}{" "}
                        {alert.student_accounts.last_name}
                        {alert.student_accounts.student_number
                          ? ` (${alert.student_accounts.student_number})`
                          : ""}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
