"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase/browser";
import { downloadCsv } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
const ML_API = "/api/ml";

interface RankedRow {
  application_id: number;
  student_name: string;
  student_number: string;
  scholarship: string;
  priority_score: number;
  prediction: string;
  income: number | null;
  year_level: string | null;
  sex: string | null;
  hasItr: boolean;
  itrPath: string | null;
}

interface ChedForm {
  application_id: number;
  ched_form_id: number;
  annual_income_family?: number;
  income_tax_return?: string;
  shs_gwa?: number;
  college_gpa?: number;
  year_level?: string;
  sex?: string;
  high_need?: string;
  last_name?: string;
  given_name?: string;
  middle_name?: string;
  ext_name?: string;
  birthdate?: string;
  complete_program_name?: string;
  father_name?: string;
  mother_name?: string;
  street_barangay?: string;
  zipcode?: string;
  disability?: string;
  contact_number?: string;
  email_address?: string;
  indigenous_people_group?: string;
  scholarship_applications?: {
    application_id?: number;
    student_accounts?: {
      given_name?: string; last_name?: string; middle_name?: string; ext_name?: string;
      student_number?: string; student_id?: number; program_name?: string;
      year_level?: string; sex?: string; birthdate?: string;
      users?: { username?: string; email?: string; auth_user_id?: string };
    };
    scholarship_programs?: { scholarship_name?: string };
  };
}

interface TrainResult {
  n_trees: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1_score: number;
  total_samples?: number;
  n_samples?: number;
}

