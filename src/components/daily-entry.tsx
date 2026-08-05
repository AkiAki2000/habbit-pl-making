import {
  EVALUATION_KEYS,
  EVALUATION_LABELS,
  formatYen,
  type EvaluationKey,
  type Habit,
  type HabitRecord,
} from "@/lib/habit-pl";

export function DailyEntry({
  habits,
  records,
  today,
  onRecord,
}: {
  habits: Habit[];
  records: HabitRecord[];
  today: string;
  onRecord: (habitId: string, evaluation: EvaluationKey) => void;
}) {
  if (habits.length === 0) {
    return (
      <section className="flex flex-col gap-3">
        <p className="text-sm text-gray-500">今日（{today}）の記録</p>
        <p className="rounded-lg border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-400">
          まず科目を登録してください
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <p className="text-sm text-gray-500">今日（{today}）の記録</p>
      <div className="flex flex-col gap-3">
        {habits.map((habit) => {
          const todayRecord = records.find(
            (r) => r.habitId === habit.id && r.date === today,
          );
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
                      todayRecord?.evaluation === key
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
    </section>
  );
}
