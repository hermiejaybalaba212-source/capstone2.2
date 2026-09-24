"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase/browser";
import { formatDate, validateFile } from "@/lib/utils";
import { DOC_TYPES, DISABILITY_OPTIONS, IP_GROUP_OPTIONS, getProgramRequirementDocs } from "@/lib/constants";
import { Spinner } from "@/components/ui/spinner";

interface StudentProfile {
  studentId: number;
  studentNumber: string;
  givenName: string;
  lastName: string;
  middleName?: string;
  extName?: string;
  sex?: string;
  birthdate?: string;
  programName?: string;
  yearLevel?: string;
  email: string;
}

interface ScholarshipProgram {
  scholarship_id: number;
  scholarship_name: string;
  description?: string;
  requirements?: string;
  deadline?: string;
  status?: string;
}

export default function ApplyPage() {
  return (
    <Suspense fallback={<Spinner label="Loading application form..." color="maroon" />}>
      <ApplyPageContent />
    </Suspense>
  );
}

function ApplyPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const programIdParam = searchParams.get("programId");

  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState("");
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [programs, setPrograms] = useState<ScholarshipProgram[]>([]);
  const [selectedProgramId, setSelectedProgramId] = useState<number | null>(
    programIdParam ? Number(programIdParam) : null
  );
  const [alreadyApplied, setAlreadyApplied] = useState(false);
  const [alreadyAppliedStatus, setAlreadyAppliedStatus] = useState("");

  const [form, setForm] = useState({
    fatherName: "",
    motherName: "",
    streetBarangay: "",
    zipcode: "",
    disability: "",
    ipGroup: "",
    contactNumber: "",
    email: "",
    annualIncome: "",
  });
  const [itrFile, setItrFile] = useState<File | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrStatus, setOcrStatus] = useState("");
  const [showSampleForm, setShowSampleForm] = useState(false);
  const [docFiles, setDocFiles] = useState<Record<string, File | null>>({});
  const [acadApplicantType, setAcadApplicantType] = useState("");
  const [acadScore, setAcadScore] = useState("");
  const [acadProofFile, setAcadProofFile] = useState<File | null>(null);
  const [acadTypeLocked, setAcadTypeLocked] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("error");

  async function handleItrChange(file: File | null) {
    setItrFile(file);
    setOcrStatus("");
    if (!file) return;
    if (/\.(jpg|jpeg|png|webp)$/i.test(file.name)) {
      setOcrBusy(true);
      setOcrStatus("Reading ITR with OCR…");
      try {
        const { createWorker } = await import("tesseract.js");
        const worker = await createWorker("eng");
        const { data } = await worker.recognize(file);
        await worker.terminate();
        const text = data.text || "";
        const incomeMatch =
          text.match(/(?:total\s+)?(?:annual\s+)?(?:taxable\s+)?income[^\d]{0,40}₱?\s*([\d,]+(?:\.\d{2})?)/i) ||
          text.match(/₱\s*([\d,]+(?:\.\d{2})?)/);
        if (incomeMatch) {
          const parsed = Number(incomeMatch[1].replace(/,/g, ""));
          if (!isNaN(parsed) && parsed > 0) {
            setForm((f) => ({ ...f, annualIncome: String(Math.round(parsed)) }));
            setOcrStatus(`OCR detected annual income: ₱${Math.round(parsed).toLocaleString()} — verify it matches your ITR.`);
          } else {
            setOcrStatus("OCR read the ITR but could not detect income. Please enter it manually.");
          }
        } else {
          setOcrStatus("OCR could not find an income figure on this ITR. Please enter annual family income manually.");
        }
      } catch {
        setOcrStatus("OCR failed for this file. Please enter annual family income manually.");
      }
      setOcrBusy(false);
    }
  }

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

      const userId = authUser.user?.id;
      if (!userId) { setFatalError("Could not identify your account."); setLoading(false); return; }

      const userQuery = await sb
        .from("users")
        .select("user_id, email")
        .eq("auth_user_id", userId)
        .maybeSingle();

      if (userQuery.error || !userQuery.data) {
        setFatalError("Could not find your user record.");
        setLoading(false);
        return;
      }

      const accountQuery = await sb
        .from("student_accounts")
        .select("*")
        .eq("user_id", userQuery.data.user_id)
        .maybeSingle();

      if (accountQuery.error || !accountQuery.data) {
        setFatalError("Could not find your student account.");
        setLoading(false);
        return;
      }

      const acct = accountQuery.data;

      let regStatus = acct.registration_status;
      if (regStatus !== "Verified" && acct.student_number) {
        const { queryRegistrar } = await import("@/lib/supabase/registrar");
        const reg = await queryRegistrar<{ student_number: string }>((rsb) =>
          rsb
            .from("registrar_students")
            .select("student_number")
            .eq("student_number", acct.student_number!)
            .maybeSingle()
        );
        if (reg.data) {
          await sb.from("student_accounts").update({ registration_status: "Verified" }).eq("student_id", acct.student_id);
          regStatus = "Verified";
        }
      }

      if (regStatus !== "Verified") {
        setFatalError("Your account is not yet verified against the Registrar Information System. Please contact the Administrator to get verified before applying for scholarships.");
        setLoading(false);
        return;
      }

      setProfile({
        studentId: acct.student_id,
        studentNumber: acct.student_number || "",
        givenName: acct.given_name || "",
        lastName: acct.last_name || "",
        middleName: acct.middle_name || "",
        extName: acct.ext_name || "",
        sex: acct.sex || "",
        birthdate: acct.birthdate || "",
        programName: acct.program_name || "",
        yearLevel: acct.year_level || "",
        email: userQuery.data.email || "",
      });

      setForm((f) => ({ ...f, email: userQuery.data!.email || "" }));

      const appliedRegType = authUser.user?.user_metadata?.applicant_type as string | undefined;
      const regFreshman = appliedRegType
        ? appliedRegType === "Freshman"
        : (acct.year_level || "").toLowerCase().includes("1st") || (acct.year_level || "").toLowerCase().includes("freshman");
      if (appliedRegType || acct.year_level) {
        setAcadApplicantType(regFreshman ? "Freshman" : "Alumni");
        setAcadTypeLocked(true);
      }

      const programsQuery = await sb
        .from("scholarship_programs")
        .select("*")
        .eq("status", "Open")
        .order("created_at", { ascending: false });

      if (!programsQuery.error && programsQuery.data) {
        setPrograms(programsQuery.data);
      }

      if (!ignore) setLoading(false);
    }
    startFetching();
    return () => { ignore = true; };
  }, [router]);

  useEffect(() => {
    if (!profile || !selectedProgramId) return;
    let cancelled = false;
    const sb = getSupabase();
    sb.from("scholarship_applications")
      .select("application_status")
      .eq("student_id", profile.studentId)
      .eq("scholarship_id", selectedProgramId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setAlreadyApplied(!!data);
        setAlreadyAppliedStatus(data?.application_status ?? "");
      });
    return () => { cancelled = true; };
  }, [profile, selectedProgramId]);

  function handleFormChange(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleContactChange(raw: string) {
    let digits = raw.replace(/\D/g, "");
    if (digits.startsWith("63") && digits.length >= 12) digits = "0" + digits.slice(2);
    else if (digits.startsWith("630")) digits = "0" + digits.slice(3);
    if (digits.length > 0 && digits[0] !== "0") digits = "0" + digits;
    if (digits.length >= 2 && digits[0] === "0" && digits[1] !== "9") {
      digits = "09" + digits.slice(2);
    }
    if (digits.length > 11) digits = digits.slice(0, 11);
    setForm((f) => ({ ...f, contactNumber: digits }));
  }

  function handleZipChange(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 4);
    setForm((f) => ({ ...f, zipcode: digits }));
  }

  function handleDocFileChange(docType: string, file: File | null) {
    setDocFiles((prev) => ({ ...prev, [docType]: file }));
  }

  const PH_PHONE_RE = /^09\d{9}$/;
  const PH_ZIP_RE = /^\d{4}$/;
  const NAME_RE = /^[A-Za-z\u00C0-\u00FF'.\- ]+$/;

  function validateNameField(label: string, value: string): string | null {
    if (!value.trim()) return `${label} is required.`;
    if (/\d/.test(value)) return `${label} must not contain numbers.`;
    if (!NAME_RE.test(value)) return `${label} contains invalid characters.`;
    return null;
  }

  function validatePhone(value: string): string | null {
    const cleaned = value.replace(/\D/g, "");
    if (!PH_PHONE_RE.test(cleaned)) {
      return "Contact number must be a Philippine mobile number: exactly 09XXXXXXXXX (11 digits, starts with 09).";
    }
    return null;
  }

  function validateZipcode(value: string): string | null {
    const cleaned = value.replace(/\D/g, "");
    if (!PH_ZIP_RE.test(cleaned)) {
      return "Zipcode must be a valid PH postal code (exactly 4 digits, e.g. 9200 for Iligan).";
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;

    if (!selectedProgramId) {
      setMessage("Please select a scholarship program.");
      setMessageType("error");
      return;
    }

    const nameChecks: [string, string][] = [
      ["Father's Full Name", form.fatherName],
      ["Mother's Full Name", form.motherName],
    ];
    for (const [label, val] of nameChecks) {
      const err = validateNameField(label, val);
      if (err) { setMessage(err); setMessageType("error"); return; }
    }

    const phoneErr = validatePhone(form.contactNumber);
    if (phoneErr) { setMessage(phoneErr); setMessageType("error"); return; }

    const zipErr = validateZipcode(form.zipcode);
    if (zipErr) { setMessage(zipErr); setMessageType("error"); return; }

    if (!itrFile) {
      setMessage("Please attach the Income Tax Return (ITR) file.");
      setMessageType("error");
      return;
    }

    const fileErr = validateFile(itrFile);
    if (fileErr) {
      setMessage(fileErr);
      setMessageType("error");
      return;
    }

    const selectedProgram = programs.find((p) => p.scholarship_id === selectedProgramId);
    const programDocs = selectedProgram ? getProgramRequirementDocs(selectedProgram.requirements) : [];
    const requiredDocs = programDocs.length > 0 ? programDocs : [...DOC_TYPES];

    for (const docType of requiredDocs) {
      const file = docFiles[docType];
      if (!file) {
        setMessage(`Please attach the ${docType} document. It is required for this scholarship program.`);
        setMessageType("error");
        return;
      }
      const err = validateFile(file);
      if (err) {
        setMessage(`${docType}: ${err}`);
        setMessageType("error");
        return;
      }
    }

    if (!acadApplicantType) {
      setMessage("Please select an Applicant Type (Freshman or Alumni) in the Academic Records section.");
      setMessageType("error");
      return;
    }

    const acadScoreNum = Number(acadScore);
    if (!acadScore || isNaN(acadScoreNum)) {
      setMessage(`Please enter your ${acadApplicantType === "Alumni" ? "College GPA" : "SHS GWA"} in the Academic Records section.`);
      setMessageType("error");
      return;
    }

    if (!acadProofFile) {
      setMessage("Please attach an academic record proof file in the Academic Records section.");
      setMessageType("error");
      return;
    }

    const acadErr = validateFile(acadProofFile);
    if (acadErr) {
      setMessage(`Academic record proof: ${acadErr}`);
      setMessageType("error");
      return;
    }

    setSubmitting(true);
    setMessage("");

    try {
      const sb = getSupabase();
      const existingApp = await sb
        .from("scholarship_applications")
        .select("application_id, application_status")
        .eq("student_id", profile.studentId)
        .eq("scholarship_id", selectedProgramId)
        .maybeSingle();

      if (existingApp.data) {
        setMessage("You have already applied to this scholarship program.");
        setMessageType("error");
        setSubmitting(false);
        return;
      }

      const hasApproved = await sb
        .from("scholarship_applications")
        .select("application_id")
        .eq("student_id", profile.studentId)
        .eq("application_status", "Approved")
        .limit(1);

      if ((hasApproved.data || []).length > 0) {
        setMessage("You already have an approved scholarship. Applications are closed for you.");
        setMessageType("error");
        setSubmitting(false);
        return;
      }

      const safeItrName = itrFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const itrPath = `${profile.studentId}/ITR/${Date.now()}_${safeItrName}`;

      const itrUpload = await sb.storage.from("itr-documents").upload(itrPath, itrFile);
      if (itrUpload.error) {
        setMessage(`ITR upload failed: ${itrUpload.error.message}`);
        setMessageType("error");
        setSubmitting(false);
        return;
      }

      const { data: appRow, error: appErr } = await sb
        .from("scholarship_applications")
        .insert({
          student_id: profile.studentId,
          scholarship_id: selectedProgramId,
          application_data: {
            annual_income_family: Number(form.annualIncome) || 0,
            itr_file: itrPath,
          },
        })
        .select()
        .single();

      if (appErr) {
        await sb.storage.from("itr-documents").remove([itrPath]);
        setMessage(`Application failed: ${appErr.message}`);
        setMessageType("error");
        setSubmitting(false);
        return;
      }

      const { error: chedErr } = await sb.from("ched_form_input").insert({
        application_id: appRow.application_id,
        student_id: String(profile.studentNumber || profile.studentId),
        last_name: profile.lastName,
        given_name: profile.givenName,
        ext_name: profile.extName || null,
        middle_name: profile.middleName || null,
        sex: profile.sex,
        birthdate: profile.birthdate,
        complete_program_name: profile.programName,
        year_level: profile.yearLevel,
        father_name: form.fatherName.trim(),
        mother_name: form.motherName.trim(),
        street_barangay: form.streetBarangay.trim(),
        zipcode: form.zipcode.replace(/\D/g, ""),
        disability: form.disability.trim() || null,
        indigenous_people_group: form.ipGroup.trim() || null,
        contact_number: form.contactNumber.replace(/\D/g, ""),
        email_address: form.email.trim(),
        income_tax_return: itrPath,
        annual_income_family: Number(form.annualIncome) || 0,
      });

      if (chedErr) {
        setMessage(`Application saved but CHED form data failed: ${chedErr.message}`);
        setMessageType("error");
        setSubmitting(false);
        return;
      }

      for (const docType of requiredDocs) {
        const file = docFiles[docType];
        if (!file) continue;

        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const docPath = `${profile.studentId}/${docType.replace(/\s+/g, "_")}/${Date.now()}_${safeName}`;

        const docUpload = await sb.storage.from("support-documents").upload(docPath, file);
        if (docUpload.error) {
          setMessage(`Document upload failed (${docType}): ${docUpload.error.message}`);
          setMessageType("error");
          setSubmitting(false);
          return;
        }

        await sb.from("support_documents").insert({
          document_type: docType,
          file_path: docPath,
          application_id: appRow.application_id,
        });
      }

      if (acadProofFile && acadApplicantType) {
        const safeName = acadProofFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const acadFolder = acadApplicantType === "Freshman" ? "SHS" : "Alumni";
        const acadPath = `${profile.studentId}/${acadFolder}/${Date.now()}_${safeName}`;

        const acadUpload = await sb.storage.from("academic-records").upload(acadPath, acadProofFile);
        if (acadUpload.error) {
          setMessage(`Academic record upload failed: ${acadUpload.error.message}`);
          setMessageType("error");
          setSubmitting(false);
          return;
        }

        const acadPayload: Record<string, unknown> = {
          student_id: profile.studentId,
          applicant_type: acadApplicantType,
          proof_image_path: acadPath,
        };

        const score = Number(acadScore);
        if (acadApplicantType === "Freshman") {
          acadPayload.shs_gwa = score;
        } else {
          acadPayload.college_gpa = score;
        }

        await sb.from("support_academic_records").insert(acadPayload);
      }

      const selectedProgram = programs.find((p) => p.scholarship_id === selectedProgramId);

      await sb.from("notifications_announcements").insert({
        student_id: profile.studentId,
        title: "Scholarship Application Submitted",
        message: `Your application for "${selectedProgram?.scholarship_name || "scholarship"}" has been submitted and is currently under review. You will be notified once a decision has been made.`,
        notification_type: "Status Update",
        status: "Unread",
      });

      setMessage(
        `Application submitted for "${selectedProgram?.scholarship_name || "scholarship"}". Track it in Application Status.`
      );
      setMessageType("success");

      setForm({
        fatherName: "",
        motherName: "",
        streetBarangay: "",
        zipcode: "",
        disability: "",
        ipGroup: "",
        contactNumber: "",
        email: profile.email,
        annualIncome: "",
      });
      setItrFile(null);
      setDocFiles({});
      setAcadApplicantType("");
      setAcadScore("");
      setAcadProofFile(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      setMessage(msg);
      setMessageType("error");
    }

    setSubmitting(false);
  }

  if (loading) {
    return <Spinner label="Loading application form..." />;
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

  const selectedProgramForDocs = programs.find((p) => p.scholarship_id === selectedProgramId);
  const programDocsForRender = selectedProgramForDocs
    ? getProgramRequirementDocs(selectedProgramForDocs.requirements)
    : [];
  const renderRequiredDocs =
    programDocsForRender.length > 0 ? programDocsForRender : [...DOC_TYPES];

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#241012]">Submit Application</h1>
          <p className="mt-1 text-xs text-[#6B5458]">Fill in the form and upload your requirements to apply for a scholarship.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowSampleForm(true)}
          className="shrink-0 rounded-lg border border-[#7B1113]/30 px-3 py-2 text-xs font-bold text-[#7B1113] transition hover:bg-[#7B1113]/5"
        >
          View Form Sample
        </button>
      </div>

      {message && (
        <div
          className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
            messageType === "success"
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-4 space-y-5">
        <div className="rounded-xl border border-[#241012]/[0.06] bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-[#241012]">Scholarship Program</h2>
          <select
            value={selectedProgramId || ""}
            onChange={(e) => setSelectedProgramId(Number(e.target.value) || null)}
            required
            className="mt-3 w-full rounded-lg border border-[#241012]/15 bg-white px-3 py-2 text-xs outline-none focus:border-[#7B1113]"
          >
            <option value="">Choose a program...</option>
            {programs.map((p) => (
              <option key={p.scholarship_id} value={p.scholarship_id}>
                {p.scholarship_name}
                {p.deadline ? ` — Deadline: ${formatDate(p.deadline)}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-xl border border-[#241012]/[0.06] bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-[#241012]">CHED Application Form</h2>
          <p className="mt-1 text-[11px] text-[#6B5458]">All fields marked with * are required.</p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-[#241012]">
              Father&apos;s Full Name *
              <input
                value={form.fatherName}
                onChange={(e) => handleFormChange("fatherName", e.target.value)}
                placeholder="Juan D. Dela Cruz"
                required
                className="mt-1 w-full rounded-lg border border-[#241012]/15 bg-white px-3 py-2 text-xs outline-none focus:border-[#7B1113]"
              />
            </label>
            <label className="block text-xs font-semibold text-[#241012]">
              Mother&apos;s Full Name *
              <input
                value={form.motherName}
                onChange={(e) => handleFormChange("motherName", e.target.value)}
                placeholder="Maria D. Dela Cruz"
                required
                className="mt-1 w-full rounded-lg border border-[#241012]/15 bg-white px-3 py-2 text-xs outline-none focus:border-[#7B1113]"
              />
            </label>
            <label className="block text-xs font-semibold text-[#241012]">
              Street / Barangay *
              <input
                value={form.streetBarangay}
                onChange={(e) => handleFormChange("streetBarangay", e.target.value)}
                placeholder="e.g. Purok 6, Tibanga"
                required
                className="mt-1 w-full rounded-lg border border-[#241012]/15 bg-white px-3 py-2 text-xs outline-none focus:border-[#7B1113]"
              />
            </label>
            <label className="block text-xs font-semibold text-[#241012]">
              Zipcode *
              <input
                value={form.zipcode}
                onChange={(e) => handleZipChange(e.target.value)}
                inputMode="numeric"
                maxLength={4}
                pattern="\d{4}"
                placeholder="9200"
                required
                className="mt-1 w-full rounded-lg border border-[#241012]/15 bg-white px-3 py-2 text-xs outline-none focus:border-[#7B1113]"
              />
              <span className="mt-0.5 block text-[10px] font-normal text-[#8B7376]">Digits only — exactly 4 digits (e.g. 9200).</span>
            </label>
            <label className="block text-xs font-semibold text-[#241012]">
              Contact Number *
              <input
                value={form.contactNumber}
                onChange={(e) => handleContactChange(e.target.value)}
                inputMode="numeric"
                maxLength={11}
                pattern="09\d{9}"
                placeholder="09XXXXXXXXX"
                autoComplete="tel-national"
                required
                className="mt-1 w-full rounded-lg border border-[#241012]/15 bg-white px-3 py-2 text-xs outline-none focus:border-[#7B1113]"
              />
              <span
                className={`mt-0.5 block text-[10px] font-normal ${
                  !form.contactNumber
                    ? "text-[#8B7376]"
                    : PH_PHONE_RE.test(form.contactNumber)
                      ? "text-green-700"
                      : "text-amber-700"
                }`}
              >
                {!form.contactNumber
                  ? "Philippine mobile only — exactly 11 digits starting with 09 (e.g. 09171234567)."
                  : PH_PHONE_RE.test(form.contactNumber)
                    ? "Valid PH mobile number."
                    : `Digits only · max 11 · must start with 09 (${form.contactNumber.length}/11).`}
              </span>
            </label>
            <label className="block text-xs font-semibold text-[#241012]">
              Email Address *
              <input
                type="email"
                value={form.email}
                onChange={(e) => handleFormChange("email", e.target.value)}
                placeholder="you@email.com"
                required
                className="mt-1 w-full rounded-lg border border-[#241012]/15 bg-white px-3 py-2 text-xs outline-none focus:border-[#7B1113]"
              />
            </label>
            <label className="block text-xs font-semibold text-[#241012]">
              Disability (optional)
              <select
                value={form.disability}
                onChange={(e) => handleFormChange("disability", e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#241012]/15 bg-white px-3 py-2 text-xs outline-none focus:border-[#7B1113]"
              >
                <option value="">Select disability (if any)...</option>
                {DISABILITY_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </label>
            <label className="block text-xs font-semibold text-[#241012]">
              Indigenous People Group (optional)
              <select
                value={form.ipGroup}
                onChange={(e) => handleFormChange("ipGroup", e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#241012]/15 bg-white px-3 py-2 text-xs outline-none focus:border-[#7B1113]"
              >
                <option value="">Select IP group (if any)...</option>
                {IP_GROUP_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </label>
            <label className="block text-xs font-semibold text-[#241012]">
              Annual Family Income (PHP) *
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.annualIncome}
                onChange={(e) => handleFormChange("annualIncome", e.target.value)}
                placeholder="150000"
                required
                className="mt-1 w-full rounded-lg border border-[#241012]/15 bg-white px-3 py-2 text-xs outline-none focus:border-[#7B1113]"
              />
            </label>
            <label className="block text-xs font-semibold text-[#241012] sm:col-span-2">
              Income Tax Return (ITR) File * — JPG / PNG / PDF, max 10 MB
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.pdf"
                onChange={(e) => handleItrChange(e.target.files?.[0] || null)}
                required
                className="mt-1 w-full rounded-lg border border-dashed border-[#241012]/15 bg-[#FAF7F5] px-3 py-2 text-xs file:mr-3 file:rounded-md file:border-0 file:bg-[#7B1113] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
              />
              {ocrStatus && (
                <span className={`mt-1 block text-[11px] ${ocrBusy ? "text-amber-700" : "text-[#6B5458]"}`}>{ocrStatus}</span>
              )}
            </label>
          </div>
        </div>

        <div className="rounded-xl border border-[#241012]/[0.06] bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-[#241012]">Supporting Documents</h2>
          <p className="mt-1 text-[11px] text-[#6B5458]">
            {renderRequiredDocs.length > 0
              ? <>Upload clear scans of each required document below (JPG, PNG, or PDF, max 10 MB). Only the requirements checked by the <span className="font-semibold text-[#7B1113]">{selectedProgramForDocs?.scholarship_name || "selected program"}</span> are shown.</>
              : "Upload clear scans of each requirement (JPG, PNG, or PDF, max 10 MB)."}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {renderRequiredDocs.map((docType) => (
              <div
                key={docType}
                className="rounded-xl border border-dashed border-[#241012]/15 bg-[#FAF7F5] p-4 text-center"
              >
                <p className="text-xs font-bold text-[#241012]">{docType}</p>
                <label className="mt-3 block cursor-pointer rounded-lg bg-[#7B1113] px-3 py-2 text-xs font-bold text-white hover:bg-[#540111]">
                  {docFiles[docType] ? "Change File" : "Choose File"}
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,.pdf"
                    onChange={(e) => handleDocFileChange(docType, e.target.files?.[0] || null)}
                    className="hidden"
                  />
                </label>
                {docFiles[docType] && (
                  <p className="mt-2 truncate text-[10px] text-green-700">
                    {docFiles[docType]!.name}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[#241012]/[0.06] bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-[#241012]">Academic Records</h2>
          <p className="mt-1 text-[11px] text-[#6B5458]">Academic records are kept on file for verification purposes.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <label className="block text-xs font-semibold text-[#241012]">
              Applicant Type *
              <select
                value={acadApplicantType}
                onChange={(e) => setAcadApplicantType(e.target.value)}
                disabled={acadTypeLocked}
                className="mt-1 w-full rounded-lg border border-[#241012]/15 bg-white px-3 py-2 text-xs outline-none focus:border-[#7B1113] disabled:cursor-not-allowed disabled:bg-[#F3EEEB] disabled:text-[#6B5458]"
              >
                <option value="">Select...</option>
                <option value="Freshman">Freshman</option>
                <option value="Alumni">Alumni</option>
              </select>
              {acadTypeLocked && (
                <span className="mt-0.5 block text-[10px] text-[#7B1113]">Auto-set from your registration.</span>
              )}
            </label>
            <label className="block text-xs font-semibold text-[#241012]">
              {acadApplicantType === "Alumni" ? "College GPA *" : "SHS GWA *"} (1–100)
              <input
                type="number"
                min="1"
                max="100"
                step="0.01"
                value={acadScore}
                onChange={(e) => setAcadScore(e.target.value)}
                placeholder="e.g. 95"
                className="mt-1 w-full rounded-lg border border-[#241012]/15 bg-white px-3 py-2 text-xs outline-none focus:border-[#7B1113]"
              />
            </label>
            <label className="block text-xs font-semibold text-[#241012]">
              Proof File *
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.pdf"
                onChange={(e) => setAcadProofFile(e.target.files?.[0] || null)}
                className="mt-1 w-full rounded-lg border border-dashed border-[#241012]/15 bg-[#FAF7F5] px-3 py-2 text-xs file:mr-3 file:rounded-md file:border-0 file:bg-[#7B1113] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
              />
            </label>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-[#7B1113] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#540111] disabled:opacity-60"
          >
            {submitting ? "Submitting\u2026" : "Submit Application"}
          </button>
        </div>
      </form>

      {showSampleForm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setShowSampleForm(false)}>
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-[#241012]">CHED Application Form — Sample Preview</h2>
                <p className="mt-1 text-xs text-[#8B7376]">All fields marked * are required. This is how your completed form will look.</p>
              </div>
              <button type="button" onClick={() => setShowSampleForm(false)} className="rounded-lg border border-[#241012]/10 px-3 py-1.5 text-xs font-bold text-[#6B5458] hover:bg-[#FAF7F5]">Close</button>
            </div>
            <div className="mt-4 space-y-3 rounded-xl border border-[#241012]/[0.06] bg-[#FAF7F5]/60 p-4 text-xs text-[#241012]">
              <p className="font-bold uppercase tracking-wide text-[#7B1113]">Section 1 — Scholarship Program</p>
              <p>Choose the open scholarship program and note the deadline.</p>
              <p className="mt-3 font-bold uppercase tracking-wide text-[#7B1113]">Section 2 — CHED Application Form</p>
              <ul className="list-inside list-disc space-y-1 text-[#6B5458]">
                <li>Father&apos;s Full Name *</li>
                <li>Mother&apos;s Full Name *</li>
                <li>Street / Barangay *</li>
                <li>Zipcode *</li>
                <li>Contact Number *</li>
                <li>Email Address *</li>
                <li>Disability / IP Group (optional)</li>
                <li>Annual Family Income (PHP) *</li>
                <li>ITR File * — JPG / PNG / PDF, max 10 MB (OCR may auto-detect income)</li>
              </ul>
              <p className="mt-3 font-bold uppercase tracking-wide text-[#7B1113]">Section 3 — Supporting Documents</p>
              <p className="text-[#6B5458]">Upload clear scans of each required document for your program.</p>
              <p className="mt-3 font-bold uppercase tracking-wide text-[#7B1113]">Section 4 — Academic Records</p>
              <ul className="list-inside list-disc space-y-1 text-[#6B5458]">
                <li>Applicant Type * (Freshman / Alumni)</li>
                <li>SHS GWA or College GPA * (1–100)</li>
                <li>Proof File *</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
