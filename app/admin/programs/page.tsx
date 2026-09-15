"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase/browser";
import { formatDate } from "@/lib/utils";
import { STATUS_STYLES } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";

interface ScholarshipProgram {
  scholarship_id: number;
  scholarship_name: string;
  description?: string;
  requirements?: string;
  deadline?: string;
  status: "Open" | "Closed";
  created_by?: number;
  created_at?: string;
}

const emptyForm = { scholarship_name: "", description: "", requirements: "", deadline: "", status: "Open" as "Open" | "Closed" };

export default function ManageProgramsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [programs, setPrograms] = useState<ScholarshipProgram[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let ignore = false;
    async function startFetching() {
      const sb = getSupabase();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { router.push("/login"); return; }

      const { data, error } = await sb.from("scholarship_programs").select("*").order("created_at", { ascending: false });
      if (!error) setPrograms(data || []);
      if (!ignore) setLoading(false);
    }
    startFetching();
    return () => { ignore = true; };
  }, [router]);

  function openNew() {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(true);
  }

  function openEdit(p: ScholarshipProgram) {
    setEditingId(p.scholarship_id);
    setForm({
      scholarship_name: p.scholarship_name || "",
      description: p.description || "",
      requirements: p.requirements || "",
      deadline: p.deadline || "",
      status: p.status || "Open",
    });
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    const sb = getSupabase();

    const payload = {
      scholarship_name: form.scholarship_name.trim(),
      description: form.description.trim() || null,
      requirements: form.requirements.trim() || null,
      deadline: form.deadline || null,
      status: form.status,
    };

    const res = editingId
      ? await sb.from("scholarship_programs").update(payload).eq("scholarship_id", editingId)
      : await sb.from("scholarship_programs").insert(payload);

    setSaving(false);

    if (res.error) {
      setMessage(res.error.message);
      return;
    }

    setShowModal(false);
    const { data } = await sb.from("scholarship_programs").select("*").order("created_at", { ascending: false });
    if (data) setPrograms(data);
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this program?")) return;
    const sb = getSupabase();
    const { error } = await sb.from("scholarship_programs").delete().eq("scholarship_id", id);
    if (!error) setPrograms((prev) => prev.filter((p) => p.scholarship_id !== id));
  }

  if (loading) return <Spinner label="Loading programs..." color="maroon" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-[#241012]">Manage Scholarship Programs</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[#8B7376]">Process 4.0</span>
          <button onClick={openNew} className="rounded-lg bg-[#7B1113] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#540111]">
            + Create New
          </button>
        </div>
      </div>

      {message && (
        <div className="rounded-xl border border-[#7B1113]/20 bg-white px-4 py-3 text-xs font-medium text-[#7B1113] shadow-sm">
          {message}
        </div>
      )}

      {programs.length === 0 ? (
        <EmptyState icon="&#128218;" title="No programs yet" hint="Create your first scholarship program." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {programs.map((p) => (
            <article key={p.scholarship_id} className="flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-bold text-[#7B1113]">{p.scholarship_name}</h3>
                <Badge className={STATUS_STYLES[p.status] || ""}>{p.status}</Badge>
              </div>
              <p className="mt-2 line-clamp-2 flex-1 text-xs text-[#6B5458]">{p.description || "No description."}</p>
              {p.requirements && (
                <p className="mt-2 text-[11px] text-[#8B7376]">Requirements: {p.requirements}</p>
              )}
              <p className="mt-2 text-[11px] text-[#8B7376]">
                Deadline: <span className="font-semibold text-[#241012]">{formatDate(p.deadline)}</span>
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => openEdit(p)}
                  className="flex-1 rounded-lg border border-[#7B1113]/30 px-3 py-1.5 text-[11px] font-bold text-[#7B1113] hover:bg-[#7B1113]/5"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(p.scholarship_id)}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-[11px] font-bold text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="mb-4 text-sm font-bold text-[#241012]">
              {editingId ? "Edit Program" : "Create New Program"}
            </h2>
            <form onSubmit={handleSave} className="space-y-4">
              <label className="block text-xs font-semibold text-[#241012]">
                Scholarship Name
                <input
                  type="text"
                  value={form.scholarship_name}
                  onChange={(e) => setForm({ ...form, scholarship_name: e.target.value })}
                  required
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-xs outline-none focus:border-[#7B1113]"
                />
              </label>
              <label className="block text-xs font-semibold text-[#241012]">
                Description
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-xs outline-none focus:border-[#7B1113]"
                />
              </label>
              <label className="block text-xs font-semibold text-[#241012]">
                Requirements
                <textarea
                  value={form.requirements}
                  onChange={(e) => setForm({ ...form, requirements: e.target.value })}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-xs outline-none focus:border-[#7B1113]"
                />
              </label>
              <label className="block text-xs font-semibold text-[#241012]">
                Deadline
                <input
                  type="date"
                  value={form.deadline}
                  onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-xs outline-none focus:border-[#7B1113]"
                />
              </label>
              <label className="block text-xs font-semibold text-[#241012]">
                Status
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as "Open" | "Closed" })}
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-xs outline-none focus:border-[#7B1113]"
                >
                  <option value="Open">Open</option>
                  <option value="Closed">Closed</option>
                </select>
              </label>
              <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-bold text-[#6B5458] hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-[#7B1113] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#540111] disabled:opacity-50"
                >
                  {saving ? "Saving..." : editingId ? "Update" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
