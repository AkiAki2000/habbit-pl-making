import { formatYen } from "@/lib/habit-pl";

export function StatTile({
  label,
  amount,
  sub,
}: {
  label: string;
  amount: number;
  sub?: string;
}) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
      <p className="text-sm text-gray-500">{label}</p>
      <p
        className={`mt-1 text-2xl font-bold sm:text-3xl ${
          amount > 0
            ? "text-emerald-600"
            : amount < 0
              ? "text-red-600"
              : "text-gray-700"
        }`}
      >
        {formatYen(amount)}
      </p>
      {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}
