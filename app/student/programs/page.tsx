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

export default function BrowseProgramsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [programs, setPrograms] = useState<ScholarshipProgram[]>([]);
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
      <h1 className="text-xl font-bold text-gray-900">Browse Available Programs</h1>

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
          {programs.map((program) => (
            <article
              key={program.scholarship_id}
              className="flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <h3 className="text-sm font-bold text-[#7B1113]">
                {program.scholarship_name}
              </h3>
              <p className="mt-2 line-clamp-3 flex-1 text-xs leading-relaxed text-gray-600">
                {program.description || "No description provided."}
              </p>
              {program.requirements && (
                <p className="mt-2 text-[11px] text-gray-500">
                  <span className="font-semibold">Requirements:</span>{" "}
                  {program.requirements}
                </p>
              )}
              <div className="mt-3 space-y-1 text-[11px] text-gray-500">
                <p>
                  Deadline:{" "}
                  <span className="font-semibold text-gray-900">
                    {formatDate(program.deadline)}
                  </span>
                </p>
              </div>
              <Link
                href={`/student/apply?programId=${program.scholarship_id}`}
                className={`mt-4 inline-block rounded-lg px-4 py-2.5 text-center text-xs font-bold text-white ${
                  hasApprovedApplication
                    ? "cursor-not-allowed bg-gray-400"
                    : "bg-[#7B1113] hover:bg-[#540111]"
                }`}
                onClick={hasApprovedApplication ? (e) => e.preventDefault() : undefined}
              >
                {hasApprovedApplication ? "Applications Closed" : "Apply Now"}
              </Link>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
