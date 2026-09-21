"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase/browser";
import { formatDate } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";

interface ScholarshipProgram {
  scholarship_id: number;
  scholarship_name: string;
  description?: string;
  requirements?: string;
  deadline?: string;
  status?: string;
}

interface StudentApplication {
  scholarship_id: number;
  application_status: string;
}

function parseRequirements(value?: string | null): string[] {
  if (!value) return [];
  return value
    .split("|")
    .map((r) => r.trim())
    .filter(Boolean);
}

export default function BrowseProgramsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [programs, setPrograms] = useState<ScholarshipProgram[]>([]);
  const [applications, setApplications] = useState<StudentApplication[]>([]);
  const [hasApprovedApplication, setHasApprovedApplication] = useState(false);

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
      const uid = authUser.user?.id;
      if (uid) {
        const userQ = await sb.from("users").select("user_id").eq("auth_user_id", uid).maybeSingle();
        if (userQ.data) {
          const studentQ = await sb.from("student_accounts").select("student_id").eq("user_id", userQ.data.user_id).maybeSingle();
          if (studentQ.data) {
            const approvedQ = await sb.from("scholarship_applications").select("application_id").eq("student_id", studentQ.data.student_id).eq("application_status", "Approved").maybeSingle();
            if (approvedQ.data) setHasApprovedApplication(true);
            const appsQ = await sb
              .from("scholarship_applications")
              .select("scholarship_id, application_status")
              .eq("student_id", studentQ.data.student_id);
            if (!appsQ.error) setApplications(appsQ.data || []);
          }
        }
      }

      const { data, error } = await sb
        .from("scholarship_programs")
        .select("*")
        .eq("status", "Open")
        .order("created_at", { ascending: false });

      if (!error && data) {
        setPrograms(data);
      }

      if (!ignore) setLoading(false);
    }
    startFetching();
    return () => { ignore = true; };
  }, [router]);

  if (loading) {
    return <Spinner label="Loading programs..." />;
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-[#241012]">Browse Available Programs</h1>
      <p className="mt-1 text-xs text-[#6B5458]">Check the open scholarships below and apply to the one that fits you.</p>

      {hasApprovedApplication && (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800 shadow-sm">
          You already have an approved scholarship application. Applications are closed for you.
        </div>
      )}

      {programs.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon="🎓"
            title="No open scholarships right now"
            hint="Check back later — new programs appear here automatically."
          />
        </div>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {programs.map((program) => {
            const applied = applications.find((a) => a.scholarship_id === program.scholarship_id);
            const isLocked = hasApprovedApplication || !!applied;
            return (
              <article
                key={program.scholarship_id}
                className="flex flex-col rounded-xl border border-[#241012]/[0.06] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <h3 className="text-sm font-bold text-[#7B1113]">
                  {program.scholarship_name}
                </h3>
                <p className="mt-2 line-clamp-3 flex-1 text-xs leading-relaxed text-[#6B5458]">
                  {program.description || "No description provided."}
                </p>
                {applied && (
                  <p className="mt-2 inline-flex self-start items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-[10px] font-bold text-green-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-600" />
                    Already applied for this scholarship
                  </p>
                )}
                {program.requirements && parseRequirements(program.requirements).length > 0 && (
                  <div className="mt-2">
                    <p className="text-[11px] font-semibold text-[#241012]">Requirements:</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {parseRequirements(program.requirements).map((r) => (
                        <span key={r} className="rounded-full bg-[#7B1113]/5 px-2 py-0.5 text-[10px] font-semibold text-[#7B1113]">{r}</span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="mt-3 space-y-1 text-[11px] text-[#6B5458]">
                  <p>
                    Deadline:{" "}
                    <span className="font-semibold text-[#241012]">
                      {formatDate(program.deadline)}
                    </span>
                  </p>
                  {applied && (
                    <p>
                      Application status:{" "}
                      <span className="font-semibold text-[#7B1113]">
                        {applied.application_status}
                      </span>
                    </p>
                  )}
                </div>
                <Link
                  href={`/student/apply?programId=${program.scholarship_id}`}
                  className={`mt-4 inline-block rounded-lg px-4 py-2.5 text-center text-xs font-bold text-white ${
                    isLocked
                      ? "cursor-not-allowed bg-gray-400"
                      : "bg-[#7B1113] hover:bg-[#540111]"
                  }`}
                  onClick={isLocked ? (e) => e.preventDefault() : undefined}
                >
                  {applied ? "Already Applied" : hasApprovedApplication ? "Applications Closed" : "Apply Now"}
                </Link>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
