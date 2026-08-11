import { evaluationLabel, formatYen, type Habit, type HabitRecord } from "@/lib/habit-pl";

function amountClass(amount: number): string {
  if (amount > 0) return "text-emerald-600";
  if (amount < 0) return "text-red-600";
  return "text-gray-500";
}

export function HistoryList({
  records,
  habits,
}: {
  records: HabitRecord[];
  habits: Habit[];
}) {
  const habitNames = new Map(habits.map((h) => [h.id, h.name]));

  const dates = Array.from(new Set(records.map((r) => r.date))).sort((a, b) =>
    a < b ? 1 : -1,
  );

  return (
    <section className="flex flex-col gap-3">
      <p className="text-sm text-gray-500">履歴</p>
      {dates.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-400">
          まだ記録がありません
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {dates.map((date) => {
            const dayRecords = records.filter((r) => r.date === date);
            const dayTotal = dayRecords.reduce((sum, r) => sum + r.amount, 0);
            return (
              <div
                key={date}
                className="overflow-hidden rounded-lg border border-gray-200 bg-white"
              >
                <div className="flex items-center justify-between bg-gray-50 px-4 py-2">
                  <span className="text-sm font-medium text-gray-600">
                    {date}
                  </span>
                  <span className={`text-sm font-semibold ${amountClass(dayTotal)}`}>
                    {formatYen(dayTotal)}
                  </span>
                </div>
                <ul className="flex flex-col divide-y divide-gray-100">
                  {dayRecords.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center justify-between px-4 py-2 text-sm"
                    >
                      <span className="text-gray-700">
                        {habitNames.get(r.habitId) ?? "(削除済みの科目)"}
                      </span>
                      <span className="text-gray-500">
                        {evaluationLabel(r.evaluation)}
                      </span>
                      <span className={`font-semibold ${amountClass(r.amount)}`}>
                        {formatYen(r.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
