"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase/browser";
import { formatDateTime, downloadCsv } from "@/lib/utils";
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

export default function AdminDocumentsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<StudentAccount[]>([]);
  const [docs, setDocs] = useState<SupportDocument[]>([]);
  const [acads, setAcads] = useState<AcademicRecord[]>([]);
  const [chedForms, setChedForms] = useState<ChedForm[]>([]);
const [selectedStudent, setSelectedStudent] = useState("");
  const [fileUrls, setFileUrls] = useState<Record<string, string>>({});

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

      if (!studentsQ.error) setStudents(studentsQ.data || []);
      if (!docsQ.error) setDocs(docsQ.data || []);
      if (!acadsQ.error) setAcads(acadsQ.data || []);
      if (!chedQ.error) setChedForms(chedQ.data || []);

      if (!ignore) setLoading(false);
    }
    startFetching();
    return () => { ignore = true; };
  }, [router]);

  async function viewStudentFiles(studentId: number | null) {
    setFileUrls({});
    const sb = getSupabase();

    const studentNumber = studentId ? students.find((s) => s.student_id === studentId)?.student_number : null;
    const ownedDocs = studentNumber ? docs.filter((d) => d.scholarship_applications?.student_accounts?.student_number === studentNumber) : docs;
    const ownedAcads = studentId ? acads.filter((a) => a.student_id === studentId) : acads;

    const map: Record<string, string> = {};
    for (const d of ownedDocs) {
      const res = await sb.storage.from("support-documents").createSignedUrl(d.file_path, 3600);
      if (res.data?.signedUrl) map[d.file_path] = res.data.signedUrl;
    }
    for (const a of ownedAcads) {
      if (!a.proof_image_path) continue;
      const res = await sb.storage.from("academic-records").createSignedUrl(a.proof_image_path, 3600);
      if (res.data?.signedUrl) map[a.proof_image_path] = res.data.signedUrl;
    }
    setFileUrls(map);
  }

  async function viewItr(path: string) {
    const sb = getSupabase();
    const res = await sb.storage.from("itr-documents").createSignedUrl(path, 3600);
    if (res.data?.signedUrl) window.open(res.data.signedUrl, "_blank");
    else alert(res.error?.message || "Could not open file.");
  }

  function exportDocumentsCsv() {
    downloadCsv(
      "support-documents.csv",
      docs.map((d) => ({
        document_id: d.document_id,
        student_number: d.scholarship_applications?.student_accounts?.student_number,
        student: `${d.scholarship_applications?.student_accounts?.last_name ?? ""}, ${d.scholarship_applications?.student_accounts?.given_name ?? ""}`,
        document_type: d.document_type,
        storage_folder: d.file_path.split("/").slice(0, 2).join("/"),
        file: d.file_path.split("/").pop(),
        uploaded: formatDateTime(d.upload_date),
      }))
    );
  }

  function exportAcademicsCsv() {
    downloadCsv(
      "academic-records.csv",
      acads.map((a) => ({
        record_id: a.record_id,
        student_number: a.student_accounts?.student_number,
        student: `${a.student_accounts?.last_name}, ${a.student_accounts?.given_name}`,
        applicant_type: a.applicant_type,
        shs_gwa: a.shs_gwa ?? "",
        college_gpa: a.college_gpa ?? "",
        storage_folder: a.proof_image_path
          ? a.proof_image_path.split("/").slice(0, 2).join("/")
          : "",
        submitted: formatDateTime(a.created_at),
      }))
    );
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
          student: `${sa?.last_name ?? c.last_name}, ${sa?.given_name ?? c.given_name}`,
          scholarship: c.scholarship_applications?.scholarship_programs?.scholarship_name || "",
          annual_income_family: c.annual_income_family,
          contact: c.contact_number || "",
          email: c.email_address || "",
          father: c.father_name || "",
          mother: c.mother_name || "",
          itr_file: c.income_tax_return ? c.income_tax_return.split("/").pop() : "",
          storage_folder: c.income_tax_return
            ? `itr-documents/${c.income_tax_return.split("/").slice(0, 2).join("/")}`
            : "",
          submitted: formatDateTime(c.created_at),
        };
      })
    );
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

  if (loading) return <Spinner label="Loading documents..." />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <h1 className="text-lg font-bold text-[#241012]">Support Documents & Academic Records</h1>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={exportDocumentsCsv}
            disabled={!docs.length}
            className="rounded-lg border border-[#7B1113]/30 px-4 py-2 text-xs font-bold text-[#7B1113] hover:bg-[#7B1113]/5 disabled:opacity-50"
          >
            &#11015; Export documents CSV
          </button>
          <button
            onClick={exportAcademicsCsv}
            disabled={!acads.length}
            className="rounded-lg border border-[#7B1113]/30 px-4 py-2 text-xs font-bold text-[#7B1113] hover:bg-[#7B1113]/5 disabled:opacity-50"
          >
            &#11015; Export academic records CSV
          </button>
          <button
            onClick={exportItrCsv}
            disabled={!chedForms.length}
            className="rounded-lg border border-[#7B1113]/30 px-4 py-2 text-xs font-bold text-[#7B1113] hover:bg-[#7B1113]/5 disabled:opacity-50"
          >
            &#11015; Export ITR submissions CSV
          </button>
        </div>
      </div>

      <select
        value={selectedStudent}
        onChange={(e) => {
          const v = e.target.value;
          setSelectedStudent(v);
          viewStudentFiles(v ? Number(v) : null);
        }}
        className="w-full max-w-md rounded-lg border border-[#7B1113]/25 bg-white px-3 py-2.5 text-xs outline-none focus:border-[#7B1113]"
      >
        <option value="">All students ({docs.length + acads.length} files)</option>
        {students.map((s) => (
          <option key={s.student_id} value={s.student_id}>
            {s.last_name}, {s.given_name} ({s.student_number || "no ID"})
          </option>
        ))}
      </select>

      {docs.length === 0 && acads.length === 0 ? (
        <EmptyState icon="&#128450;" title="No uploads yet" hint="Files appear here as students upload requirements." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-[#7B1113]/10 bg-white p-5 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wide text-[#8B7376]">
              Support Documents ({visibleDocs.length})
            </h3>
            {visibleDocs.length === 0 ? (
              <p className="mt-3 text-xs text-[#8B7376]">Nothing to show for this filter.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {visibleDocs.map((d) => (
                  <li key={d.document_id} className="flex items-start justify-between gap-3 text-xs">
                    <span className="min-w-0">
                      <Badge className="border-[#7B1113]/20 bg-[#7B1113]/5 text-[#7B1113]">{d.document_type}</Badge>{" "}
                       <span className="font-semibold">
                        {d.scholarship_applications?.student_accounts?.last_name}, {d.scholarship_applications?.student_accounts?.given_name}
                      </span>{" "}
                      <span className="text-[#8B7376]">({d.scholarship_applications?.student_accounts?.student_number})</span>
                      <span className="mt-0.5 block truncate text-[10px] text-[#8B7376]" title={d.file_path}>
                        &#128193; {d.file_path.split("/").slice(0, 2).join(" / ")}
                      </span>
                    </span>
                    {fileUrls[d.file_path] ? (
                      <a href={fileUrls[d.file_path]} target="_blank" rel="noreferrer" className="shrink-0 font-semibold text-[#7B1113] hover:underline">
                        View
                      </a>
                    ) : (
                      <button
                        onClick={() => viewStudentFiles(selectedNum)}
                        className="shrink-0 text-[10px] font-semibold text-[#8B7376] hover:text-[#7B1113]"
                      >
                        load link
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-[#7B1113]/10 bg-white p-5 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wide text-[#8B7376]">
              Academic Records ({visibleAcads.length})
            </h3>
            {visibleAcads.length === 0 ? (
              <p className="mt-3 text-xs text-[#8B7376]">Nothing to show for this filter.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {visibleAcads.map((a) => (
                  <li key={a.record_id} className="flex items-start justify-between gap-3 text-xs">
                    <span className="min-w-0">
                      <Badge className="border-[#7B1113]/20 bg-[#7B1113]/5 text-[#7B1113]">{a.applicant_type}</Badge>{" "}
                      <span className="font-semibold">
                        {a.student_accounts?.last_name}, {a.student_accounts?.given_name}
                      </span>{" "}
                      <span className="text-[#8B7376]">({a.student_accounts?.student_number})</span>
                      <strong className="ml-1">{a.shs_gwa ?? a.college_gpa ?? ""}</strong>
                      {a.proof_image_path && (
                        <span className="mt-0.5 block truncate text-[10px] text-[#8B7376]" title={a.proof_image_path}>
                          &#128193; {a.proof_image_path.split("/").slice(0, 2).join(" / ")}
                        </span>
                      )}
                    </span>
                    {a.proof_image_path && fileUrls[a.proof_image_path] ? (
                      <a href={fileUrls[a.proof_image_path]} target="_blank" rel="noreferrer" className="shrink-0 font-semibold text-[#7B1113] hover:underline">
                        View
                      </a>
                    ) : (
                      a.proof_image_path && (
                        <button
                          onClick={() => viewStudentFiles(selectedNum)}
                          className="shrink-0 text-[10px] font-semibold text-[#8B7376] hover:text-[#7B1113]"
                        >
                          load link
                        </button>
                      )
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {visibleChed.length > 0 && (
        <div className="rounded-xl border border-[#7B1113]/10 bg-white p-5 shadow-sm">
          <h3 className="text-xs font-bold uppercase tracking-wide text-[#8B7376]">
            ITR Submissions &mdash; CHED Forms ({visibleChed.length})
          </h3>
          <ul className="mt-3 space-y-3">
            {visibleChed.map((c) => {
              const sa = c.scholarship_applications?.student_accounts;
              return (
                <li
                  key={c.ched_form_id}
                  className="flex flex-col gap-1 border-b border-[#7B1113]/5 pb-2 last:border-none sm:flex-row sm:items-start sm:justify-between"
                >
                  <span className="min-w-0 text-xs">
                    <span className="font-semibold">
                      {sa?.last_name ?? c.last_name}, {sa?.given_name ?? c.given_name}
                    </span>{" "}
                    <span className="text-[#8B7376]">
                      ({c.student_id || sa?.student_number}) &middot; App #{c.application_id}
                    </span>
                    <span className="block truncate text-[11px] text-[#241012]">
                      &#127891; {c.scholarship_applications?.scholarship_programs?.scholarship_name || "\u2014"} &middot; &#128176; &#8369;{Number(c.annual_income_family || 0).toLocaleString()}/yr
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-[#8B7376]" title={c.income_tax_return || ""}>
                      &#128193; itr-documents / {(c.student_id || "").slice(0, 20)} / ITR &middot; {formatDateTime(c.created_at)}
                    </span>
                  </span>
                  {c.income_tax_return && (
                    <button
                      onClick={() => viewItr(c.income_tax_return!)}
                      className="shrink-0 self-start font-semibold text-[#7B1113] hover:underline"
                    >
                      View ITR
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
