"use client";

import { useEffect, useState } from "react";

type EvaluationKey = "achieved" | "notAchieved" | "bigMiss";

interface EvaluationOption {
  key: EvaluationKey;
  label: string;
  amount: number;
}

const EVALUATIONS: EvaluationOption[] = [
  { key: "achieved", label: "達成", amount: 100 },
  { key: "notAchieved", label: "未達", amount: 0 },
  { key: "bigMiss", label: "大きく未達", amount: -100 },
];

interface HabitRecord {
  date: string; // YYYY-MM-DD
  evaluation: EvaluationKey;
  amount: number;
}

const HABIT_NAME_KEY = "habit-pl:habit-name";
const RECORDS_KEY = "habit-pl:records";
const DEFAULT_HABIT_NAME = "睡眠";

function todayString(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatYen(amount: number): string {
  const sign = amount > 0 ? "+" : "";
  return `${sign}${amount.toLocaleString("ja-JP")}円`;
}

interface StoredState {
  habitName: string;
  records: HabitRecord[];
}

function readStoredState(): StoredState {
  const storedName = window.localStorage.getItem(HABIT_NAME_KEY);
  const storedRecords = window.localStorage.getItem(RECORDS_KEY);
  let records: HabitRecord[] = [];
  if (storedRecords) {
    try {
      records = JSON.parse(storedRecords) as HabitRecord[];
    } catch {
      records = [];
    }
  }
  return { habitName: storedName ?? DEFAULT_HABIT_NAME, records };
}

export default function Home() {
  const [habitName, setHabitName] = useState(DEFAULT_HABIT_NAME);
  const [records, setRecords] = useState<HabitRecord[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Reads localStorage once after mount: rendering the default state first
  // (matching SSR output) avoids a hydration mismatch on the browser-only value.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    const stored = readStoredState();
    setHabitName(stored.habitName);
    setRecords(stored.records);
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (loaded) {
      window.localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
    }
  }, [records, loaded]);

  useEffect(() => {
    if (loaded) {
      window.localStorage.setItem(HABIT_NAME_KEY, habitName);
    }
  }, [habitName, loaded]);

  const total = records.reduce((sum, r) => sum + r.amount, 0);

  const recordToday = (option: EvaluationOption) => {
    const date = todayString();
    setRecords((prev) => {
      const withoutToday = prev.filter((r) => r.date !== date);
      const next: HabitRecord[] = [
        ...withoutToday,
        { date, evaluation: option.key, amount: option.amount },
      ];
      next.sort((a, b) => (a.date < b.date ? 1 : -1));
      return next;
    });
  };

  const today = todayString();
  const todayRecord = records.find((r) => r.date === today);

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 sm:py-12">
      <main className="mx-auto flex w-full max-w-md flex-col gap-6">
        <header className="flex flex-col gap-2">
          <p className="text-sm font-medium text-gray-500">習慣PL</p>
          <input
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-lg font-semibold text-gray-900 focus:border-gray-500 focus:outline-none"
            value={habitName}
            onChange={(e) => setHabitName(e.target.value)}
            aria-label="習慣科目名"
          />
        </header>

        <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
          <p className="text-sm text-gray-500">直近の合計損益</p>
          <p
            className={`mt-1 text-3xl font-bold ${
              total > 0
                ? "text-emerald-600"
                : total < 0
                  ? "text-red-600"
                  : "text-gray-700"
            }`}
          >
            {formatYen(total)}
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <p className="text-sm text-gray-500">
            今日（{today}）の記録
            {todayRecord && (
              <span className="ml-2 text-gray-400">
                ・記録済み:{" "}
                {EVALUATIONS.find((e) => e.key === todayRecord.evaluation)?.label}
              </span>
            )}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {EVALUATIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => recordToday(option)}
                className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-3 text-sm font-medium transition-colors ${
                  todayRecord?.evaluation === option.key
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
                }`}
              >
                <span>{option.label}</span>
                <span className="text-xs opacity-70">
                  {formatYen(option.amount)}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <p className="text-sm text-gray-500">履歴</p>
          {records.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-400">
              まだ記録がありません
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200 bg-white">
              {records.map((r) => {
                const option = EVALUATIONS.find((e) => e.key === r.evaluation)!;
                return (
                  <li
                    key={r.date}
                    className="flex items-center justify-between px-4 py-3 text-sm"
                  >
                    <span className="text-gray-500">{r.date}</span>
                    <span className="text-gray-700">{option.label}</span>
                    <span
                      className={`font-semibold ${
                        r.amount > 0
                          ? "text-emerald-600"
                          : r.amount < 0
                            ? "text-red-600"
                            : "text-gray-500"
                      }`}
                    >
                      {formatYen(r.amount)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
