"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase/browser";
import { formatDate, validateFile } from "@/lib/utils";
import { DOC_TYPES } from "@/lib/constants";
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
  const [docFiles, setDocFiles] = useState<Record<string, File | null>>({});
  const [acadApplicantType, setAcadApplicantType] = useState("");
  const [acadScore, setAcadScore] = useState("");
  const [acadProofFile, setAcadProofFile] = useState<File | null>(null);
  const [acadTypeLocked, setAcadTypeLocked] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("error");

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

      if (acct.registration_status !== "Verified") {
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

  function handleFormChange(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
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
      return "Contact number must be a valid PH mobile number: 09XXXXXXXXX (exactly 11 digits).";
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

    for (const docType of DOC_TYPES) {
      const file = docFiles[docType];
      if (file) {
        const err = validateFile(file);
        if (err) {
          setMessage(`${docType}: ${err}`);
          setMessageType("error");
          return;
        }
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
        zipcode: form.zipcode.trim(),
        disability: form.disability.trim() || null,
        indigenous_people_group: form.ipGroup.trim() || null,
        contact_number: form.contactNumber.trim(),
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

      for (const docType of DOC_TYPES) {
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

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900">Submit Application</h1>

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
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-gray-700">Scholarship Program</h2>
          <select
            value={selectedProgramId || ""}
            onChange={(e) => setSelectedProgramId(Number(e.target.value) || null)}
            required
            className="mt-3 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs outline-none focus:border-[#7B1113]"
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

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-gray-700">CHED Application Form</h2>
          <p className="mt-1 text-[11px] text-gray-500">All fields marked with * are required.</p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-gray-900">
              Father&apos;s Full Name *
              <input
                value={form.fatherName}
                onChange={(e) => handleFormChange("fatherName", e.target.value)}
                placeholder="Juan D. Dela Cruz"
                required
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs outline-none focus:border-[#7B1113]"
              />
            </label>
            <label className="block text-xs font-semibold text-gray-900">
              Mother&apos;s Full Name *
              <input
                value={form.motherName}
                onChange={(e) => handleFormChange("motherName", e.target.value)}
                placeholder="Maria D. Dela Cruz"
                required
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs outline-none focus:border-[#7B1113]"
              />
            </label>
            <label className="block text-xs font-semibold text-gray-900">
              Street / Barangay *
              <input
                value={form.streetBarangay}
                onChange={(e) => handleFormChange("streetBarangay", e.target.value)}
                placeholder="e.g. Purok 6, Tibanga"
                required
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs outline-none focus:border-[#7B1113]"
              />
            </label>
            <label className="block text-xs font-semibold text-gray-900">
              Zipcode *
              <input
                value={form.zipcode}
                onChange={(e) => handleFormChange("zipcode", e.target.value)}
                placeholder="9200"
                required
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs outline-none focus:border-[#7B1113]"
              />
            </label>
            <label className="block text-xs font-semibold text-gray-900">
              Contact Number *
              <input
                value={form.contactNumber}
                onChange={(e) => handleFormChange("contactNumber", e.target.value)}
                placeholder="09XXXXXXXXX"
                required
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs outline-none focus:border-[#7B1113]"
              />
            </label>
            <label className="block text-xs font-semibold text-gray-900">
              Email Address *
              <input
                type="email"
                value={form.email}
                onChange={(e) => handleFormChange("email", e.target.value)}
                placeholder="you@email.com"
                required
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs outline-none focus:border-[#7B1113]"
              />
            </label>
            <label className="block text-xs font-semibold text-gray-900">
              Disability (optional)
              <input
                value={form.disability}
                onChange={(e) => handleFormChange("disability", e.target.value)}
                placeholder=""
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs outline-none focus:border-[#7B1113]"
              />
            </label>
            <label className="block text-xs font-semibold text-gray-900">
              Indigenous People Group (optional)
              <input
                value={form.ipGroup}
                onChange={(e) => handleFormChange("ipGroup", e.target.value)}
                placeholder=""
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs outline-none focus:border-[#7B1113]"
              />
            </label>
            <label className="block text-xs font-semibold text-gray-900">
              Annual Family Income (PHP) *
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.annualIncome}
                onChange={(e) => handleFormChange("annualIncome", e.target.value)}
                placeholder="150000"
                required
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs outline-none focus:border-[#7B1113]"
              />
            </label>
            <label className="block text-xs font-semibold text-gray-900 sm:col-span-2">
              Income Tax Return (ITR) File * — JPG / PNG / PDF, max 10 MB
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.pdf"
                onChange={(e) => setItrFile(e.target.files?.[0] || null)}
                required
                className="mt-1 w-full rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-xs file:mr-3 file:rounded-md file:border-0 file:bg-[#7B1113] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
              />
            </label>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-gray-700">Supporting Documents</h2>
          <p className="mt-1 text-[11px] text-gray-500">
            Upload clear scans of each requirement (JPG, PNG, or PDF, max 10 MB).
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {DOC_TYPES.map((docType) => (
              <div
                key={docType}
                className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-center"
              >
                <p className="text-xs font-bold text-gray-900">{docType}</p>
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

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-gray-700">Academic Records</h2>
          <p className="mt-1 text-[11px] text-gray-500">All fields are required to compute your GWA for ranking.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <label className="block text-xs font-semibold text-gray-900">
              Applicant Type *
              <select
                value={acadApplicantType}
                onChange={(e) => setAcadApplicantType(e.target.value)}
                disabled={acadTypeLocked}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs outline-none focus:border-[#7B1113] disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
              >
                <option value="">Select...</option>
                <option value="Freshman">Freshman</option>
                <option value="Alumni">Alumni</option>
              </select>
              {acadTypeLocked && (
                <span className="mt-0.5 block text-[10px] text-[#7B1113]">Auto-set from your registration.</span>
              )}
            </label>
            <label className="block text-xs font-semibold text-gray-900">
              {acadApplicantType === "Alumni" ? "College GPA *" : "SHS GWA *"} (1–100)
              <input
                type="number"
                min="1"
                max="100"
                step="0.01"
                value={acadScore}
                onChange={(e) => setAcadScore(e.target.value)}
                placeholder="e.g. 95"
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs outline-none focus:border-[#7B1113]"
              />
            </label>
            <label className="block text-xs font-semibold text-gray-900">
              Proof File *
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.pdf"
                onChange={(e) => setAcadProofFile(e.target.files?.[0] || null)}
                className="mt-1 w-full rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-xs file:mr-3 file:rounded-md file:border-0 file:bg-[#7B1113] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
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
    </div>
  );
}
