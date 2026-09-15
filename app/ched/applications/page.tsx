"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase/browser";
import { formatDateTime, downloadCsv } from "@/lib/utils";
import { STATUS_STYLES, REQUIRED_DOCS } from "@/lib/constants";
import { autoRejectSiblings } from "@/lib/scholarship";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";

const APPLICATION_STATUSES = ["Pending", "Approved", "Not Approved"] as const;

interface Application {
  application_id: number;
  student_id: number;
  scholarship_id: number;
  application_date: string;
  application_status: string;
  remarks?: string | null;
  scholarship_programs?: { scholarship_name: string };
  student_accounts?: { given_name: string; last_name: string; student_number: string; program_name: string; year_level?: string; sex?: string; registration_status?: string; account_status?: string };
}

interface Ranking {
  application_id: number;
  ranking_position: number;
}

interface SupportDocument {
  document_id: number;
  application_id: number;
  document_type: string;
  file_path: string;
  upload_date: string;
}

interface SupportAcademicRecord {
  record_id: number;
  student_id: number;
  applicant_type?: string;
  shs_gwa?: number;
  college_gpa?: number;
  proof_image_path?: string;
  created_at?: string;
}

interface ChedFormInput {
  ched_form_id: number;
  application_id: number;
  student_id: string;
  given_name?: string;
  last_name?: string;
  ext_name?: string;
  middle_name?: string;
  sex?: string;
  birthdate?: string;
  complete_program_name?: string;
  year_level?: string;
  father_name?: string;
  mother_name?: string;
  street_barangay?: string;
  zipcode?: string;
  disability?: string;
  indigenous_people_group?: string;
  contact_number?: string;
  email_address?: string;
  income_tax_return?: string;
  annual_income_family?: number;
}

