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

interface ScholarshipApplication {
  application_id: number;
  student_id: number;
  scholarship_id: number;
  application_date: string;
  application_status: string;
  remarks?: string | null;
  scholarship_programs?: { scholarship_name: string };
  student_accounts?: { given_name: string; last_name: string; student_number: string; program_name: string; year_level?: string; sex?: string; registration_status?: string; account_status?: string };
}

interface SupportDocument {
  document_id: number;
  student_id: number;
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
  contact_number?: string;
  email_address?: string;
  indigenous_people_group?: string;
  income_tax_return?: string;
  annual_income_family?: number;
}

export default function ApplicationsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [applications, setApplications] = useState<ScholarshipApplication[]>([]);
  const [docs, setDocs] = useState<SupportDocument[]>([]);
  const [acads, setAcads] = useState<SupportAcademicRecord[]>([]);
  const [chedForms, setChedForms] = useState<ChedFormInput[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [expandedApp, setExpandedApp] = useState<number | null>(null);
  const [fileUrls, setFileUrls] = useState<Record<string, string>>({});
  const [statusDraft, setStatusDraft] = useState<Record<number, { status: string; remarks: string }>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchMsg, setBatchMsg] = useState("");
  const [batchBusy, setBatchBusy] = useState(false);
  const [notifyMsg, setNotifyMsg] = useState("");
  const [studentReqs, setStudentReqs] = useState<Record<number, Set<string>>>({});

  useEffect(() => {
    let ignore = false;
    async function startFetching() {
      const sb = getSupabase();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { router.push("/login"); return; }

      const [appsQ, docsQ, acadsQ, chedQ] = await Promise.all([
        sb.from("scholarship_applications")
          .select("*, scholarship_programs(scholarship_name), student_accounts(given_name, last_name, student_number, program_name, year_level, sex, registration_status, account_status)")
          .order("application_date", { ascending: false }),
        sb.from("support_documents").select("*").order("upload_date", { ascending: false }),
        sb.from("support_academic_records").select("*").order("created_at", { ascending: false }),
        sb.from("ched_form_input").select("*").order("ched_form_id", { ascending: false }),
      ]);

      if (!appsQ.error) setApplications(appsQ.data || []);
      if (!docsQ.error) setDocs(docsQ.data || []);
      if (!acadsQ.error) setAcads(acadsQ.data || []);
      if (!chedQ.error) setChedForms(chedQ.data || []);

      const reqMap: Record<number, Set<string>> = {};
      if (!docsQ.error) (docsQ.data || []).forEach((d: SupportDocument) => {
        if (!reqMap[d.student_id]) reqMap[d.student_id] = new Set();
        reqMap[d.student_id].add(d.document_type);
      });
      if (!acadsQ.error) (acadsQ.data || []).forEach((a: SupportAcademicRecord) => {
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

  const incompleteApps = applications.filter((a) => !completenessFor(a.student_id).complete);

  const filteredApps = statusFilter
    ? applications.filter((a) => a.application_status === statusFilter)
    : applications;

  async function toggleExpand(appId: number) {
    if (expandedApp === appId) { setExpandedApp(null); return; }
    setExpandedApp(appId);
    setFileUrls({});
    const sb = getSupabase();
    const app = applications.find((a) => a.application_id === appId);
    if (!app) return;

    const appDocs = docs.filter((d) => d.student_id === app.student_id);
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

  async function handleStatusSave(app: ScholarshipApplication) {
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

  function exportCsv() {
    const chedByApp = Object.fromEntries(chedForms.map((c) => [c.application_id, c]));
    const acadByStudent = Object.fromEntries(acads.map((a) => [a.student_id, a]));
    const docByStudent: Record<number, string> = {};
    docs.forEach((d) => { docByStudent[d.student_id] = `${docByStudent[d.student_id] || ""}${docByStudent[d.student_id] ? "; " : ""}${d.document_type}`; });

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
        "Account Status": a.student_accounts?.account_status || ("" as string),
        "Supporting Documents": docByStudent[a.student_id] || "",
        "Applicant Type": acad?.applicant_type || "",
        "GWA/GPA Score": acad?.shs_gwa ?? acad?.college_gpa ?? "",
        "Remarks": a.remarks || "",
      };
    });

    downloadCsv("scholarship-applications-full.csv", rows);
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

  async function notifyMissingDocs() {
    const targets = incompleteApps.filter((a) => a.application_status !== "Approved");
    if (!targets.length) { setMessage("No applications with missing documents."); return; }
    if (!confirm(`Notify ${targets.length} student(s) whose requirements are incomplete?`)) return;
    setBatchBusy(true);
    setMessage("");
    const sb = getSupabase();
    const rows = targets.map((a) => {
      const comp = completenessFor(a.student_id);
      return {
        student_id: a.student_id,
        title: "Incomplete Requirements",
        message: `Your application for "${a.scholarship_programs?.scholarship_name || "a scholarship"}" is missing: ${comp.missing.join(", ")}. Please submit the missing document(s) to complete your application.`,
        notification_type: "Document Request",
        status: "Unread",
      };
    });
    const { error } = await sb.from("notifications_announcements").insert(rows);
    setBatchBusy(false);
    if (error) { setMessage(`Notify failed: ${error.message}`); return; }
    setMessage(`Sent "missing documents" notice to ${rows.length} student(s).`);
  }

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

  if (loading) return <Spinner label="Loading applications..." color="maroon" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-[#241012]">Scholarship Applications</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[#8B7376]">Process 5.0</span>
          <button
            onClick={exportCsv}
            disabled={!filteredApps.length}
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
        <button
          onClick={() => setStatusFilter("")}
          className={`rounded-md px-3 py-1.5 text-[11px] font-bold transition ${statusFilter === "" ? "bg-[#7B1113] text-white" : "text-[#6B5458] hover:text-[#7B1113]"}`}
        >
          All ({applications.length})
        </button>
        {APPLICATION_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-md px-3 py-1.5 text-[11px] font-bold transition ${statusFilter === s ? "bg-[#7B1113] text-white" : "text-[#6B5458] hover:text-[#7B1113]"}`}
          >
            {s} ({applications.filter((a) => a.application_status === s).length})
          </button>
        ))}
      </div>

      {filteredApps.length === 0 ? (
        <EmptyState icon="&#128196;" title="No applications found" />
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border border-[#7B1113]/20 bg-white p-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-[#241012]">
                <input
                  type="checkbox"
                  checked={filteredApps.length > 0 && filteredApps.every((a) => selectedIds.has(a.application_id))}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 accent-[#7B1113]"
                />
                Select all ({filteredApps.length})
              </label>
              {selectedIds.size > 0 && (
                <span className="text-[11px] font-bold text-[#7B1113]">{selectedIds.size} selected</span>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                onClick={() => batchStatus("Approved", [...selectedIds])}
                disabled={!selectedIds.size || batchBusy}
                className="rounded-lg bg-[#7B1113] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[#540111] disabled:opacity-40"
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
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-[11px] font-bold text-[#6B5458] hover:bg-gray-50 disabled:opacity-40"
              >
                Reset selected
              </button>
              <input
                value={notifyMsg}
                onChange={(e) => setNotifyMsg(e.target.value)}
                placeholder="Notification message..."
                className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs outline-none focus:border-[#7B1113]"
              />
              <button
                onClick={batchNotify}
                disabled={!selectedIds.size || batchBusy}
                className="rounded-lg border border-[#7B1113]/30 px-3 py-1.5 text-[11px] font-bold text-[#7B1113] hover:bg-[#7B1113]/5 disabled:opacity-40"
              >
                Notify selected
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
              <span className="text-[11px] font-bold uppercase tracking-wide text-[#8B7376]">Batch by filter:</span>
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
                className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs outline-none focus:border-[#7B1113]"
              />
              <button
                onClick={batchNotifyAllFiltered}
                disabled={!filteredApps.length || batchBusy}
                className="rounded-lg border border-[#7B1113]/30 px-3 py-1.5 text-[11px] font-bold text-[#7B1113] hover:bg-[#7B1113]/5 disabled:opacity-40"
              >
                Notify all ({filteredApps.length})
              </button>
              <button
                onClick={notifyMissingDocs}
                disabled={!incompleteApps.length || batchBusy}
                className="rounded-lg border border-amber-300 px-3 py-1.5 text-[11px] font-bold text-amber-700 hover:bg-amber-50 disabled:opacity-40"
              >
                Notify missing docs ({incompleteApps.length})
              </button>
            </div>
          </div>

          {filteredApps.map((app) => {
            const isExpanded = expandedApp === app.application_id;
            const draft = statusDraft[app.application_id] || { status: app.application_status, remarks: app.remarks || "" };
            const currentStatus = draft.status;
            const currentRemarks = draft.remarks;
            const isDirty = currentStatus !== app.application_status || currentRemarks !== (app.remarks || "");
            const appDocs = docs.filter((d) => d.student_id === app.student_id);
            const appAcads = acads.filter((a) => a.student_id === app.student_id);
            const appChed = chedForms.filter((c) => c.application_id === app.application_id);
            const comp = completenessFor(app.student_id);

            return (
              <div key={app.application_id} className={`rounded-xl border bg-white p-4 shadow-sm ${selectedIds.has(app.application_id) ? "border-[#7B1113] ring-1 ring-[#7B1113]/20" : "border-gray-200"}`}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(app.application_id)}
                      onChange={() => toggleSelect(app.application_id)}
                      className="h-4 w-4 shrink-0 accent-[#7B1113]"
                      title="Select this application"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#241012]">
                        {app.student_accounts?.last_name}, {app.student_accounts?.given_name}{" "}
                        <span className="font-normal text-[#8B7376]">({app.student_accounts?.student_number})</span>
                      </p>
                      <p className="text-xs text-[#7B1113]">{app.scholarship_programs?.scholarship_name}</p>
                      <p className="text-[11px] text-[#8B7376]">Submitted {formatDateTime(app.application_date)}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={STATUS_STYLES[app.application_status] || ""}>{app.application_status}</Badge>
                    <button
                      onClick={() => toggleExpand(app.application_id)}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-[11px] font-bold text-[#7B1113] hover:bg-gray-50"
                    >
                      {isExpanded ? "Hide Details" : "View Details"}
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3 sm:flex-row sm:items-center">
                  <select
                    value={currentStatus}
                    onChange={(e) => setStatusDraft({ ...statusDraft, [app.application_id]: { ...draft, status: e.target.value } })}
                    className="rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none focus:border-[#7B1113]"
                  >
                    {APPLICATION_STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                  <input
                    value={currentRemarks}
                    onChange={(e) => setStatusDraft({ ...statusDraft, [app.application_id]: { ...draft, remarks: e.target.value } })}
                    placeholder="Remarks (sent to the student)..."
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none focus:border-[#7B1113]"
                  />
                  <button
                    onClick={() => handleStatusSave(app)}
                    disabled={!isDirty || savingId === app.application_id}
                    className="rounded-lg bg-[#7B1113] px-4 py-2 text-xs font-bold text-white hover:bg-[#540111] disabled:opacity-40"
                  >
                    {savingId === app.application_id ? "Saving..." : "Update + notify"}
                  </button>
                </div>

                {isExpanded && (
                  <div className="mt-4 space-y-5 border-t border-gray-100 pt-4">
                    <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <h4 className="text-[11px] font-bold uppercase tracking-wide text-[#8B7376]">
                          Applicant Profile
                        </h4>
                        <div className="flex items-center gap-2">
                          <Badge className={STATUS_STYLES[app.application_status] || ""}>{app.application_status}</Badge>
                          {comp.complete
                            ? <Badge className="border-green-200 bg-green-50 text-green-700">Complete</Badge>
                            : <Badge className="border-orange-200 bg-orange-50 text-orange-700">Missing {comp.missing.length}</Badge>}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-xs sm:grid-cols-3 lg:grid-cols-4">
                        <div className="rounded-lg bg-white p-2.5 shadow-sm"><p className="text-[10px] uppercase tracking-wide text-[#8B7376]">Full Name</p><p className="mt-0.5 font-semibold text-[#241012]">{app.student_accounts?.last_name}, {app.student_accounts?.given_name}</p></div>
                        <div className="rounded-lg bg-white p-2.5 shadow-sm"><p className="text-[10px] uppercase tracking-wide text-[#8B7376]">Student No.</p><p className="mt-0.5 font-semibold text-[#241012]">{app.student_accounts?.student_number || "\u2014"}</p></div>
                        <div className="rounded-lg bg-white p-2.5 shadow-sm"><p className="text-[10px] uppercase tracking-wide text-[#8B7376]">Program</p><p className="mt-0.5 font-semibold text-[#241012]">{app.student_accounts?.program_name || "\u2014"}</p></div>
                        <div className="rounded-lg bg-white p-2.5 shadow-sm"><p className="text-[10px] uppercase tracking-wide text-[#8B7376]">Year Level</p><p className="mt-0.5 font-semibold text-[#241012]">{app.student_accounts?.year_level || "\u2014"}</p></div>
                        <div className="rounded-lg bg-white p-2.5 shadow-sm"><p className="text-[10px] uppercase tracking-wide text-[#8B7376]">Sex</p><p className="mt-0.5 font-semibold text-[#241012]">{app.student_accounts?.sex || "\u2014"}</p></div>
                        <div className="rounded-lg bg-white p-2.5 shadow-sm"><p className="text-[10px] uppercase tracking-wide text-[#8B7376]">Registration</p><div className="mt-0.5"><Badge className={app.student_accounts?.registration_status === "Verified" ? "border-green-200 bg-green-50 text-green-700" : "border-amber-200 bg-amber-50 text-amber-700"}>{app.student_accounts?.registration_status || "\u2014"}</Badge></div></div>
                        <div className="rounded-lg bg-white p-2.5 shadow-sm"><p className="text-[10px] uppercase tracking-wide text-[#8B7376]">Account Status</p><div className="mt-0.5"><Badge className={app.student_accounts?.account_status === "Active" ? "border-green-200 bg-green-50 text-green-700" : "border-gray-200 bg-gray-100 text-gray-600"}>{app.student_accounts?.account_status || "\u2014"}</Badge></div></div>
                        <div className="rounded-lg bg-white p-2.5 shadow-sm"><p className="text-[10px] uppercase tracking-wide text-[#8B7376]">Submitted</p><p className="mt-0.5 font-semibold text-[#241012]">{formatDateTime(app.application_date)}</p></div>
                      </div>
                    </div>

                    {appChed.length > 0 && (
                      <div className="rounded-xl border border-gray-200 bg-white p-4">
                        <h4 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[#8B7376]">
                          CHED Application Form
                        </h4>
                        {appChed.map((c) => (
                          <div key={c.ched_form_id} className="grid grid-cols-2 gap-x-8 gap-y-3 text-xs sm:grid-cols-3 lg:grid-cols-4">
                            <div><p className="text-[10px] uppercase tracking-wide text-[#8B7376]">Last Name</p><p className="mt-0.5 font-semibold text-[#241012]">{c.last_name || "\u2014"}</p></div>
                            <div><p className="text-[10px] uppercase tracking-wide text-[#8B7376]">First Name</p><p className="mt-0.5 font-semibold text-[#241012]">{c.given_name || "\u2014"}</p></div>
                            <div><p className="text-[10px] uppercase tracking-wide text-[#8B7376]">Middle Name</p><p className="mt-0.5 font-semibold text-[#241012]">{c.middle_name || "\u2014"}</p></div>
                            <div><p className="text-[10px] uppercase tracking-wide text-[#8B7376]">Ext. Name</p><p className="mt-0.5 font-semibold text-[#241012]">{c.ext_name || "\u2014"}</p></div>
                            <div><p className="text-[10px] uppercase tracking-wide text-[#8B7376]">Sex</p><p className="mt-0.5 font-semibold text-[#241012]">{c.sex || "\u2014"}</p></div>
                            <div><p className="text-[10px] uppercase tracking-wide text-[#8B7376]">Birthdate</p><p className="mt-0.5 font-semibold text-[#241012]">{c.birthdate || "\u2014"}</p></div>
                            <div><p className="text-[10px] uppercase tracking-wide text-[#8B7376]">Program</p><p className="mt-0.5 font-semibold text-[#241012]">{c.complete_program_name || "\u2014"}</p></div>
                            <div><p className="text-[10px] uppercase tracking-wide text-[#8B7376]">Year Level</p><p className="mt-0.5 font-semibold text-[#241012]">{c.year_level || "\u2014"}</p></div>
                            <div><p className="text-[10px] uppercase tracking-wide text-[#8B7376]">Father&apos;s Name</p><p className="mt-0.5 font-semibold text-[#241012]">{c.father_name || "\u2014"}</p></div>
                            <div><p className="text-[10px] uppercase tracking-wide text-[#8B7376]">Mother&apos;s Name</p><p className="mt-0.5 font-semibold text-[#241012]">{c.mother_name || "\u2014"}</p></div>
                            <div><p className="text-[10px] uppercase tracking-wide text-[#8B7376]">Street / Barangay</p><p className="mt-0.5 font-semibold text-[#241012]">{c.street_barangay || "\u2014"}</p></div>
                            <div><p className="text-[10px] uppercase tracking-wide text-[#8B7376]">Zipcode</p><p className="mt-0.5 font-semibold text-[#241012]">{c.zipcode || "\u2014"}</p></div>
                            <div><p className="text-[10px] uppercase tracking-wide text-[#8B7376]">Contact Number</p><p className="mt-0.5 font-semibold text-[#241012]">{c.contact_number || "\u2014"}</p></div>
                            <div><p className="text-[10px] uppercase tracking-wide text-[#8B7376]">Email Address</p><p className="mt-0.5 font-semibold text-[#241012]">{c.email_address || "\u2014"}</p></div>
                            <div><p className="text-[10px] uppercase tracking-wide text-[#8B7376]">Disability</p><p className="mt-0.5 font-semibold text-[#241012]">{c.disability || "\u2014"}</p></div>
                            <div><p className="text-[10px] uppercase tracking-wide text-[#8B7376]">IP Group</p><p className="mt-0.5 font-semibold text-[#241012]">{c.indigenous_people_group || "\u2014"}</p></div>
                            <div><p className="text-[10px] uppercase tracking-wide text-[#8B7376]">Annual Family Income</p><p className="mt-0.5 font-semibold text-[#241012]">&#8369;{Number(c.annual_income_family || 0).toLocaleString()}/yr</p></div>
                            <div>
                              <p className="text-[10px] uppercase tracking-wide text-[#8B7376]">ITR File</p>
                              {c.income_tax_return && fileUrls[c.income_tax_return] ? (
                                <a href={fileUrls[c.income_tax_return]} target="_blank" rel="noreferrer" className="mt-0.5 inline-block font-semibold text-[#7B1113] hover:underline">View ITR</a>
                              ) : c.income_tax_return ? (
                                <button onClick={() => toggleExpand(app.application_id)} className="mt-0.5 text-[10px] font-semibold text-[#8B7376] hover:text-[#7B1113]">load link</button>
                              ) : <p className="mt-0.5 font-semibold text-[#241012]">{"\u2014"}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="rounded-xl border border-gray-200 bg-white p-4">
                      <h4 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[#8B7376]">
                        Academic Records ({appAcads.length})
                      </h4>
                      {appAcads.length === 0 ? (
                        <p className="text-[11px] text-[#8B7376]">No academic records uploaded.</p>
                      ) : (
                        <ul className="space-y-2">
                          {appAcads.map((a) => (
                            <li key={a.record_id} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2">
                              <div className="flex items-center gap-3 text-xs">
                                <Badge className="border-gray-200 bg-white text-[#6B5458]">{a.applicant_type || "N/A"}</Badge>
                                <span className="font-semibold text-[#241012]">GWA/GPA: {a.shs_gwa ?? a.college_gpa ?? "\u2014"}</span>
                              </div>
                              {a.proof_image_path && fileUrls[a.proof_image_path] ? (
                                <a href={fileUrls[a.proof_image_path]} target="_blank" rel="noreferrer" className="font-semibold text-[#7B1113] hover:underline">View proof</a>
                              ) : a.proof_image_path ? (
                                <button onClick={() => toggleExpand(app.application_id)} className="text-[10px] font-semibold text-[#8B7376] hover:text-[#7B1113]">load link</button>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white p-4">
                      <h4 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[#8B7376]">
                        Support Documents ({appDocs.length})
                      </h4>
                      {appDocs.length === 0 ? (
                        <p className="text-[11px] text-[#8B7376]">No documents uploaded.</p>
                      ) : (
                        <ul className="space-y-2">
                          {appDocs.map((d) => (
                            <li key={d.document_id} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2">
                              <div className="flex items-center gap-2 text-xs">
                                <Badge className="border-gray-200 bg-white text-[#6B5458]">{d.document_type}</Badge>
                                <span className="text-[10px] text-[#8B7376]">{d.file_path.split("/").pop()}</span>
                              </div>
                              {fileUrls[d.file_path] ? (
                                <a href={fileUrls[d.file_path]} target="_blank" rel="noreferrer" className="font-semibold text-[#7B1113] hover:underline">View</a>
                              ) : (
                                <button onClick={() => toggleExpand(app.application_id)} className="text-[10px] font-semibold text-[#8B7376] hover:text-[#7B1113]">load link</button>
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
    </div>
  );
}
