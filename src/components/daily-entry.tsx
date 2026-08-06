import {
  EVALUATION_KEYS,
  EVALUATION_LABELS,
  evaluationLabel,
  formatYen,
  type EvaluationKey,
  type Habit,
  type HabitRecord,
} from "@/lib/habit-pl";

function amountClass(amount: number): string {
  if (amount > 0) return "text-emerald-600";
  if (amount < 0) return "text-red-600";
  return "text-gray-500";
}

export function DailyEntry({
  habits,
  records,
  targetDate,
  isToday,
  backlogCount,
  isConfirmed,
  onRecord,
  onConfirm,
  onUnconfirm,
}: {
  habits: Habit[];
  records: HabitRecord[];
  targetDate: string;
  isToday: boolean;
  backlogCount: number;
  isConfirmed: boolean;
  onRecord: (habitId: string, evaluation: EvaluationKey) => void;
  onConfirm: () => void;
  onUnconfirm: () => void;
}) {
  const heading = isToday ? `今日（${targetDate}）の記録` : `${targetDate}の記録`;

  if (habits.length === 0) {
    return (
      <section className="flex flex-col gap-3">
        <p className="text-sm text-gray-500">{heading}</p>
        <p className="rounded-lg border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-400">
          まず科目を登録してください
        </p>
      </section>
    );
  }

  const recordFor = (habitId: string) =>
    records.find((r) => r.habitId === habitId && r.date === targetDate);
  const recordedCount = habits.filter((h) => recordFor(h.id)).length;

  const backlogBanner = !isToday && (
    <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
      未確定の日が{backlogCount}日あります。古い日から順に表示しています。
    </p>
  );

  if (isConfirmed) {
    return (
      <section className="flex flex-col gap-3">
        {backlogBanner}
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">{heading}</p>
          <button
            type="button"
            onClick={onUnconfirm}
            className="text-xs text-gray-400 underline hover:text-gray-600"
          >
            編集し直す
          </button>
        </div>
        <div className="flex flex-col divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <p className="px-4 py-2 text-xs font-medium text-emerald-700">
            確定済み
          </p>
          {habits.map((habit) => {
            const record = recordFor(habit.id);
            return (
              <div
                key={habit.id}
                className="flex items-center justify-between px-4 py-2 text-sm"
              >
                <span className="text-gray-700">{habit.name}</span>
                <span className="text-xs text-gray-400">
                  {record ? evaluationLabel(record.evaluation) : "未記録"}
                </span>
                <span
                  className={`font-semibold ${record ? amountClass(record.amount) : "text-gray-400"}`}
                >
                  {record ? formatYen(record.amount) : "-"}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      {backlogBanner}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{heading}</p>
        <p className="text-xs text-gray-400">
          {recordedCount}/{habits.length} 記録済み
        </p>
      </div>
      <div className="flex flex-col gap-3">
        {habits.map((habit) => {
          const targetRecord = recordFor(habit.id);
          return (
            <div
              key={habit.id}
              className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3"
            >
              <p className="text-sm font-medium text-gray-800">{habit.name}</p>
              <div className="grid grid-cols-3 gap-2">
                {EVALUATION_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onRecord(habit.id, key)}
                    className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-sm font-medium transition-colors ${
                      targetRecord?.evaluation === key
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    <span>{EVALUATION_LABELS[key]}</span>
                    <span className="text-xs opacity-70">
                      {formatYen(habit.amounts[key])}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onConfirm}
        className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white"
      >
        {isToday ? "本日を確定する" : "この日を確定する"}
      </button>
    </section>
  );
}
