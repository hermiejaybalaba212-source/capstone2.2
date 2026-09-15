"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase/browser";
import { getRegistrarSupabase } from "@/lib/supabase/registrar";
import { formatDateTime, downloadCsv } from "@/lib/utils";
import { STATUS_STYLES } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";

interface ScholarshipApproval {
  approval_id: number;
  application_id: number;
  approved_by?: number;
  approval_date?: string;
  approval_status: string;
  validation_status?: string;
  approved_by_user?: { username: string; role: string } | null;
}

interface ScholarshipApplication {
  application_id: number;
  student_id: number;
  application_date: string;
  application_status: string;
  scholarship_programs?: { scholarship_name: string };
  student_accounts?: { given_name: string; last_name: string; student_number: string; program_name: string };
}

export default function ApprovalsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [approvals, setApprovals] = useState<ScholarshipApproval[]>([]);
  const [applications, setApplications] = useState<ScholarshipApplication[]>([]);
  const [validatingId, setValidatingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | "CHED" | "Admin">("all");

  useEffect(() => {
    let ignore = false;
    async function startFetching() {
      const sb = getSupabase();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { router.push("/login"); return; }

      const [apprQ, appsQ] = await Promise.all([
        sb.from("scholarship_approval").select("*, approved_by_user:users(username, role)").order("approval_date", { ascending: false }),
        sb.from("scholarship_applications")
          .select("*, scholarship_programs(scholarship_name), student_accounts(given_name, last_name, student_number, program_name)")
          .eq("application_status", "Approved"),
      ]);

      if (!apprQ.error) setApprovals(apprQ.data || []);
      if (!appsQ.error) setApplications(appsQ.data || []);
      if (!ignore) setLoading(false);
    }
    startFetching();
    return () => { ignore = true; };
  }, [router]);

  function getApp(appId: number) {
    return applications.find((a) => a.application_id === appId);
  }

  async function handleValidate(approval: ScholarshipApproval) {
    setMessage("");
    setValidatingId(approval.application_id);

    const app = getApp(approval.application_id);
    if (!app?.student_accounts?.student_number) {
      setMessage("Student number not found for this application.");
      setValidatingId(null);
      return;
    }

    const rsb = getRegistrarSupabase();
    const { data: regStudent, error: regErr } = await rsb
      .from("registrar_students")
      .select("*")
      .eq("student_number", app.student_accounts.student_number.trim())
      .maybeSingle();

    if (regErr) {
      setMessage(`Registrar lookup failed: ${regErr.message}`);
      setValidatingId(null);
      return;
    }

    const sb = getSupabase();
    if (regStudent) {
      const { error } = await sb
        .from("scholarship_approval")
        .update({ validation_status: "Validated" })
        .eq("application_id", approval.application_id);

      if (error) { setMessage(error.message); setValidatingId(null); return; }

      await sb
        .from("student_accounts")
        .update({ registration_status: "Verified" })
        .eq("student_number", app.student_accounts.student_number.trim());

      setApprovals((prev) => prev.map((a) =>
        a.application_id === approval.application_id ? { ...a, validation_status: "Validated" } : a
      ));
      setMessage("Student validated against Registrar database and marked as Verified.");
    } else {
      const { error } = await sb
        .from("scholarship_approval")
        .update({ validation_status: "Not Validated" })
        .eq("application_id", approval.application_id);

      if (error) { setMessage(error.message); setValidatingId(null); return; }

      setApprovals((prev) => prev.map((a) =>
        a.application_id === approval.application_id ? { ...a, validation_status: "Not Validated" } : a
      ));
      setMessage("Student not found in Registrar database.");
    }

    setValidatingId(null);
  }

  function exportCsv() {
    downloadCsv("approved-scholars.csv", approvals.map((a) => {
      const app = getApp(a.application_id);
      return {
        student: app ? `${app.student_accounts?.last_name}, ${app.student_accounts?.given_name}` : "",
        student_number: app?.student_accounts?.student_number ?? "",
        program: app?.student_accounts?.program_name ?? "",
        scholarship: app?.scholarship_programs?.scholarship_name ?? "",
        approval_date: formatDateTime(a.approval_date),
        approval_status: a.approval_status,
        validation_status: a.validation_status ?? "Not Validated",
      };
    }));
  }

  function isChedApproval(appr: ScholarshipApproval) {
    return appr.approved_by_user?.role === "CHED";
  }

  const filteredApprovals = approvals.filter((a) => {
    if (sourceFilter === "all") return true;
    if (sourceFilter === "CHED") return isChedApproval(a);
    return !isChedApproval(a);
  });

  if (loading) return <Spinner label="Loading approvals..." color="maroon" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-[#241012]">Approvals &amp; Validate</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[#8B7376]">Process 7.0</span>
          <button
            onClick={exportCsv}
            disabled={!approvals.length}
            className="rounded-lg border border-[#7B1113]/30 px-4 py-2 text-xs font-bold text-[#7B1113] hover:bg-[#7B1113]/5 disabled:opacity-50"
          >
            Export CSV
          </button>
        </div>
      </div>

      {message && (
        <div className="rounded-xl border border-[#7B1113]/20 bg-white px-4 py-3 text-xs font-medium text-[#7B1113] shadow-sm">
          {message}
        </div>
      )}

      <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm">
        {(["all", "CHED", "Admin"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setSourceFilter(f)}
            className={`rounded-md px-3 py-1.5 text-[11px] font-bold transition ${sourceFilter === f ? "bg-[#7B1113] text-white" : "text-[#6B5458] hover:text-[#7B1113]"}`}
          >
            {f === "all" ? `All (${approvals.length})` : f === "CHED" ? `CHED (${approvals.filter(isChedApproval).length})` : `Admin (${approvals.filter((a) => !isChedApproval(a)).length})`}
          </button>
        ))}
      </div>

      {filteredApprovals.length === 0 ? (
        <EmptyState icon="&#9989;" title="No approved scholars yet" hint="Approvals appear here once applications are approved." />
      ) : (
        <div className="space-y-3">
          {filteredApprovals.map((appr) => {
            const app = getApp(appr.application_id);
            const isValidated = appr.validation_status === "Validated";
            const fromChed = isChedApproval(appr);

            return (
              <div key={appr.approval_id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-bold text-[#241012]">
                      {app?.student_accounts?.last_name}, {app?.student_accounts?.given_name}{" "}
                      <span className="font-normal text-[#8B7376]">({app?.student_accounts?.student_number})</span>
                    </p>
                    <p className="text-xs text-[#6B5458]">
                      Program: {app?.student_accounts?.program_name || "\u2014"}
                    </p>
                    <p className="text-xs text-[#7B1113]">
                      Scholarship: {app?.scholarship_programs?.scholarship_name || "\u2014"}
                    </p>
                    <p className="text-[11px] text-[#8B7376]">
                      Approved: {formatDateTime(appr.approval_date)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {fromChed && (
                      <Badge className="border-blue-200 bg-blue-50 text-blue-700">
                        From CHED
                      </Badge>
                    )}
                    <Badge className={STATUS_STYLES[appr.approval_status] || ""}>
                      {appr.approval_status}
                    </Badge>
                    {isValidated ? (
                      <Badge className="border-green-200 bg-green-50 text-green-700">
                        &#10003; Validated
                      </Badge>
                    ) : (
                      <Badge className="border-amber-200 bg-amber-50 text-amber-700">
                        {appr.validation_status || "Not Validated"}
                      </Badge>
                    )}
                    <button
                      onClick={() => handleValidate(appr)}
                      disabled={isValidated || validatingId === appr.application_id}
                      className="rounded-lg border border-green-300 px-3 py-1.5 text-[11px] font-bold text-green-700 hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {validatingId === appr.application_id ? "Validating..." : "Validate against Registrar"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