export default function ChedApplicationsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState("");
  const [applications, setApplications] = useState<Application[]>([]);
  const [rankings, setRankings] = useState<Ranking[]>([]);
  const [docs, setDocs] = useState<SupportDocument[]>([]);
  const [acads, setAcads] = useState<SupportAcademicRecord[]>([]);
  const [chedForms, setChedForms] = useState<ChedFormInput[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [programFilter, setProgramFilter] = useState("");
  const [search, setSearch] = useState("");
  const [expandedApp, setExpandedApp] = useState<number | null>(null);
  const [fileUrls, setFileUrls] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState("");
  const [batchMsg, setBatchMsg] = useState("");
  const [batchBusy, setBatchBusy] = useState(false);
  const [notifyMsg, setNotifyMsg] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);
  const [statusDraft, setStatusDraft] = useState<Record<number, { status: string; remarks: string }>>({});
  const [studentReqs, setStudentReqs] = useState<Record<number, Set<string>>>({});
  const [chedUserId, setChedUserId] = useState<number | null>(null);

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
      setChedUserId(meData.user_id);

      const [appQ, rankQ, docQ, acadQ, chedQ] = await Promise.all([
        sb.from("scholarship_applications")
          .select("*, scholarship_programs(scholarship_name), student_accounts(given_name, last_name, student_number, program_name, year_level, sex, registration_status, account_status)")
          .order("application_date", { ascending: false }),
        sb.from("ranking_result").select("application_id, ranking_position"),
        sb.from("support_documents").select("*").order("upload_date", { ascending: false }),
        sb.from("support_academic_records").select("*").order("created_at", { ascending: false }),
        sb.from("ched_form_input").select("*").order("ched_form_id", { ascending: false }),
      ]);

      if (!appQ.error) setApplications(appQ.data || []);
      if (!rankQ.error) setRankings(rankQ.data || []);
      if (!docQ.error) setDocs(docQ.data || []);
      if (!acadQ.error) setAcads(acadQ.data || []);
      if (!chedQ.error) setChedForms(chedQ.data || []);

      const reqMap: Record<number, Set<string>> = {};
      const appById = new Map((appQ.data || []).map((a) => [a.application_id, a]));
      if (!docQ.error) (docQ.data || []).forEach((d: SupportDocument) => {
        const app = appById.get(d.application_id);
        if (!app) return;
        if (!reqMap[app.student_id]) reqMap[app.student_id] = new Set();
        reqMap[app.student_id].add(d.document_type);
      });
      if (!acadQ.error) (acadQ.data || []).forEach((a: SupportAcademicRecord) => {
        if (!reqMap[a.student_id]) reqMap[a.student_id] = new Set();
        reqMap[a.student_id].add("Academic Record");
      });
      setStudentReqs(reqMap);
      if (!ignore) setLoading(false);
    }
    startFetching();
    return () => { ignore = true; };
  }, [router]);

  const programNames = [...new Set(applications.map((a) => a.scholarship_programs?.scholarship_name).filter(Boolean))];

  const appById = new Map(applications.map((a) => [a.application_id, a]));

  const statusScoped = statusFilter ? applications.filter((a) => a.application_status === statusFilter) : applications;
  const filteredApps = (programFilter
    ? statusScoped.filter((a) => a.scholarship_programs?.scholarship_name === programFilter)
    : statusScoped
  ).filter((a) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const n = `${a.student_accounts?.given_name} ${a.student_accounts?.last_name}`.toLowerCase();
    const sn = a.student_accounts?.student_number?.toLowerCase() || "";
    const p = a.scholarship_programs?.scholarship_name?.toLowerCase() || "";
    return n.includes(q) || sn.includes(q) || p.includes(q);
  });

  function completenessFor(studentId: number) {
    const owned = studentReqs[studentId] || new Set();
    const missing = REQUIRED_DOCS.filter((r) => !owned.has(r));
    return { missing, complete: missing.length === 0 };
  }

  function isRanked(appId: number) { return rankings.some((r) => r.application_id === appId); }

  function approvedElsewhere(app: Application): boolean {
    return applications.some((a) =>
      a.student_id === app.student_id &&
      a.application_id !== app.application_id &&
      a.application_status === "Approved"
    );
  }

  async function toggleExpand(appId: number) {
    if (expandedApp === appId) { setExpandedApp(null); return; }
    setExpandedApp(appId);
    setFileUrls({});
    const sb = getSupabase();
    const app = applications.find((a) => a.application_id === appId);
    if (!app) return;

    const appDocs = docs.filter((d) => d.application_id === appId);
    const appAcads = acads.filter((a) => a.student_id === app.student_id);
    const appChed = chedForms.filter((c) => c.application_id === appId);
    const urls: Record<string, string> = {};

    for (const d of appDocs) {
      const res = await sb.storage.from("support-documents").createSignedUrl(d.file_path, 3600);
      if (res.data?.signedUrl) urls[d.file_path] = res.data.signedUrl;
    }
    for (const a of appAcads) {
      if (!a.proof_image_path) continue;
      const res = await sb.storage.from("academic-records").createSignedUrl(a.proof_image_path, 3600);
      if (res.data?.signedUrl) urls[a.proof_image_path] = res.data.signedUrl;
    }
    for (const c of appChed) {
      if (!c.income_tax_return) continue;
      const res = await sb.storage.from("itr-documents").createSignedUrl(c.income_tax_return, 3600);
      if (res.data?.signedUrl) urls[c.income_tax_return] = res.data.signedUrl;
    }
    setFileUrls(urls);
  }

  function toggleSelect(appId: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(appId)) {
        next.delete(appId);
      } else {
        next.add(appId);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    const visibleIds = filteredApps.map((a) => a.application_id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = visibleIds.every((id) => next.has(id));
      visibleIds.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  }

  const selectedApps = applications.filter((a) => selectedIds.has(a.application_id));

  async function syncApproval(appId: number, status: string) {
    if (!chedUserId) return;
    const sb = getSupabase();
    await sb.from("scholarship_approval").delete().eq("application_id", appId);
    if (status !== "Approved" && status !== "Not Approved") return;
    const { error } = await sb.from("scholarship_approval").insert({
      application_id: appId,
      approved_by: chedUserId,
      approval_date: new Date().toISOString(),
      approval_status: status,
      validation_status: "Not Validated",
    });
    if (error) setMessage(`Approval record sync failed for #${appId}: ${error.message}`);
  }

  async function handleStatusSave(app: Application) {
    setMessage("");
    setSavingId(app.application_id);
    const draft = statusDraft[app.application_id] || { status: app.application_status, remarks: app.remarks || "" };
    const newStatus = draft.status;
    const newRemarks = draft.remarks.trim() || null;
    const sb = getSupabase();
    const { error } = await sb.from("scholarship_applications")
      .update({ application_status: newStatus, remarks: newRemarks })
      .eq("application_id", app.application_id);
    if (error) { setMessage(error.message); setSavingId(null); return; }

    await syncApproval(app.application_id, newStatus);

    await sb.from("notifications_announcements").insert({
      student_id: app.student_id,
      title: "Application Update",
      message: `Your application for "${app.scholarship_programs?.scholarship_name || "a scholarship"}" is now ${newStatus}. ${newRemarks || ""}`.trim(),
      notification_type: "Status Update",
      status: "Unread",
    });

    let rejectNote = "";
    if (newStatus === "Approved") {
      const res = await autoRejectSiblings([{ application_id: app.application_id, student_id: app.student_id }], applications);
      if (res.rejectedCount > 0) rejectNote = ` Auto-rejected ${res.rejectedCount} other application(s).`;
      setApplications((prev) => prev.map((a) =>
        a.student_id === app.student_id && a.application_id !== app.application_id
          ? { ...a, application_status: "Not Approved", remarks: `Auto-rejected: already approved for "${app.scholarship_programs?.scholarship_name || "another scholarship"}".` }
          : a
      ));
    }

    setApplications((prev) => prev.map((a) =>
      a.application_id === app.application_id ? { ...a, application_status: newStatus, remarks: newRemarks } : a
    ));
    const newDraft = { ...statusDraft };
    delete newDraft[app.application_id];
    setStatusDraft(newDraft);
    setSavingId(null);
    if (rejectNote) setMessage(`Updated status.${rejectNote}`);
  }

  async function batchStatus(targetStatus: string, scopeIds: number[], customRemarks?: string) {
    if (!scopeIds.length) return;
    setBatchBusy(true);
    setMessage("");
    const sb = getSupabase();
    try {
      const { error } = await sb.from("scholarship_applications")
        .update({ application_status: targetStatus, remarks: customRemarks ?? null })
        .in("application_id", scopeIds);
      if (error) { setMessage(`Batch update failed: ${error.message}`); setBatchBusy(false); return; }

      for (const id of scopeIds) await syncApproval(id, targetStatus);

      const notifRows = applications
        .filter((a) => scopeIds.includes(a.application_id))
        .map((a) => ({
          student_id: a.student_id,
          title: "Application Update",
          message: `Your application for "${a.scholarship_programs?.scholarship_name || "a scholarship"}" is now ${targetStatus}.${customRemarks ? " " + customRemarks : ""}`.trim(),
          notification_type: "Status Update",
          status: "Unread",
        }));
      if (notifRows.length) {
        const { error: nErr } = await sb.from("notifications_announcements").insert(notifRows);
        if (nErr) { setMessage(`Status saved ${notifRows.length} apps but notify failed: ${nErr.message}`); }
      }

      let rejectNote = "";
      let rejectedAppIds: number[] = [];
      if (targetStatus === "Approved") {
        const approvedTargets = applications.filter((a) => scopeIds.includes(a.application_id) && a.application_status !== "Approved");
        const res = await autoRejectSiblings(
          approvedTargets.map((a) => ({ application_id: a.application_id, student_id: a.student_id })),
          applications
        );
        if (res.rejectedCount > 0) {
          rejectNote = ` Auto-rejected ${res.rejectedCount} other application(s).`;
          const approvedStudents = new Set(approvedTargets.map((a) => a.student_id));
          rejectedAppIds = applications.filter((a) => approvedStudents.has(a.student_id) && !scopeIds.includes(a.application_id)).map((a) => a.application_id);
        }
      }

      setApplications((prev) => prev.map((a) => {
        if (scopeIds.includes(a.application_id)) return { ...a, application_status: targetStatus, remarks: customRemarks ?? null };
        if (rejectedAppIds.includes(a.application_id)) return { ...a, application_status: "Not Approved" };
        return a;
      }));
      setSelectedIds(new Set());
      setMessage(`Updated ${scopeIds.length} application(s) to ${targetStatus} and notified ${notifRows.length} student(s).${rejectNote}`);
    } finally {
      setBatchBusy(false);
    }
  }

  async function batchNotify() {
    if (!selectedIds.size) return;
    const msg = notifyMsg.trim() || "You have a new update from the scholarship office.";
    setBatchBusy(true);
    setMessage("");
    const sb = getSupabase();
    const rows = selectedApps.map((a) => ({
      student_id: a.student_id,
      title: "Notification from SPC Scholarship Office",
      message: msg,
      notification_type: "Announcement",
      status: "Unread",
    }));
    const { error } = await sb.from("notifications_announcements").insert(rows);
    setBatchBusy(false);
    if (error) { setMessage(`Notify failed: ${error.message}`); return; }
    setNotifyMsg("");
    setMessage(`Notification sent to ${rows.length} student(s).`);
  }

  const pendingFilter = filteredApps.filter((a) => a.application_status === "Pending");

  async function batchApproveAllFiltered() {
    const targets = pendingFilter;
    if (!targets.length) { setMessage("No pending applications in the current view."); return; }
    if (!confirm(`Approve all ${targets.length} pending application(s) in this view?`)) return;
    await batchStatus("Approved", targets.map((a) => a.application_id), "Congratulations! Your scholarship application has been approved.");
    setBatchMsg("");
  }

  async function batchNotifyAllFiltered() {
    const targets = filteredApps;
    if (!targets.length) return;
    const msg = batchMsg.trim() || "You have a new update from the scholarship office.";
    if (!confirm(`Send a notification to all ${targets.length} student(s) in this view?`)) return;
    setBatchBusy(true);
    setMessage("");
    const sb = getSupabase();
    const rows = targets.map((a) => ({
      student_id: a.student_id,
      title: "Notification from SPC Scholarship Office",
      message: msg,
      notification_type: "Announcement",
      status: "Unread",
    }));
    const { error } = await sb.from("notifications_announcements").insert(rows);
    setBatchBusy(false);
    if (error) { setMessage(`Notify failed: ${error.message}`); return; }
    setBatchMsg("");
    setMessage(`Notification sent to all ${rows.length} student(s) in this view.`);
  }

  function exportCsv() {
    const chedByApp = Object.fromEntries(chedForms.map((c) => [c.application_id, c]));
    const acadByStudent = Object.fromEntries(acads.map((a) => [a.student_id, a]));
    const docByStudent: Record<number, string> = {};
    docs.forEach((d) => {
      const app = appById.get(d.application_id);
      if (!app) return;
      const sid = app.student_id;
      docByStudent[sid] = `${docByStudent[sid] || ""}${docByStudent[sid] ? "; " : ""}${d.document_type}`;
    });
    const rows = filteredApps.map((a) => {
      const c = chedByApp[a.application_id];
      const acad = acadByStudent[a.student_id];
      return {
        "Application ID": a.application_id,
        "Student No.": a.student_accounts?.student_number || c?.student_id || "",
        "Last Name": c?.last_name || a.student_accounts?.last_name || "",
        "First Name": c?.given_name || a.student_accounts?.given_name || "",
        "Middle Name": c?.middle_name || "",
        "Ext. Name": c?.ext_name || "",
        "Sex": c?.sex || a.student_accounts?.sex || "",
        "Birthdate": c?.birthdate || "",
        "Program": c?.complete_program_name || a.student_accounts?.program_name || "",
        "Year Level": c?.year_level || a.student_accounts?.year_level || "",
        "Scholarship Program": a.scholarship_programs?.scholarship_name || "",
        "Application Status": a.application_status,
        "Application Date": formatDateTime(a.application_date),
        "Rank": rankings.find((r) => r.application_id === a.application_id)?.ranking_position ?? "",
        "Father's Full Name": c?.father_name || "",
        "Mother's Full Name": c?.mother_name || "",
        "Street / Barangay": c?.street_barangay || "",
        "Zipcode": c?.zipcode || "",
        "Contact Number": c?.contact_number || "",
        "Email Address": c?.email_address || "",
        "Disability": c?.disability || "",
        "Indigenous People Group": c?.indigenous_people_group || "",
        "Annual Family Income (PHP)": c?.annual_income_family != null ? Number(c.annual_income_family) : "",
        "ITR File": c?.income_tax_return || "",
        "Registration Status": a.student_accounts?.registration_status || "",
        "Account Status": a.student_accounts?.account_status || "",
        "Supporting Documents": docByStudent[a.student_id] || "",
        "Applicant Type": acad?.applicant_type || "",
        "GWA/GPA Score": acad?.shs_gwa ?? acad?.college_gpa ?? "",
        "Remarks": a.remarks || "",
      };
    });
    downloadCsv("ched-applications-full.csv", rows);
    setMessage(`Exported ${rows.length} application(s).`);
  }

  if (loading) return <Spinner label="Loading applications..." color="blue" />;

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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-[#1e3a5f]">Application Data (Process 2.0)</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={exportCsv}
            disabled={!filteredApps.length}
            className="rounded-lg border border-[#1e3a5f]/30 px-4 py-2 text-xs font-bold text-[#1e3a5f] hover:bg-[#1e3a5f]/5 disabled:opacity-50"
          >
            Export CSV
          </button>
        </div>
      </div>

      {message && (
        <div className="rounded-xl border border-[#1e3a5f]/20 bg-white px-4 py-3 text-xs font-medium text-[#1e3a5f] shadow-sm">
          {message}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm">
          <button
            onClick={() => setStatusFilter("")}
            className={`rounded-md px-3 py-1.5 text-[11px] font-bold transition ${statusFilter === "" ? "bg-[#1e3a5f] text-white" : "text-[#5b6b7d] hover:text-[#1e3a5f]"}`}
          >
            All ({applications.length})
          </button>
          {APPLICATION_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-md px-3 py-1.5 text-[11px] font-bold transition ${statusFilter === s ? "bg-[#1e3a5f] text-white" : "text-[#5b6b7d] hover:text-[#1e3a5f]"}`}
            >
              {s} ({applications.filter((a) => a.application_status === s).length})
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:w-72">
            <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search name, student #, program..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-4 text-xs outline-none focus:border-[#1e3a5f] focus:ring-1 focus:ring-[#1e3a5f]/20"
            />
          </div>
          <select
            value={programFilter}
            onChange={(e) => setProgramFilter(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs outline-none focus:border-[#1e3a5f]"
          >
            <option value="">All scholarship programs</option>
            {programNames.map((n) => <option key={n}>{n}</option>)}
          </select>
        </div>
      </div>

      {filteredApps.length === 0 ? (
        <EmptyState icon="&#128196;" title="No applications found" hint="Applications will appear here once students submit them." />
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border border-[#1e3a5f]/20 bg-white p-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-[#1e3a5f]">
                <input
                  type="checkbox"
                  checked={filteredApps.length > 0 && filteredApps.every((a) => selectedIds.has(a.application_id))}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 accent-[#1e3a5f]"
                />
                Select all ({filteredApps.length})
              </label>
              {selectedIds.size > 0 && (
                <span className="text-[11px] font-bold text-[#1e3a5f]">{selectedIds.size} selected</span>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                onClick={() => batchStatus("Approved", [...selectedIds])}
                disabled={!selectedIds.size || batchBusy}
                className="rounded-lg bg-[#1e3a5f] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[#152b48] disabled:opacity-40"
              >
                Approve selected
              </button>
              <button
                onClick={() => batchStatus("Not Approved", [...selectedIds])}
                disabled={!selectedIds.size || batchBusy}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-[11px] font-bold text-red-600 hover:bg-red-50 disabled:opacity-40"
              >
                Not Approve selected
              </button>
              <button
                onClick={() => batchStatus("Pending", [...selectedIds])}
                disabled={!selectedIds.size || batchBusy}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-[11px] font-bold text-[#5b6b7d] hover:bg-gray-50 disabled:opacity-40"
              >
                Reset selected
              </button>
              <input
                value={notifyMsg}
                onChange={(e) => setNotifyMsg(e.target.value)}
                placeholder="Notification message..."
                className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs outline-none focus:border-[#1e3a5f]"
              />
              <button
                onClick={batchNotify}
                disabled={!selectedIds.size || batchBusy}
                className="rounded-lg border border-[#1e3a5f]/30 px-3 py-1.5 text-[11px] font-bold text-[#1e3a5f] hover:bg-[#1e3a5f]/5 disabled:opacity-40"
              >
                Notify selected
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
              <span className="text-[11px] font-bold uppercase tracking-wide text-[#5b6b7d]">Batch by filter:</span>
              {pendingFilter.length > 0 && (
                <button
                  onClick={batchApproveAllFiltered}
                  disabled={batchBusy}
                  className="rounded-lg bg-green-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-green-700 disabled:opacity-40"
                >
                  Approve all for current filter ({pendingFilter.length})
                </button>
              )}
              <input
                value={batchMsg}
                onChange={(e) => setBatchMsg(e.target.value)}
                disabled={batchBusy}
                placeholder="Message to all students in this view..."
                className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs outline-none focus:border-[#1e3a5f]"
              />
              <button
                onClick={batchNotifyAllFiltered}
                disabled={!filteredApps.length || batchBusy}
                className="rounded-lg border border-[#1e3a5f]/30 px-3 py-1.5 text-[11px] font-bold text-[#1e3a5f] hover:bg-[#1e3a5f]/5 disabled:opacity-40"
              >
                Notify all ({filteredApps.length})
              </button>
            </div>
          </div>

          {filteredApps.map((app) => {
            const isExpanded = expandedApp === app.application_id;
            const comp = completenessFor(app.student_id);
            const ranked = isRanked(app.application_id);
            const elsewhere = approvedElsewhere(app);
            const draft = statusDraft[app.application_id] || { status: app.application_status, remarks: app.remarks || "" };
            const currentStatus = draft.status;
            const currentRemarks = draft.remarks;
            const isDirty = currentStatus !== app.application_status || currentRemarks !== (app.remarks || "");
            const appDocs = docs.filter((d) => d.application_id === app.application_id);
            const appAcads = acads.filter((a) => a.student_id === app.student_id);
            const appChed = chedForms.filter((c) => c.application_id === app.application_id);

            return (
              <div key={app.application_id} className={`rounded-xl border bg-white p-4 shadow-sm ${selectedIds.has(app.application_id) ? "border-[#1e3a5f] ring-1 ring-[#1e3a5f]/20" : "border-gray-200"}`}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(app.application_id)}
                      onChange={() => toggleSelect(app.application_id)}
                      className="h-4 w-4 shrink-0 accent-[#1e3a5f]"
                      title="Select this application"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900">
                        {app.student_accounts?.last_name}, {app.student_accounts?.given_name}{" "}
                        <span className="font-normal text-gray-400">({app.student_accounts?.student_number})</span>
                      </p>
                      <p className="text-xs text-[#1e3a5f]">{app.scholarship_programs?.scholarship_name}</p>
                      <p className="text-[11px] text-gray-400">Submitted {formatDateTime(app.application_date)}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
                    <Badge className={STATUS_STYLES[app.application_status] || ""}>{app.application_status}</Badge>
                    {elsewhere && (
                      <Badge className="border-purple-200 bg-purple-50 text-purple-700">Approved elsewhere</Badge>
                    )}
                    <Badge className={comp.complete ? "border-green-200 bg-green-50 text-green-700" : "border-orange-200 bg-orange-50 text-orange-700"}>
                      {comp.complete ? "Complete" : `Missing ${comp.missing.length}`}
                    </Badge>
                    {ranked && (
                      <Badge className="border-blue-200 bg-blue-50 text-blue-700">
                        Ranked #{rankings.find((r) => r.application_id === app.application_id)?.ranking_position}
                      </Badge>
                    )}
                    <button
                      onClick={() => toggleExpand(app.application_id)}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-[11px] font-bold text-[#1e3a5f] hover:bg-gray-50"
                    >
                      {isExpanded ? "Hide Details" : "View Details"}
                    </button>
                  </div>
                </div>

                {!comp.complete && (
                  <p className="mt-2 rounded-lg bg-orange-50 px-3 py-2 text-[11px] text-orange-700">
                    Missing: {comp.missing.join(", ")}
                  </p>
                )}

                <div className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3 sm:flex-row sm:items-center">
                  <select
                    value={currentStatus}
                    onChange={(e) => setStatusDraft({ ...statusDraft, [app.application_id]: { ...draft, status: e.target.value } })}
                    className="rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none focus:border-[#1e3a5f]"
                  >
                    {APPLICATION_STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                  <input
                    value={currentRemarks}
                    onChange={(e) => setStatusDraft({ ...statusDraft, [app.application_id]: { ...draft, remarks: e.target.value } })}
                    placeholder="Remarks (sent to the student)..."
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none focus:border-[#1e3a5f]"
                  />
                  <button
                    onClick={() => handleStatusSave(app)}
                    disabled={!isDirty || savingId === app.application_id}
                    className="rounded-lg bg-[#1e3a5f] px-4 py-2 text-xs font-bold text-white hover:bg-[#152b48] disabled:opacity-40"
                  >
                    {savingId === app.application_id ? "Saving..." : "Update + notify"}
                  </button>
                </div>

                {isExpanded && (
                  <div className="mt-4 space-y-5 border-t border-gray-100 pt-4">
                    <div className="rounded-xl border border-gray-200 bg-blue-50/40 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <h4 className="text-[11px] font-bold uppercase tracking-wide text-[#5b6b7d]">
                          Applicant Profile
                        </h4>
                        <div className="flex items-center gap-2">
                          <Badge className={STATUS_STYLES[app.application_status] || ""}>{app.application_status}</Badge>
                          {comp.complete
                            ? <Badge className="border-green-200 bg-green-50 text-green-700">Complete</Badge>
                            : <Badge className="border-orange-200 bg-orange-50 text-orange-700">Missing {comp.missing.length}</Badge>}
                          {elsewhere && <Badge className="border-purple-200 bg-purple-50 text-purple-700">Approved elsewhere</Badge>}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-xs sm:grid-cols-3 lg:grid-cols-4">
                        <div className="rounded-lg bg-white p-2.5 shadow-sm"><p className="text-[10px] uppercase tracking-wide text-gray-400">Full Name</p><p className="mt-0.5 font-semibold text-[#1e3a5f]">{app.student_accounts?.last_name}, {app.student_accounts?.given_name}</p></div>
                        <div className="rounded-lg bg-white p-2.5 shadow-sm"><p className="text-[10px] uppercase tracking-wide text-gray-400">Student No.</p><p className="mt-0.5 font-semibold text-[#1e3a5f]">{app.student_accounts?.student_number || "\u2014"}</p></div>
                        <div className="rounded-lg bg-white p-2.5 shadow-sm"><p className="text-[10px] uppercase tracking-wide text-gray-400">Program</p><p className="mt-0.5 font-semibold text-[#1e3a5f]">{app.student_accounts?.program_name || "\u2014"}</p></div>
                        <div className="rounded-lg bg-white p-2.5 shadow-sm"><p className="text-[10px] uppercase tracking-wide text-gray-400">Year Level</p><p className="mt-0.5 font-semibold text-[#1e3a5f]">{app.student_accounts?.year_level || "\u2014"}</p></div>
                        <div className="rounded-lg bg-white p-2.5 shadow-sm"><p className="text-[10px] uppercase tracking-wide text-gray-400">Sex</p><p className="mt-0.5 font-semibold text-[#1e3a5f]">{app.student_accounts?.sex || "\u2014"}</p></div>
                        <div className="rounded-lg bg-white p-2.5 shadow-sm"><p className="text-[10px] uppercase tracking-wide text-gray-400">Registration</p><div className="mt-0.5"><Badge className={app.student_accounts?.registration_status === "Verified" ? "border-green-200 bg-green-50 text-green-700" : "border-amber-200 bg-amber-50 text-amber-700"}>{app.student_accounts?.registration_status || "\u2014"}</Badge></div></div>
                        <div className="rounded-lg bg-white p-2.5 shadow-sm"><p className="text-[10px] uppercase tracking-wide text-gray-400">Account Status</p><div className="mt-0.5"><Badge className={app.student_accounts?.account_status === "Active" ? "border-green-200 bg-green-50 text-green-700" : "border-gray-200 bg-gray-100 text-gray-600"}>{app.student_accounts?.account_status || "\u2014"}</Badge></div></div>
                        <div className="rounded-lg bg-white p-2.5 shadow-sm"><p className="text-[10px] uppercase tracking-wide text-gray-400">Submitted</p><p className="mt-0.5 font-semibold text-[#1e3a5f]">{formatDateTime(app.application_date)}</p></div>
                      </div>
                    </div>

                    {appChed.length > 0 && (
                      <div className="rounded-xl border border-gray-200 bg-white p-4">
                        <h4 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[#5b6b7d]">
                          CHED Application Form
                        </h4>
                        {appChed.map((c) => (
                          <div key={c.ched_form_id} className="grid grid-cols-2 gap-x-8 gap-y-3 text-xs sm:grid-cols-3 lg:grid-cols-4">
                            <div><p className="text-[10px] uppercase tracking-wide text-gray-400">Last Name</p><p className="mt-0.5 font-semibold text-[#1e3a5f]">{c.last_name || "\u2014"}</p></div>
                            <div><p className="text-[10px] uppercase tracking-wide text-gray-400">First Name</p><p className="mt-0.5 font-semibold text-[#1e3a5f]">{c.given_name || "\u2014"}</p></div>
                            <div><p className="text-[10px] uppercase tracking-wide text-gray-400">Middle Name</p><p className="mt-0.5 font-semibold text-[#1e3a5f]">{c.middle_name || "\u2014"}</p></div>
                            <div><p className="text-[10px] uppercase tracking-wide text-gray-400">Ext. Name</p><p className="mt-0.5 font-semibold text-[#1e3a5f]">{c.ext_name || "\u2014"}</p></div>
                            <div><p className="text-[10px] uppercase tracking-wide text-gray-400">Sex</p><p className="mt-0.5 font-semibold text-[#1e3a5f]">{c.sex || "\u2014"}</p></div>
                            <div><p className="text-[10px] uppercase tracking-wide text-gray-400">Birthdate</p><p className="mt-0.5 font-semibold text-[#1e3a5f]">{c.birthdate || "\u2014"}</p></div>
                            <div><p className="text-[10px] uppercase tracking-wide text-gray-400">Program</p><p className="mt-0.5 font-semibold text-[#1e3a5f]">{c.complete_program_name || "\u2014"}</p></div>
                            <div><p className="text-[10px] uppercase tracking-wide text-gray-400">Year Level</p><p className="mt-0.5 font-semibold text-[#1e3a5f]">{c.year_level || "\u2014"}</p></div>
                            <div><p className="text-[10px] uppercase tracking-wide text-gray-400">Father&apos;s Name</p><p className="mt-0.5 font-semibold text-[#1e3a5f]">{c.father_name || "\u2014"}</p></div>
                            <div><p className="text-[10px] uppercase tracking-wide text-gray-400">Mother&apos;s Name</p><p className="mt-0.5 font-semibold text-[#1e3a5f]">{c.mother_name || "\u2014"}</p></div>
                            <div><p className="text-[10px] uppercase tracking-wide text-gray-400">Street / Barangay</p><p className="mt-0.5 font-semibold text-[#1e3a5f]">{c.street_barangay || "\u2014"}</p></div>
                            <div><p className="text-[10px] uppercase tracking-wide text-gray-400">Zipcode</p><p className="mt-0.5 font-semibold text-[#1e3a5f]">{c.zipcode || "\u2014"}</p></div>
                            <div><p className="text-[10px] uppercase tracking-wide text-gray-400">Contact Number</p><p className="mt-0.5 font-semibold text-[#1e3a5f]">{c.contact_number || "\u2014"}</p></div>
                            <div><p className="text-[10px] uppercase tracking-wide text-gray-400">Email Address</p><p className="mt-0.5 font-semibold text-[#1e3a5f]">{c.email_address || "\u2014"}</p></div>
                            <div><p className="text-[10px] uppercase tracking-wide text-gray-400">Disability</p><p className="mt-0.5 font-semibold text-[#1e3a5f]">{c.disability || "\u2014"}</p></div>
                            <div><p className="text-[10px] uppercase tracking-wide text-gray-400">IP Group</p><p className="mt-0.5 font-semibold text-[#1e3a5f]">{c.indigenous_people_group || "\u2014"}</p></div>
                            <div><p className="text-[10px] uppercase tracking-wide text-gray-400">Annual Family Income</p><p className="mt-0.5 font-semibold text-[#1e3a5f]">&#8369;{Number(c.annual_income_family || 0).toLocaleString()}/yr</p></div>
                            <div>
                              <p className="text-[10px] uppercase tracking-wide text-gray-400">ITR File</p>
                              {c.income_tax_return && fileUrls[c.income_tax_return] ? (
                                <a href={fileUrls[c.income_tax_return]} target="_blank" rel="noreferrer" className="mt-0.5 inline-block font-semibold text-[#1e3a5f] hover:underline">View ITR</a>
                              ) : c.income_tax_return ? (
                                <button onClick={() => toggleExpand(app.application_id)} className="mt-0.5 text-[10px] font-semibold text-gray-400 hover:text-[#1e3a5f]">load link</button>
                              ) : <p className="mt-0.5 font-semibold text-[#1e3a5f]">{"\u2014"}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="rounded-xl border border-gray-200 bg-white p-4">
                      <h4 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[#5b6b7d]">
                        Academic Records ({appAcads.length})
                      </h4>
                      {appAcads.length === 0 ? (
                        <p className="text-[11px] text-gray-400">No academic records uploaded.</p>
                      ) : (
                        <ul className="space-y-2">
                          {appAcads.map((a) => (
                            <li key={a.record_id} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2">
                              <div className="flex items-center gap-3 text-xs">
                                <Badge className="border-gray-200 bg-white text-[#5b6b7d]">{a.applicant_type || "N/A"}</Badge>
                                <span className="font-semibold text-[#1e3a5f]">GWA/GPA: {a.shs_gwa ?? a.college_gpa ?? "\u2014"}</span>
                              </div>
                              {a.proof_image_path && fileUrls[a.proof_image_path] ? (
                                <a href={fileUrls[a.proof_image_path]} target="_blank" rel="noreferrer" className="font-semibold text-[#1e3a5f] hover:underline">View proof</a>
                              ) : a.proof_image_path ? (
                                <button onClick={() => toggleExpand(app.application_id)} className="text-[10px] font-semibold text-gray-400 hover:text-[#1e3a5f]">load link</button>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white p-4">
                      <h4 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[#5b6b7d]">
                        Support Documents ({appDocs.length})
                      </h4>
                      {appDocs.length === 0 ? (
                        <p className="text-[11px] text-gray-400">No documents uploaded.</p>
                      ) : (
                        <ul className="space-y-2">
                          {appDocs.map((d) => (
                            <li key={d.document_id} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2">
                              <div className="flex items-center gap-2 text-xs">
                                <Badge className="border-gray-200 bg-white text-[#5b6b7d]">{d.document_type}</Badge>
                                <span className="text-[10px] text-gray-400">{d.file_path.split("/").pop()}</span>
                              </div>
                              {fileUrls[d.file_path] ? (
                                <a href={fileUrls[d.file_path]} target="_blank" rel="noreferrer" className="font-semibold text-[#1e3a5f] hover:underline">View</a>
                              ) : (
                                <button onClick={() => toggleExpand(app.application_id)} className="text-[10px] font-semibold text-gray-400 hover:text-[#1e3a5f]">load link</button>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                      {!comp.complete && (
                        <p className="mt-3 rounded-lg bg-orange-50 px-3 py-2 text-[11px] text-orange-700">
                          Missing: {comp.missing.join(", ")}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="pt-2 text-[11px] leading-relaxed text-gray-400">
        Applications are received (Process 2.0), ranked through the ML system (Process 3.0), and reviewed (Process 4.0).
        Approving one program for a student automatically marks their other applications as Not Approved.
      </p>
    </div>
  );
}
