export function formatDate(value?: string | null) {
  if (!value) return "\u2014";
  return new Date(value).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(value?: string | null) {
  if (!value) return "\u2014";
  return new Date(value).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function validateFile(file: File | null): string | null {
  if (!file) return "Please choose a file.";
  const okTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
  if (!okTypes.includes(file.type)) return "Only JPG, PNG, WEBP or PDF files are allowed.";
  if (file.size > 10 * 1024 * 1024) return "File must be 10 MB or smaller.";
  return null;
}