export default function MLRankingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [ranked, setRanked] = useState<RankedRow[]>([]);
  const [rfInfo, setRfInfo] = useState<{ nTrees: number; accuracy: number; precision: number; recall: number; f1: number; samples: number } | null>(null);
  const [message, setMessage] = useState("");
  const [chedForms, setChedForms] = useState<ChedForm[]>([]);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    let ignore = false;
    async function startFetching() {
      let sb: ReturnType<typeof getSupabase>;
      try {
        sb = getSupabase();
      } catch (err: unknown) {
        if (!ignore) {
          setMessage(err instanceof Error ? err.message : "Supabase configuration is missing.");
          setLoading(false);
        }
        return;
      }
      const { data: { session }, error: sessionError } = await sb.auth.getSession();
      if (sessionError) {
        if (!ignore) { setMessage(`Failed to load admin session: ${sessionError.message}`); setLoading(false); }
        return;
      }
      if (!session) { router.push("/login"); return; }

      const [chedQ, pendingQ] = await Promise.all([
        sb.from("ched_form_input")
          .select("ched_form_id, application_id, annual_income_family, income_tax_return, shs_gwa, college_gpa, year_level, sex, high_need")
          .order("ched_form_id", { ascending: false }),
        sb.from("scholarship_applications").select("application_id").eq("application_status", "Pending"),
      ]);

      if (!chedQ.error) setChedForms((chedQ.data || []) as ChedForm[]);
      setPendingCount(pendingQ.data?.length ?? 0);
      const queryErrors = [
        chedQ.error && `CHED forms: ${chedQ.error.message}`,
        pendingQ.error && `pending applications: ${pendingQ.error.message}`,
      ].filter(Boolean);
      if (queryErrors.length) setMessage(`Some ranking data could not be loaded: ${queryErrors.join("; ")}`);
      if (!ignore) setLoading(false);
    }
    startFetching();
    return () => { ignore = true; };
  }, [router]);

  async function viewItr(itrPath: string) {
    const sb = getSupabase();
    const { data, error } = await sb.storage.from("itr-documents").createSignedUrl(itrPath, 3600);
    if (data?.signedUrl) {
      window.open(data.signedUrl, "_blank");
    } else {
      setMessage(error?.message || "Could not open ITR file.");
    }
  }

  async function runRanking() {
    setMessage("");
    setRunning(true);

    const sb = getSupabase();
    const { data: pendingApps, error: appErr } = await sb
      .from("scholarship_applications")
      .select("application_id, student_id, application_data, scholarship_programs(scholarship_name), student_accounts(given_name, last_name, student_number, year_level, sex)")
      .eq("application_status", "Pending");

    if (appErr || !pendingApps?.length) {
      setMessage(appErr?.message || "No pending applications to rank.");
      setRunning(false);
      return;
    }

    const formMap: Record<number, ChedForm> = {};
    chedForms.forEach((c) => { formMap[c.application_id] = c; });

    try {
      const applicants = pendingApps.map((app) => {
        const sa = Array.isArray(app.student_accounts) ? app.student_accounts[0] : app.student_accounts;
        const sp = Array.isArray(app.scholarship_programs) ? app.scholarship_programs[0] : app.scholarship_programs;
        const form = formMap[app.application_id];
        const applicationData = (app.application_data || {}) as { annual_income_family?: number; itr_file?: string };
        const income = form?.annual_income_family ?? applicationData.annual_income_family ?? null;
        const itrPath = form?.income_tax_return ?? applicationData.itr_file ?? null;

        return {
          application_id: app.application_id,
          annual_income_family: income,
          year_level: form?.year_level ?? sa?.year_level ?? null,
          sex: form?.sex ?? sa?.sex ?? null,
          student_name: sa ? `${sa.last_name ?? ""}, ${sa.given_name ?? ""}` : `App #${app.application_id}`,
          student_number: sa?.student_number ?? "",
          scholarship: sp?.scholarship_name ?? "",
          hasItr: !!itrPath,
          itrPath,
        };
      });

      const res = await fetch(`${ML_API}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "synthetic",
          n_samples: 400,
          n_trees: 100,
          seed: 2026,
          applicants,
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error || "Failed to run ML ranking");
      }
      const data = await res.json();
      const trainResult: TrainResult = {
        n_trees: data.train?.n_trees ?? 100,
        accuracy: data.train?.accuracy ?? 0,
        precision: data.train?.precision ?? 0,
        recall: data.train?.recall ?? 0,
        f1_score: data.train?.f1_score ?? 0,
        total_samples: data.train?.total_samples ?? 0,
      };
      const preds = Array.isArray(data.predictions) ? data.predictions : [];
      if (preds.length !== applicants.length) {
        throw new Error("Prediction count did not match the number of applicants.");
      }

      const results: RankedRow[] = applicants.map((app, i) => {
        const pred = preds[i];
        return {
          application_id: app.application_id,
          student_name: app.student_name,
          student_number: app.student_number,
          scholarship: app.scholarship,
          priority_score: pred?.priority_score ?? 0,
          prediction: pred?.prediction ?? "Unknown",
          income: app.annual_income_family,
          year_level: app.year_level,
          sex: app.sex,
          hasItr: app.hasItr,
          itrPath: app.itrPath,
        };
      });

      results.sort((a, b) => b.priority_score - a.priority_score);

      setRanked(results);
      setRfInfo({
        nTrees: trainResult.n_trees,
        accuracy: trainResult.accuracy,
        precision: trainResult.precision,
        recall: trainResult.recall,
        f1: trainResult.f1_score,
        samples: trainResult.total_samples ?? trainResult.n_samples ?? 0,
      });

      const rows = results.map((r, i) => ({
        application_id: r.application_id,
        priority_score: r.priority_score,
        ranking_position: i + 1,
        prediction_result: r.prediction,
        generated_date: new Date().toISOString(),
      }));
      for (const row of rows) {
        await sb.from("ranking_result").delete().eq("application_id", row.application_id);
      }
      const { error: saveErr } = await sb.from("ranking_result").insert(rows);
      setMessage(
        saveErr
          ? `Ranking complete — ${results.length} applicants prioritized, but auto-save to CHED failed: ${saveErr.message}`
          : `Ranking complete — ${results.length} applicants prioritized and sent to CHED automatically. Model accuracy: ${(trainResult.accuracy * 100).toFixed(1)}%`
      );
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Failed to run ranking.");
    }

    setRunning(false);
  }

  function exportChedFormsCsv() {
    if (!chedForms.length) { setMessage("No CHED form data to export."); return; }
    downloadCsv("ched-forms-submitted.csv", chedForms.map((c: ChedForm) => ({
      ched_form_id: c.ched_form_id,
      application_id: c.application_id,
      annual_income_family: c.annual_income_family ?? "",
      shs_gwa: c.shs_gwa ?? "",
      college_gpa: c.college_gpa ?? "",
      year_level: c.year_level ?? "",
      sex: c.sex ?? "",
      high_need: c.high_need ?? "",
      income_tax_return: c.income_tax_return ? "Yes" : "No",
      student_name: `${c.scholarship_applications?.student_accounts?.last_name ?? ""}, ${c.scholarship_applications?.student_accounts?.given_name ?? ""}`,
      student_number: c.scholarship_applications?.student_accounts?.student_number ?? "",
      scholarship: c.scholarship_applications?.scholarship_programs?.scholarship_name ?? "",
    })));
    setMessage(`Exported ${chedForms.length} CHED form submissions.`);
  }

  /** Preprocess + transform ranked applicants into an ML-ready CSV with no missing values. */
  function exportPreprocessedCsv() {
    if (!ranked.length) return;
    const incomes = ranked.map((r) => r.income).filter((v): v is number => v != null);
    const fallbackIncome = incomes.length
      ? Math.round(incomes.reduce((a, b) => a + b, 0) / incomes.length)
      : 150000;
    const gwas = chedForms.map((c) => Number(c.shs_gwa)).filter((v) => !isNaN(v));
    const gpas = chedForms.map((c) => Number(c.college_gpa)).filter((v) => !isNaN(v));
    const fallbackGwa = gwas.length ? gwas.reduce((a, b) => a + b, 0) / gwas.length : 0;
    const fallbackGpa = gpas.length ? gpas.reduce((a, b) => a + b, 0) / gpas.length : 0;
    const yearCode = (y: string | null | undefined) => {
      const m = /(\d+)/.exec(y || "");
      if (!m) return 0;
      const n = parseInt(m[1], 10);
      return n >= 1 && n <= 5 ? n : 0;
    };
    downloadCsv("ml-training-dataset-preprocessed.csv", ranked.map((r, i) => {
      const form = chedForms.find((c) => c.application_id === r.application_id);
      const income = r.income ?? fallbackIncome;
      const gwa = form && form.shs_gwa != null ? Number(form.shs_gwa) : NaN;
      const gpa = form && form.college_gpa != null ? Number(form.college_gpa) : NaN;
      return {
        position: i + 1,
        application_id: r.application_id,
        student_name: r.student_name || "Unknown",
        student_number: r.student_number || "N/A",
        scholarship: r.scholarship || "N/A",
        annual_income_family: income,
        shs_gwa_filled: isNaN(gwa) ? Math.round(fallbackGwa * 100) / 100 : gwa,
        college_gpa_filled: isNaN(gpa) ? Math.round(fallbackGpa * 100) / 100 : gpa,
        sex_binary: r.sex === "Male" ? 0 : r.sex === "Female" ? 1 : 0,
        year_level_numeric: yearCode(r.year_level),
        income_tax_return_binary: r.hasItr ? 1 : 0,
        high_need_binary: income < 150000 ? 1 : 0,
        priority_score: r.priority_score,
        prediction: r.prediction,
      };
    }));
    setMessage(`Exported preprocessed ML training CSV (${ranked.length} rows) — missing values filled, categorical fields encoded as binary/numeric.`);
  }

  if (loading) return <Spinner label="Loading ranking data..." color="maroon" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#241012]">ML Ranking</h1>
          <p className="mt-1 text-xs text-[#8B7376]">Prioritize pending applicants based on their annual family income automatically.</p>
        </div>
      </div>

      {message && (
        <div className="rounded-xl border border-[#7B1113]/20 bg-white px-4 py-3 text-xs font-medium text-[#7B1113] shadow-sm">
          {message}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={runRanking}
          disabled={running || !pendingCount}
          className="rounded-lg bg-[#7B1113] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#540111] disabled:opacity-50"
        >
          {running ? "Running..." : `Run ML Ranking (${pendingCount} pending)`}
        </button>
        <button
          onClick={exportPreprocessedCsv}
          disabled={!ranked.length}
          className="rounded-lg bg-gradient-to-r from-[#7B1113] to-[#540111] px-4 py-2 text-xs font-bold text-white shadow-md hover:brightness-110 disabled:opacity-50"
          title="Fills missing values and encodes categorical fields as binary/numeric"
        >
          Export ML Training CSV (Preprocessed)
        </button>
        <button
          onClick={exportChedFormsCsv}
          disabled={!chedForms.length}
          className="rounded-lg border border-[#7B1113]/30 px-4 py-2 text-xs font-bold text-[#7B1113] hover:bg-[#7B1113]/5 disabled:opacity-50"
        >
          Export CHED Forms CSV
        </button>
      </div>

      {rfInfo && ranked.length > 0 && (
        <p className="text-[11px] font-semibold text-[#7B1113]">
          Random Forest — {rfInfo.nTrees} trees &middot; {rfInfo.samples} training samples &middot;
          Accuracy {(rfInfo.accuracy * 100).toFixed(1)}% &middot;
          Precision {(rfInfo.precision * 100).toFixed(1)}% &middot;
          Recall {(rfInfo.recall * 100).toFixed(1)}% &middot;
          F1 {(rfInfo.f1 * 100).toFixed(1)}%
        </p>
      )}

      {ranked.length === 0 ? (
        <EmptyState icon="&#129302;" title="No ranking generated yet" hint="Click Run ML Ranking to prioritize pending applicants." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#241012]/[0.06] bg-white shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#FAF7F5] text-[10px] uppercase tracking-wide text-[#6B5458]">
              <tr>
                <th className="px-4 py-3">Rank</th>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Student #</th>
                <th className="px-4 py-3">Scholarship</th>
                <th className="px-4 py-3">Annual Income</th>
                <th className="px-4 py-3">Year</th>
                <th className="px-4 py-3">Sex</th>
                <th className="px-4 py-3">ITR</th>
                <th className="px-4 py-3">Priority Score</th>
                <th className="px-4 py-3">Prediction</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r, i) => (
                <tr key={r.application_id} className="border-t border-[#241012]/[0.06]">
                  <td className="px-4 py-3 font-bold text-[#7B1113]">#{i + 1}</td>
                  <td className="px-4 py-3 font-semibold">{r.student_name}</td>
                  <td className="px-4 py-3 text-[#6B5458]">{r.student_number}</td>
                  <td className="px-4 py-3 text-[#6B5458]">{r.scholarship}</td>
                  <td className="px-4 py-3 font-semibold">
                    {r.income != null ? `\u20B1${Number(r.income).toLocaleString()}` : "\u2014"}
                  </td>
                  <td className="px-4 py-3 text-[#6B5458]">{r.year_level || "\u2014"}</td>
                  <td className="px-4 py-3 text-[#6B5458]">{r.sex || "\u2014"}</td>
                  <td className="px-4 py-3">
                    {r.hasItr && r.itrPath ? (
                      <button
                        onClick={() => viewItr(r.itrPath!)}
                        className="font-semibold text-[#7B1113] hover:underline"
                      >
                        Uploaded / View ITR
                      </button>
                    ) : (
                      <span className="text-[#8B7376]">None</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-semibold">{r.priority_score}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${r.prediction === "High Need" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                      }`}>
                      {r.prediction}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
