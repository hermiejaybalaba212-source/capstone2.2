"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase/browser";
import { formatDate } from "@/lib/utils";
import { STATUS_STYLES } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";

interface User {
  user_id: number;
  auth_user_id?: string;
  username: string;
  email: string;
  role: string;
  status: string;
  created_at?: string;
}

interface StudentDetail {
  user_id: number;
  student_id: number;
  student_number: string;
  given_name: string;
  last_name: string;
  middle_name?: string;
  ext_name?: string;
  program_name?: string;
  year_level?: string;
  sex?: string;
  registration_status?: string;
}

export default function UserManagementPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [students, setStudents] = useState<StudentDetail[]>([]);
  const [me, setMe] = useState<User | null>(null);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let ignore = false;
    async function startFetching() {
      const sb = getSupabase();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { router.push("/login"); return; }

      const meQ = await sb.from("users").select("*").eq("auth_user_id", session.user.id).maybeSingle();
      if (!meQ.error && meQ.data) setMe(meQ.data);

      const [usersQ, studentsQ] = await Promise.all([
        sb.from("users").select("*").order("created_at", { ascending: false }),
        sb.from("student_accounts").select("user_id, student_id, student_number, given_name, last_name, middle_name, ext_name, program_name, year_level, sex, registration_status"),
      ]);

      if (!usersQ.error) setUsers(usersQ.data || []);
      if (!studentsQ.error) setStudents(studentsQ.data || []);
      if (!ignore) setLoading(false);
    }
    startFetching();
    return () => { ignore = true; };
  }, [router]);

  const getStudent = useCallback((userId: number): StudentDetail | undefined => {
    return students.find((s) => s.user_id === userId);
  }, [students]);

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter((u) => {
      if (u.username.toLowerCase().includes(q)) return true;
      if (u.email.toLowerCase().includes(q)) return true;
      if (u.role.toLowerCase().includes(q)) return true;
      const s = getStudent(u.user_id);
      if (s) {
        if (`${s.given_name} ${s.last_name}`.toLowerCase().includes(q)) return true;
        if (s.student_number?.toLowerCase().includes(q)) return true;
        if (s.program_name?.toLowerCase().includes(q)) return true;
        if (s.year_level?.toLowerCase().includes(q)) return true;
        if (s.sex?.toLowerCase().includes(q)) return true;
      }
      return false;
    });
  }, [users, getStudent, search]);

  async function handleRoleChange(user: User, newRole: string) {
    setMessage("");
    const sb = getSupabase();
    const { error } = await sb.from("users").update({ role: newRole }).eq("user_id", user.user_id);
    if (error) { setMessage(error.message); return; }
    setUsers((prev) => prev.map((u) => u.user_id === user.user_id ? { ...u, role: newRole } : u));
  }

  async function handleToggleStatus(user: User) {
    setMessage("");
    const nextStatus = user.status === "Active" ? "Inactive" : "Active";
    const sb = getSupabase();
    const { error } = await sb.from("users").update({ status: nextStatus }).eq("user_id", user.user_id);
    if (error) { setMessage(error.message); return; }
    setUsers((prev) => prev.map((u) => u.user_id === user.user_id ? { ...u, status: nextStatus } : u));
  }

  function exportCsv() {
    const headers = ["Username", "Email", "Role", "Status", "Created", "Student Number", "Full Name", "Program", "Year Level", "Sex", "Registration Status"];
    const rows = filteredUsers.map((u) => {
      const s = getStudent(u.user_id);
      return [
        u.username,
        u.email,
        u.role,
        u.status,
        formatDate(u.created_at),
        s?.student_number ?? "",
        s ? `${s.last_name}, ${s.given_name}` : "",
        s?.program_name ?? "",
        s?.year_level ?? "",
        s?.sex ?? "",
        s?.registration_status ?? "",
      ];
    });
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `users_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <Spinner label="Loading users..." color="maroon" />;

  const roles = ["Admin", "Faculty", "Student", "CHED"];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-[#241012]">User Management</h1>
        <span className="text-xs text-[#8B7376]">Process 3.0</span>
      </div>

      {message && (
        <div className="rounded-xl border border-[#7B1113]/20 bg-white px-4 py-3 text-xs font-medium text-[#7B1113] shadow-sm">
          {message}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by name, username, email, student number, program, year, sex..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-xs outline-none focus:border-[#7B1113] focus:ring-1 focus:ring-[#7B1113]/20"
          />
        </div>
        <button
          onClick={exportCsv}
          className="flex items-center gap-2 rounded-xl border border-[#7B1113]/20 bg-white px-4 py-2.5 text-xs font-semibold text-[#7B1113] shadow-sm transition hover:bg-[#7B1113] hover:text-white"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Export CSV
        </button>
      </div>

      <div className="text-xs text-[#8B7376]">
        Showing {filteredUsers.length} of {users.length} users
      </div>

      {filteredUsers.length === 0 ? (
        <EmptyState icon="&#128101;" title={search ? "No users match your search" : "No users found"} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Username</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                {filteredUsers.some((u) => u.role === "Student") && (
                  <>
                    <th className="px-4 py-3">Student #</th>
                    <th className="px-4 py-3">Full Name</th>
                    <th className="px-4 py-3">Program</th>
                    <th className="px-4 py-3">Year</th>
                    <th className="px-4 py-3">Sex</th>
                  </>
                )}
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => {
                const isMe = me?.user_id === u.user_id;
                const s = getStudent(u.user_id);
                return (
                  <tr key={u.user_id} className={`border-t border-gray-100 ${u.status === "Inactive" ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3 font-semibold">{u.username}</td>
                    <td className="px-4 py-3 text-[#6B5458]">{u.email}</td>
                    <td className="px-4 py-3">
                      <select
                        value={u.role}
                        onChange={(e) => handleRoleChange(u, e.target.value)}
                        disabled={isMe}
                        className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-[#7B1113] disabled:cursor-not-allowed"
                      >
                        {roles.map((r) => <option key={r}>{r}</option>)}
                      </select>
                      {isMe && <span className="ml-1 text-[10px] text-[#8B7376]">(you)</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={STATUS_STYLES[u.status] || (u.status === "Active" ? "border-green-200 bg-green-50 text-green-700" : "border-gray-200 bg-gray-100 text-gray-600")}>
                        {u.status}
                      </Badge>
                    </td>
                    {filteredUsers.some((usr) => usr.role === "Student") && (
                      <>
                        <td className="px-4 py-3 font-mono text-[11px]">{s?.student_number || "—"}</td>
                        <td className="px-4 py-3">
                          {s ? (
                            <span className="font-medium">{s.last_name}, {s.given_name}{s.ext_name ? ` ${s.ext_name}` : ""}</span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3 text-[#6B5458]">{s?.program_name || "—"}</td>
                        <td className="px-4 py-3 text-[#6B5458]">{s?.year_level || "—"}</td>
                        <td className="px-4 py-3 text-[#6B5458]">{s?.sex || "—"}</td>
                      </>
                    )}
                    <td className="px-4 py-3 text-[#8B7376]">{formatDate(u.created_at)}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggleStatus(u)}
                        disabled={isMe}
                        className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition disabled:cursor-not-allowed ${
                          u.status === "Active"
                            ? "border border-red-200 text-red-600 hover:bg-red-50"
                            : "border border-green-200 text-green-700 hover:bg-green-50"
                        }`}
                      >
                        {u.status === "Active" ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
