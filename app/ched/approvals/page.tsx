"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase/browser";
import { formatDate, downloadCsv } from "@/lib/utils";
import { STATUS_STYLES, REQUIRED_DOCS } from "@/lib/constants";
import { autoRejectSiblings } from "@/lib/scholarship";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";

interface ChedUser {
  user_id: number;
  username: string;
  role: string;
}

interface Application {
  application_id: number;
  student_id: number;
  application_status: string;
  application_date: string;
  scholarship_programs?: { scholarship_name: string };
  student_accounts?: { given_name: string; last_name: string; student_number: string; program_name: string };
}

interface Approval {
  application_id: number;
  approved_by: number;
  approval_status: string;
  validation_status?: string;
}

interface DocRow {
  document_type: string;
  scholarship_applications?: { student_id: number } | { student_id: number }[];
}

export default function ChedApprovalsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState("");
  const [chedUser, setChedUser] = useState<ChedUser | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [studentReqs, setStudentReqs] = useState<Record<number, Set<string>>>({});
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [busyMsg, setBusyMsg] = useState("");

  useEffect(() => {
    let ignore = false;
    async function startFetching() {
      setFatalError("");
      const sb = getSupabase();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { router.push("/login"); return; }

      const { data: meData, error: meErr } = await sb.from("users").select("*").eq("auth_user_id", session.user.id).maybeSingle();
      if (meErr || !meData) { setFatalError("Account not found."); setLoading(false); return; }
      if (meData.role !== "CHED") { setFatalError("CHED personnel access is required."); setLoading(false); return; }
      setChedUser(meData);

      const [appQ, apprQ, docQ, acadQ] = await Promise.all([
        sb.from("scholarship_applications").select("*, scholarship_programs(scholarship_name), student_accounts(given_name, last_name, student_number, program_name)").order("application_date", { ascending: false }),
        sb.from("scholarship_approval").select("*"),
        sb.from("support_documents").select("document_type, scholarship_applications(student_id)"),
        sb.from("support_academic_records").select("student_id"),
      ]);

      if (!appQ.error) setApplications(appQ.data || []);
      if (!apprQ.error) setApprovals(apprQ.data || []);

      const reqMap: Record<number, Set<string>> = {};
      if (!docQ.error) (docQ.data || []).forEach((d: DocRow) => {
        const sid = Array.isArray(d.scholarship_applications) ? d.scholarship_applications[0]?.student_id : d.scholarship_applications?.student_id;
        if (sid == null) return;
        if (!reqMap[sid]) reqMap[sid] = new Set();
        reqMap[sid].add(d.document_type);
      });
      if (!acadQ.error) (acadQ.data || []).forEach((a: { student_id: number }) => {
        if (!reqMap[a.student_id]) reqMap[a.student_id] = new Set();
        reqMap[a.student_id].add("Academic Record");
      });
      setStudentReqs(reqMap);
      if (!ignore) setLoading(false);
    }
    startFetching();
    return () => { ignore = true; };
  }, [router]);

  function completenessFor(studentId: number) {
    const owned = studentReqs[studentId] || new Set();
    const missing = REQUIRED_DOCS.filter((r) => !owned.has(r));
    return { missing, complete: missing.length === 0 };
  }

  function approvalFor(appId: number) {
    return approvals.find((a) => a.application_id === appId);
  }

  async function handleApprove(app: Application) {
    if (!chedUser) return;
    setApprovingId(app.application_id);
    setBusyMsg("");
    const sb = getSupabase();
    await sb.from("scholarship_approval").delete().eq("application_id", app.application_id);
    const { error } = await sb.from("scholarship_approval").insert({
      application_id: app.application_id,
      approved_by: chedUser.user_id,
      approval_date: new Date().toISOString(),
      approval_status: "Approved",
      validation_status: "Not Validated",
    });
    setApprovingId(null);
    if (error) { setBusyMsg(error.message); return; }
    setApprovals((prev) => [...prev, {
      application_id: app.application_id,
      approved_by: chedUser.user_id,
      approval_status: "Approved",
      validation_status: "Not Validated",
    }]);

    const res = await autoRejectSiblings([{ application_id: app.application_id, student_id: app.student_id }], applications);
    if (res.rejectedCount > 0) {
      setApplications((prev) => prev.map((a) =>
        a.student_id === app.student_id && a.application_id !== app.application_id
          ? { ...a, application_status: "Not Approved", remarks: `Auto-rejected: already approved for "${app.scholarship_programs?.scholarship_name || "another scholarship"}".` }
          : a
      ));
      setBusyMsg(`Approved. Auto-rejected ${res.rejectedCount} other application(s) by this student.`);
    }
  }

  async function handleUndo(appId: number) {
    setBusyMsg("");
    const sb = getSupabase();
    const { error } = await sb.from("scholarship_approval").delete().eq("application_id", appId);
    if (error) { setBusyMsg(error.message); return; }
    setApprovals((prev) => prev.filter((a) => a.application_id !== appId));
  }

  function exportFinalList() {
    const approvedApps = applications.filter((a) => approvalFor(a.application_id));
    if (!approvedApps.length) return;
    const rows = approvedApps.map((a, i) => ({
      beneficiary_no: i + 1,
      student_number: a.student_accounts?.student_number || "",
      name: `${a.student_accounts?.last_name}, ${a.student_accounts?.given_name}`,
      program: a.student_accounts?.program_name || "",
      scholarship: a.scholarship_programs?.scholarship_name || "",
      application_date: formatDate(a.application_date),
      status: "Approved",
      registrar_validation: "Pending Admin Validation",
    }));
    downloadCsv("final-approved-scholars.csv", rows);
  }

  function handleSendToAdmin() {
    const count = approvals.length;
    if (!count) return;
    exportFinalList();
    setBusyMsg(`Final list of ${count} approved beneficiaries exported and ready for Administrator review. The Administrator will validate against the Registrar database and notify students.`);
  }

  if (loading) return <Spinner label="Loading approvals..." color="blue" />;

  if (fatalError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f0f2f8] px-6">
        <div className="max-w-sm text-center">
          <p className="text-4xl">&#128683;</p>
          <h1 className="mt-3 text-lg font-bold text-gray-900">{fatalError}</h1>
        </div>
      </main>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-gray-900">Approve Beneficiaries (Process 4.0)</h1>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={exportFinalList}
            disabled={!approvals.length}
            className="rounded-lg border border-[#1e3a5f]/30 px-4 py-2 text-xs font-bold text-[#1e3a5f] hover:bg-[#1e3a5f]/5 disabled:opacity-50"
          >
            Export CSV
          </button>
          <button
            onClick={handleSendToAdmin}
            disabled={!approvals.length}
            className="rounded-lg bg-[#1e3a5f] px-4 py-2 text-xs font-bold text-white hover:bg-[#152b48] disabled:opacity-50"
          >
            Send Final List to Admin
          </button>
        </div>
      </div>

      {approvals.length > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-medium text-blue-800">
          {approvals.length} beneficiary(ies) approved. The final list will be sent to the Administrator for Registrar validation and student notification.
        </div>
      )}

      {busyMsg && (
        <div className="rounded-xl border border-[#1e3a5f]/20 bg-white px-4 py-3 text-xs font-medium text-[#1e3a5f] shadow-sm">
          {busyMsg}
        </div>
      )}

      {applications.length === 0 ? (
        <EmptyState icon="&#128203;" title="No applications to review" hint="Applications will appear here for approval." />
      ) : (
        <div className="space-y-3">
          {applications.map((a) => {
            const approval = approvalFor(a.application_id);
            const comp = completenessFor(a.student_id);
            return (
              <div key={a.application_id} className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900">
                    {a.student_accounts?.last_name}, {a.student_accounts?.given_name}{" "}
                    <span className="font-normal text-gray-400">({a.student_accounts?.student_number})</span>
                  </p>
                  <p className="text-xs font-semibold text-[#1e3a5f]">{a.scholarship_programs?.scholarship_name}</p>
                  <p className="text-[11px] text-gray-400">
                    {a.student_accounts?.program_name} &middot; Submitted {formatDate(a.application_date)}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge className={STATUS_STYLES[a.application_status] || ""}>{a.application_status}</Badge>
                    <Badge className={comp.complete ? "border-green-200 bg-green-50 text-green-700" : "border-orange-200 bg-orange-50 text-orange-700"}>
                      {comp.complete ? "Requirements complete" : `Missing ${comp.missing.length}`}
                    </Badge>
                  </div>
                  {!comp.complete && (
                    <p className="mt-1 rounded-lg bg-orange-50 px-3 py-1.5 text-[11px] text-orange-700">
                      Missing: {comp.missing.join(", ")}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 self-start sm:self-center">
                  {approval ? (
                    <>
                      <Badge className="border-green-300 bg-green-100 text-green-800">Approved</Badge>
                      <button
                        onClick={() => handleUndo(a.application_id)}
                        className="rounded-md border border-red-200 px-3 py-1.5 text-[11px] font-bold text-red-600 hover:bg-red-50"
                      >
                        Undo
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleApprove(a)}
                      disabled={approvingId === a.application_id}
                      className="rounded-lg bg-[#1e3a5f] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#152b48] disabled:opacity-60"
                    >
                      {approvingId === a.application_id ? "Processing..." : "Approve as scholar"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="pt-2 text-[11px] leading-relaxed text-gray-400">
        UC06 &mdash; After approving beneficiaries, click &quot;Send Final List to Admin&quot; to export and deliver the approved list to the Administrator. The Administrator validates students against the Registrar database, updates application statuses, and notifies all applicants.
      </p>
    </div>
  );
}
