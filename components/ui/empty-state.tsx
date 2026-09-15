interface EmptyStateProps { icon: string; title: string; hint?: string; }
export function EmptyState({ icon, title, hint }: EmptyStateProps) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-6 py-10 text-center">
      <div className="text-3xl">{icon}</div>
      <p className="mt-2 text-sm font-semibold text-gray-900">{title}</p>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}
