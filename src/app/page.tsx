"use client";

import { useEffect, useState } from "react";
import { DailyEntry } from "@/components/daily-entry";
import { HabitSettings } from "@/components/habit-settings";
import { HistoryList } from "@/components/history-list";
import { StatTile } from "@/components/stat-tile";
import {
  type AppState,
  type EvaluationAmounts,
  type EvaluationKey,
  type Habit,
  type HabitRecord,
  generateId,
  loadState,
  saveHabits,
  saveRecords,
  startOfWeek,
  todayString,
} from "@/lib/habit-pl";

export default function Home() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [records, setRecords] = useState<HabitRecord[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Reads localStorage once after mount: rendering the default state first
  // (matching SSR output) avoids a hydration mismatch on the browser-only value.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    const stored: AppState = loadState();
    setHabits(stored.habits);
    setRecords(stored.records);
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (loaded) saveHabits(habits);
  }, [habits, loaded]);

  useEffect(() => {
    if (loaded) saveRecords(records);
  }, [records, loaded]);

  const today = todayString();
  const weekStart = startOfWeek(today);
  const weeklyTotal = records
    .filter((r) => r.date >= weekStart && r.date <= today)
    .reduce((sum, r) => sum + r.amount, 0);
  const cumulativeTotal = records.reduce((sum, r) => sum + r.amount, 0);

  const recordToday = (habitId: string, evaluation: EvaluationKey) => {
    const habit = habits.find((h) => h.id === habitId);
    if (!habit) return;
    setRecords((prev) => {
      const withoutToday = prev.filter(
        (r) => !(r.habitId === habitId && r.date === today),
      );
      return [
        ...withoutToday,
        {
          id: generateId(),
          habitId,
          date: today,
          evaluation,
          amount: habit.amounts[evaluation],
        },
      ];
    });
  };

  const addHabit = (name: string, amounts: EvaluationAmounts) => {
    setHabits((prev) => [...prev, { id: generateId(), name, amounts }]);
  };

  const updateHabit = (
    habitId: string,
    updates: Partial<Pick<Habit, "name" | "amounts">>,
  ) => {
    setHabits((prev) =>
      prev.map((h) => (h.id === habitId ? { ...h, ...updates } : h)),
    );
  };

  const deleteHabit = (habitId: string) => {
    setHabits((prev) => prev.filter((h) => h.id !== habitId));
  };

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 sm:py-12">
      <main className="mx-auto flex w-full max-w-md flex-col gap-6">
        <header>
          <p className="text-sm font-medium text-gray-500">習慣PL</p>
        </header>

        <section className="grid grid-cols-2 gap-3">
          <StatTile
            label="週次損益"
            amount={weeklyTotal}
            sub={`${weekStart} 〜 ${today}`}
          />
          <StatTile label="累計損益" amount={cumulativeTotal} />
        </section>

        <DailyEntry
          habits={habits}
          records={records}
          today={today}
          onRecord={recordToday}
        />

        <HistoryList records={records} habits={habits} />

        <HabitSettings
          habits={habits}
          onAdd={addHabit}
          onUpdate={updateHabit}
          onDelete={deleteHabit}
        />
      </main>
    </div>
  );
}
