"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase/browser";
import { formatDateTime, downloadCsv } from "@/lib/utils";
import JSZip from "jszip";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";

interface StudentAccount {
  student_id: number;
  student_number?: string;
  given_name?: string;
  last_name?: string;
}

interface SupportDocument {
  document_id: number;
  application_id: number;
  document_type: string;
  file_path: string;
  upload_date?: string;
  scholarship_applications?: { student_accounts?: StudentAccount };
}

interface AcademicRecord {
  record_id: number;
  student_id: number;
  applicant_type: string;
  shs_gwa?: string;
  college_gpa?: string;
  proof_image_path?: string;
  created_at?: string;
  student_accounts?: StudentAccount;
}

interface ChedForm {
  ched_form_id: number;
  application_id: number;
  student_id?: string;
  last_name?: string;
  given_name?: string;
  annual_income_family?: number;
  income_tax_return?: string;
  contact_number?: string;
  email_address?: string;
  father_name?: string;
  mother_name?: string;
  created_at?: string;
  scholarship_applications?: {
    scholarship_programs?: { scholarship_name: string };
    student_accounts?: StudentAccount;
  };
}

const IMG_RE = /\.(jpe?g|png|gif|webp|bmp|avif|svg)$/i;
function isImagePath(path?: string) {
  return !!path && IMG_RE.test(path.split(/[?#]/)[0]);
}

function fullName(s?: StudentAccount) {
  if (!s) return "Student";
  const n = `${s.last_name || ""}, ${s.given_name || ""}`.replace(/^, |, $/g, "").trim();
  return n || "Student";
}

function safeFile(name: string) {
  return name.replace(/[^\w.]+/g, "_");
}

function Thumb({ url, path, onClick }: { url?: string; path?: string; onClick: () => void }) {
  if (!url) {
    return (
      <button onClick={onClick} className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-100 text-2xl">
        &#128196;
      </button>
    );
  }
  return (
    <button onClick={onClick} className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-100 shadow-sm transition hover:ring-2 hover:ring-[#7B1113]/40">
      {isImagePath(path) ? (
        <img src={url} alt="document preview" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-2xl">&#128196;</span>
      )}
    </button>
  );
}

type PreviewItem = { url: string; name: string; bucket: string; path: string };

export default function AdminDocumentsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [students, setStudents] = useState<StudentAccount[]>([]);
  const [docs, setDocs] = useState<SupportDocument[]>([]);
  const [acads, setAcads] = useState<AcademicRecord[]>([]);
  const [chedForms, setChedForms] = useState<ChedForm[]>([]);
  const [selectedStudent, setSelectedStudent] = useState("");
  const [fileUrls, setFileUrls] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<PreviewItem | null>(null);
  const [dlBusy, setDlBusy] = useState(false);
  const [dlProgress, setDlProgress] = useState({ done: 0, total: 0 });

  async function signBucket(bucket: string, path: string) {
    const sb = getSupabase();
    const res = await sb.storage.from(bucket).createSignedUrl(path, 3600);
    return res.data?.signedUrl ?? null;
  }

  useEffect(() => {
    let ignore = false;
    async function startFetching() {
      const sb = getSupabase();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { router.push("/login"); return; }

      const [studentsQ, docsQ, acadsQ, chedQ] = await Promise.all([
        sb.from("student_accounts")
          .select("student_id, student_number, given_name, last_name")
          .order("last_name", { ascending: true }),
        sb.from("support_documents")
          .select("*, scholarship_applications(student_accounts(given_name, last_name, student_number))")
          .order("upload_date", { ascending: false }),
        sb.from("support_academic_records")
          .select("*, student_accounts(given_name, last_name, student_number)")
          .order("created_at", { ascending: false }),
        sb.from("ched_form_input")
          .select("*, scholarship_applications(scholarship_id, scholarship_programs(scholarship_name), student_accounts(given_name, last_name, student_number))")
          .order("ched_form_id", { ascending: false }),
      ]);

      const loadedDocs = docsQ.data || [];
      const loadedAcads = acadsQ.data || [];
      const loadedChed = chedQ.data || [];

      if (!studentsQ.error) setStudents(studentsQ.data || []);
      if (!docsQ.error) setDocs(loadedDocs);
      if (!acadsQ.error) setAcads(loadedAcads);
      if (!chedQ.error) setChedForms(loadedChed);

      const map: Record<string, string> = {};
      for (const d of loadedDocs) {
        const url = await signBucket("support-documents", d.file_path);
        if (url) map[d.file_path] = url;
      }
      for (const a of loadedAcads) {
        if (!a.proof_image_path) continue;
        const url = await signBucket("academic-records", a.proof_image_path);
        if (url) map[a.proof_image_path] = url;
      }
      for (const c of loadedChed) {
        if (!c.income_tax_return) continue;
        const url = await signBucket("itr-documents", c.income_tax_return);
        if (url) map[c.income_tax_return] = url;
      }
      if (!ignore) {
        setFileUrls(map);
        setLoading(false);
      }
    }
    startFetching();
    return () => { ignore = true; };
  }, [router]);

  function buildFileName(kind: string, s?: StudentAccount, path?: string) {
    const who = s?.student_number || `${s?.last_name || "student"}${s?.given_name || ""}`;
    const ext = (path?.split("/").pop()?.split(".").pop() || "file").toLowerCase();
    return safeFile(`${kind}_${who}.${ext}`);
  }

  async function downloadOne(url: string, name: string) {
    try {
      const blob = await fetch(url).then((r) => r.blob());
      const obj = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = obj;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(obj);
    } catch {
      setFlash({ type: "err", text: `Could not download ${name}. The signed link may have expired — refresh the page and try again.` });
    }
  }

  async function downloadAll(files: { url: string; name: string }[]) {
    if (dlBusy || !files.length) return;
    setDlBusy(true);
    setDlProgress({ done: 0, total: files.length });
    try {
      const zip = new JSZip();
      const usedNames = new Map<string, number>();
      for (const f of files) {
        let name = f.name.split("/").pop() || `file-${Date.now()}`;
        const count = usedNames.get(name) ?? 0;
        usedNames.set(name, count + 1);
        if (count > 0) {
          const dot = name.lastIndexOf(".");
          name = dot > -1 ? `${name.slice(0, dot)}-${count}${name.slice(dot)}` : `${name}-${count}`;
        }
        try {
          const blob = await fetch(f.url).then((r) => r.blob());
          zip.file(name, blob);
        } catch {
          setFlash({ type: "err", text: `Could not fetch ${name}. The signed link may have expired — refresh the page and try again.` });
        }
        setDlProgress((p) => ({ ...p, done: p.done + 1 }));
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const obj = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = obj;
      a.download = `all-documents-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(obj);
      setFlash({ type: "ok", text: `Downloaded ${files.length} file(s) as one ZIP.` });
    } finally {
      setDlBusy(false);
    }
  }

  function exportDocumentsCsv() {
    downloadCsv(
      "support-documents.csv",
      docs.map((d) => ({
        document_id: d.document_id,
        student_number: d.scholarship_applications?.student_accounts?.student_number ?? "",
        student: fullName(d.scholarship_applications?.student_accounts),
        document_type: d.document_type,
        storage_folder: d.file_path.split("/").slice(0, 2).join("/"),
        file: d.file_path.split("/").pop(),
        uploaded: formatDateTime(d.upload_date),
      }))
    );
    setFlash({ type: "ok", text: `Exported ${docs.length} support document(s) as CSV.` });
  }

  function exportAcademicsCsv() {
    downloadCsv(
      "academic-records.csv",
      acads.map((a) => ({
        record_id: a.record_id,
        student_number: a.student_accounts?.student_number ?? "",
        student: fullName(a.student_accounts),
        applicant_type: a.applicant_type,
        shs_gwa: a.shs_gwa ?? "",
        college_gpa: a.college_gpa ?? "",
        storage_folder: a.proof_image_path ? a.proof_image_path.split("/").slice(0, 2).join("/") : "",
        submitted: formatDateTime(a.created_at),
      }))
    );
    setFlash({ type: "ok", text: `Exported ${acads.length} academic record(s) as CSV.` });
  }

  function exportItrCsv() {
    downloadCsv(
      "itr-submissions.csv",
      chedForms.map((c) => {
        const sa = c.scholarship_applications?.student_accounts;
        return {
          form_id: c.ched_form_id,
          application_id: c.application_id,
          student_number: c.student_id || sa?.student_number || "",
          student: fullName(sa) || `${c.last_name || ""}, ${c.given_name || ""}`.replace(/^, |, $/g, ""),
          scholarship: c.scholarship_applications?.scholarship_programs?.scholarship_name || "",
          annual_income_family: c.annual_income_family,
          contact: c.contact_number || "",
          email: c.email_address || "",
          father: c.father_name || "",
          mother: c.mother_name || "",
          itr_file: c.income_tax_return ? c.income_tax_return.split("/").pop() : "",
          storage_folder: c.income_tax_return ? `itr-documents/${c.income_tax_return.split("/").slice(0, 2).join("/")}` : "",
          submitted: formatDateTime(c.created_at),
        };
      })
    );
    setFlash({ type: "ok", text: `Exported ${chedForms.length} ITR submission(s) as CSV.` });
  }

  const selectedNum = selectedStudent ? Number(selectedStudent) : null;
  const selectedStudentNumber = students.find((s) => s.student_id === selectedNum)?.student_number;
  const visibleDocs = selectedStudentNumber
    ? docs.filter((d) => d.scholarship_applications?.student_accounts?.student_number === selectedStudentNumber)
    : docs;
  const visibleAcads = selectedNum ? acads.filter((a) => a.student_id === selectedNum) : acads;
  const visibleChed = selectedNum
    ? chedForms.filter((c) => {
        const sa = c.scholarship_applications?.student_accounts;
        return sa?.student_number === students.find((s) => s.student_id === selectedNum)?.student_number;
      })
    : chedForms;

  const allDownloadable: { url: string; name: string }[] = [
    ...visibleDocs
      .filter((d) => fileUrls[d.file_path])
      .map((d) => ({
        url: fileUrls[d.file_path],
        name: buildFileName("support", d.scholarship_applications?.student_accounts, d.file_path),
      })),
    ...visibleAcads
      .filter((a) => a.proof_image_path && fileUrls[a.proof_image_path])
      .map((a) => ({
        url: fileUrls[a.proof_image_path!],
        name: buildFileName("academic", a.student_accounts, a.proof_image_path),
      })),
    ...visibleChed
      .filter((c) => c.income_tax_return && fileUrls[c.income_tax_return])
      .map((c) => ({
        url: fileUrls[c.income_tax_return!],
        name: buildFileName("itr", c.scholarship_applications?.student_accounts, c.income_tax_return),
      })),
  ];

  if (loading) return <Spinner label="Loading documents..." />;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#241012]">Documents Viewer</h1>
          <p className="mt-1 text-xs text-[#8B7376]">
            Preview, download, or export every document uploaded by your students.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() =>
              downloadAll(allDownloadable)
            }
            disabled={!allDownloadable.length || dlBusy}
            className="rounded-xl bg-gradient-to-r from-[#7B1113] to-[#540111] px-4 py-2.5 text-xs font-bold text-white shadow-md transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {dlBusy ? `Zipping ${dlProgress.done}/${dlProgress.total}...` : `Download all files (${allDownloadable.length}) as ZIP`}
          </button>
        </div>
      </div>

      {flash && (
        <div className={`rounded-xl border px-4 py-3 text-xs font-medium ${flash.type === "ok" ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}>
          {flash.text}
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <label className="text-xs font-semibold text-[#241012]">
          Filter by student
          <select
            value={selectedStudent}
            onChange={(e) => setSelectedStudent(e.target.value)}
            className="mt-1.5 block w-full min-w-64 rounded-xl border border-[#241012]/10 bg-white px-3.5 py-2.5 text-xs outline-none transition focus:border-[#7B1113] focus:ring-4 focus:ring-[#7B1113]/10"
          >
            <option value="">All students</option>
            {students.map((s) => (
              <option key={s.student_id} value={s.student_id}>
                {s.last_name}, {s.given_name} ({s.student_number || "no ID"})
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={exportDocumentsCsv}
            disabled={!docs.length}
            className="rounded-xl border border-[#7B1113]/30 px-4 py-2.5 text-xs font-bold text-[#7B1113] transition hover:bg-[#7B1113]/5 disabled:opacity-50"
          >
            &#11015; Support docs CSV
          </button>
          <button
            onClick={exportAcademicsCsv}
            disabled={!acads.length}
            className="rounded-xl border border-[#7B1113]/30 px-4 py-2.5 text-xs font-bold text-[#7B1113] transition hover:bg-[#7B1113]/5 disabled:opacity-50"
          >
            &#11015; Academic CSV
          </button>
          <button
            onClick={exportItrCsv}
            disabled={!chedForms.length}
            className="rounded-xl border border-[#7B1113]/30 px-4 py-2.5 text-xs font-bold text-[#7B1113] transition hover:bg-[#7B1113]/5 disabled:opacity-50"
          >
            &#11015; ITR CSV
          </button>
        </div>
      </div>

      {docs.length === 0 && acads.length === 0 && chedForms.length === 0 ? (
        <EmptyState icon="&#128450;" title="No uploads yet" hint="Files appear here as students upload requirements." />
      ) : (
        <>
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-[#241012]">Support Documents</h2>
              <span className="rounded-full bg-[#7B1113]/10 px-2.5 py-0.5 text-[10px] font-bold text-[#7B1113]">{visibleDocs.length}</span>
            </div>
            {visibleDocs.length === 0 ? (
              <p className="mt-3 text-xs text-[#8B7376]">Nothing to show for this filter.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {visibleDocs.map((d) => {
                  const s = d.scholarship_applications?.student_accounts;
                  const url = fileUrls[d.file_path];
                  return (
                    <li key={d.document_id} className="flex items-center gap-4 rounded-xl border border-gray-100 bg-gray-50/50 p-3.5">
                      <Thumb
                        url={url}
                        path={d.file_path}
                        onClick={() => url && setPreview({ url, name: d.file_path.split("/").pop() || d.document_type, bucket: "support-documents", path: d.file_path })}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className="border-[#7B1113]/20 bg-[#7B1113]/5 text-[#7B1113]">{d.document_type}</Badge>
                          <span className="text-xs font-bold text-[#241012]">{fullName(s)}</span>
                          <span className="text-[11px] text-[#8B7376]">({s?.student_number})</span>
                        </div>
                        <p className="mt-1 text-[11px] text-[#8B7376]">Uploaded {formatDateTime(d.upload_date)}</p>
                      </div>
                      <div className="flex shrink-0 flex-col gap-1.5">
                        {url && (
                          <a href={url} target="_blank" rel="noreferrer" className="rounded-xl px-3 py-1.5 text-center text-[11px] font-bold text-[#7B1113] transition hover:bg-[#7B1113]/5">
                            View
                          </a>
                        )}
                        {url && (
                          <button
                            onClick={() => downloadOne(url, buildFileName("support", s, d.file_path))}
                            disabled={dlBusy}
                            className="rounded-xl border border-[#7B1113]/25 px-3 py-1.5 text-[11px] font-bold text-[#7B1113] transition hover:bg-[#7B1113]/5 disabled:opacity-50"
                          >
                            Download
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-[#241012]">Academic Records</h2>
              <span className="rounded-full bg-[#7B1113]/10 px-2.5 py-0.5 text-[10px] font-bold text-[#7B1113]">{visibleAcads.length}</span>
            </div>
            {visibleAcads.length === 0 ? (
              <p className="mt-3 text-xs text-[#8B7376]">Nothing to show for this filter.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {visibleAcads.map((a) => {
                  const url = a.proof_image_path ? fileUrls[a.proof_image_path] : undefined;
                  return (
                    <li key={a.record_id} className="flex items-center gap-4 rounded-xl border border-gray-100 bg-gray-50/50 p-3.5">
                      <Thumb
                        url={url}
                        path={a.proof_image_path}
                        onClick={() => url && setPreview({ url, name: a.proof_image_path?.split("/").pop() || a.applicant_type, bucket: "academic-records", path: a.proof_image_path! })}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className="border-[#7B1113]/20 bg-[#7B1113]/5 text-[#7B1113]">{a.applicant_type}</Badge>
                          <span className="text-xs font-bold text-[#241012]">{fullName(a.student_accounts)}</span>
                          <span className="text-[11px] text-[#8B7376]">({a.student_accounts?.student_number})</span>
                          <strong className="text-xs text-[#7B1113]">{a.shs_gwa ?? a.college_gpa ?? ""}</strong>
                        </div>
                        <p className="mt-1 text-[11px] text-[#8B7376]">Submitted {formatDateTime(a.created_at)}</p>
                      </div>
                      <div className="flex shrink-0 flex-col gap-1.5">
                        {url && (
                          <a href={url} target="_blank" rel="noreferrer" className="rounded-xl px-3 py-1.5 text-center text-[11px] font-bold text-[#7B1113] transition hover:bg-[#7B1113]/5">
                            View
                          </a>
                        )}
                        {url && (
                          <button
                            onClick={() => downloadOne(url, buildFileName("academic", a.student_accounts, a.proof_image_path))}
                            disabled={dlBusy}
                            className="rounded-xl border border-[#7B1113]/25 px-3 py-1.5 text-[11px] font-bold text-[#7B1113] transition hover:bg-[#7B1113]/5 disabled:opacity-50"
                          >
                            Download
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {visibleChed.length > 0 && (
            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-[#241012]">ITR Submissions (CHED Forms)</h2>
                <span className="rounded-full bg-[#7B1113]/10 px-2.5 py-0.5 text-[10px] font-bold text-[#7B1113]">{visibleChed.length}</span>
              </div>
              <ul className="mt-4 space-y-3">
                {visibleChed.map((c) => {
                  const sa = c.scholarship_applications?.student_accounts;
                  const url = c.income_tax_return ? fileUrls[c.income_tax_return] : undefined;
                  return (
                    <li key={c.ched_form_id} className="flex items-center gap-4 rounded-xl border border-gray-100 bg-gray-50/50 p-3.5">
                      <Thumb
                        url={url}
                        path={c.income_tax_return}
                        onClick={() => url && c.income_tax_return && setPreview({ url, name: c.income_tax_return.split("/").pop() || "ITR", bucket: "itr-documents", path: c.income_tax_return })}
                      />
                      <div className="min-w-0 flex-1">
                        <span className="text-xs font-bold text-[#241012]">{fullName(sa) || `${c.last_name || ""}, ${c.given_name || ""}`.replace(/^, |, $/g, "")}</span>
                        <span className="ml-2 text-[11px] text-[#8B7376]">({c.student_id || sa?.student_number}) &middot; App #{c.application_id}</span>
                        <p className="mt-1 text-[11px] text-[#241012]">
                          &#127891; {c.scholarship_applications?.scholarship_programs?.scholarship_name || "\u2014"} &middot; &#8369;{Number(c.annual_income_family || 0).toLocaleString()}/yr
                        </p>
                        <p className="mt-0.5 text-[10px] text-[#8B7376]">Submitted {formatDateTime(c.created_at)}</p>
                      </div>
                      <div className="flex shrink-0 flex-col gap-1.5">
                        {url && (
                          <a href={url} target="_blank" rel="noreferrer" className="rounded-xl px-3 py-1.5 text-center text-[11px] font-bold text-[#7B1113] transition hover:bg-[#7B1113]/5">
                            View
                          </a>
                        )}
                        {url && (
                          <button
                            onClick={() => downloadOne(url, buildFileName("itr", sa, c.income_tax_return))}
                            disabled={dlBusy}
                            className="rounded-xl border border-[#7B1113]/25 px-3 py-1.5 text-[11px] font-bold text-[#7B1113] transition hover:bg-[#7B1113]/5 disabled:opacity-50"
                          >
                            Download
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-3">
              <p className="truncate text-xs font-bold text-[#241012]">{preview.name}</p>
              <button
                onClick={() => setPreview(null)}
                className="rounded-full p-1 text-lg leading-none text-[#8B7376] transition hover:bg-[#7B1113]/5 hover:text-[#7B1113]"
              >
                &times;
              </button>
            </div>
            <div className="flex max-h-[70vh] items-center justify-center overflow-hidden bg-[#241012]/95 p-2">
              {isImagePath(preview.path) ? (
                <img src={preview.url} alt={preview.name} className="max-h-[68vh] w-auto object-contain" />
              ) : (
                <iframe src={preview.url} title={preview.name} className="h-[68vh] w-full rounded-lg" />
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3">
              <a
                href={preview.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-[#7B1113]/30 px-4 py-2 text-xs font-bold text-[#7B1113] transition hover:bg-[#7B1113]/5"
              >
                Open original
              </a>
              <button
                onClick={() => downloadOne(preview.url, preview.name)}
                disabled={dlBusy}
                className="rounded-xl bg-gradient-to-r from-[#7B1113] to-[#540111] px-4 py-2 text-xs font-bold text-white shadow-md transition hover:brightness-110 disabled:opacity-50"
              >
                Download
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}