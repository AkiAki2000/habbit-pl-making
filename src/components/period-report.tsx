"use client";

import { useState } from "react";
import {
  PERIODS,
  PERIOD_LABELS,
  SEGMENTS,
  SEGMENT_LABELS,
  formatYen,
  periodRange,
  todayString,
  type Habit,
  type HabitRecord,
  type PeriodKey,
} from "@/lib/habit-pl";

function amountClass(amount: number): string {
  if (amount > 0) return "text-emerald-600";
  if (amount < 0) return "text-red-600";
  return "text-gray-500";
}

export function PeriodReport({
  habits,
  records,
}: {
  habits: Habit[];
  records: HabitRecord[];
}) {
  const [period, setPeriod] = useState<PeriodKey>("last7");
  const { start, end } = periodRange(period, todayString());
  const periodRecords = records.filter((r) => r.date >= start && r.date <= end);

  return (
    <section className="flex flex-col gap-3">
      <p className="text-sm text-gray-500">期間レポート</p>

      <div className="grid grid-cols-4 gap-2">
        {PERIODS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setPeriod(key)}
            className={`rounded-md border px-1 py-2 text-xs font-medium transition-colors ${
              period === key
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
            }`}
          >
            {PERIOD_LABELS[key]}
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-400">
        {start} 〜 {end}
      </p>

      <div className="flex flex-col gap-3">
        {SEGMENTS.map((segment) => {
          const segmentHabits = habits.filter((h) => h.segment === segment);
          if (segmentHabits.length === 0) return null;

          const segmentHabitIds = new Set(segmentHabits.map((h) => h.id));
          const segmentTotal = periodRecords
            .filter((r) => segmentHabitIds.has(r.habitId))
            .reduce((sum, r) => sum + r.amount, 0);

          return (
            <div
              key={segment}
              className="overflow-hidden rounded-lg border border-gray-200 bg-white"
            >
              <div className="flex items-center justify-between bg-gray-50 px-4 py-2">
                <span className="text-sm font-medium text-gray-700">
                  {SEGMENT_LABELS[segment]}
                </span>
                <span className={`text-sm font-semibold ${amountClass(segmentTotal)}`}>
                  {formatYen(segmentTotal)}
                </span>
              </div>
              <ul className="flex flex-col divide-y divide-gray-100">
                {segmentHabits.map((habit) => {
                  const habitRecords = periodRecords.filter(
                    (r) => r.habitId === habit.id,
                  );
                  const habitTotal = habitRecords.reduce(
                    (sum, r) => sum + r.amount,
                    0,
                  );
                  const achievedCount = habitRecords.filter(
                    (r) => r.evaluation === "achieved",
                  ).length;
                  const rate =
                    habitRecords.length > 0
                      ? Math.round((achievedCount / habitRecords.length) * 100)
                      : null;
                  return (
                    <li
                      key={habit.id}
                      className="flex items-center justify-between gap-2 px-4 py-2 text-sm"
                    >
                      <span className="text-gray-700">{habit.name}</span>
                      <span className="text-xs text-gray-400">
                        {rate === null
                          ? "記録なし"
                          : `達成率 ${rate}%（${achievedCount}/${habitRecords.length}）`}
                      </span>
                      <span className={`font-semibold ${amountClass(habitTotal)}`}>
                        {formatYen(habitTotal)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
