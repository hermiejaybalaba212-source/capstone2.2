interface StatCardProps { label: string; value: number | string; icon?: string; tone?: string; }
const TONE_CLASSES: Record<string, string> = {
  maroon: "text-[#7B1113]",
  blue: "text-blue-600",
  green: "text-green-600",
  red: "text-red-600",
  amber: "text-amber-600",
};
export function StatCard({ label, value, icon, tone }: StatCardProps) {
  const valueClass = TONE_CLASSES[tone || ""] || "text-gray-900";
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
        {icon && <span className="text-lg">{icon}</span>}
      </div>
      <p className={`mt-2 text-2xl font-bold ${valueClass}`}>{value}</p>
    </div>
  );
}
