"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DailyEntry } from "@/components/daily-entry";
import { HabitSettings } from "@/components/habit-settings";
import { HistoryList } from "@/components/history-list";
import { PeriodReport } from "@/components/period-report";
import { StatTile } from "@/components/stat-tile";
import {
  DEFAULT_SEGMENTS,
  type AppState,
  type EvaluationAmounts,
  type EvaluationKey,
  type Habit,
  type HabitRecord,
  type Segment,
  generateId,
  getEntryQueue,
  loadState,
  saveConfirmedDates,
  saveHabits,
  saveRecords,
  saveSegments,
  startOfWeek,
  todayString,
} from "@/lib/habit-pl";

export default function Home() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [records, setRecords] = useState<HabitRecord[]>([]);
  const [confirmedDates, setConfirmedDates] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(todayString());
  const [segments, setSegments] = useState<Segment[]>(DEFAULT_SEGMENTS);
  const [loaded, setLoaded] = useState(false);

  // Reads localStorage once after mount: rendering the default state first
  // (matching SSR output) avoids a hydration mismatch on the browser-only value.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    const stored: AppState = loadState();
    setHabits(stored.habits);
    setRecords(stored.records);
    setConfirmedDates(stored.confirmedDates);
    setStartDate(stored.startDate);
    setSegments(stored.segments);
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (loaded) saveHabits(habits);
  }, [habits, loaded]);

  useEffect(() => {
    if (loaded) saveRecords(records);
  }, [records, loaded]);

  useEffect(() => {
    if (loaded) saveConfirmedDates(confirmedDates);
  }, [confirmedDates, loaded]);

  useEffect(() => {
    if (loaded) saveSegments(segments);
  }, [segments, loaded]);

  const today = todayString();
  const weekStart = startOfWeek(today);
  const weeklyTotal = records
    .filter((r) => r.date >= weekStart && r.date <= today)
    .reduce((sum, r) => sum + r.amount, 0);
  const cumulativeTotal = records.reduce((sum, r) => sum + r.amount, 0);

  // You can never get ahead and record a future day, but if a few days were
  // missed, this keeps the entry UI on the oldest unconfirmed day (even if
  // that's in the past) so they get caught up one at a time, oldest first.
  const { activeDate, backlogCount } = getEntryQueue(
    startDate,
    today,
    confirmedDates,
  );

  const recordForActiveDate = (habitId: string, evaluation: EvaluationKey) => {
    const habit = habits.find((h) => h.id === habitId);
    if (!habit) return;
    setRecords((prev) => {
      const withoutDate = prev.filter(
        (r) => !(r.habitId === habitId && r.date === activeDate),
      );
      return [
        ...withoutDate,
        {
          id: generateId(),
          habitId,
          date: activeDate,
          evaluation,
          amount: habit.amounts[evaluation],
        },
      ];
    });
  };

  const addHabit = (
    name: string,
    segment: Segment,
    amounts: EvaluationAmounts,
  ) => {
    setHabits((prev) => [
      ...prev,
      { id: generateId(), name, segment, amounts },
    ]);
  };

  const updateHabit = (
    habitId: string,
    updates: Partial<Pick<Habit, "name" | "segment" | "amounts">>,
  ) => {
    setHabits((prev) =>
      prev.map((h) => (h.id === habitId ? { ...h, ...updates } : h)),
    );
  };

  const deleteHabit = (habitId: string) => {
    setHabits((prev) => prev.filter((h) => h.id !== habitId));
  };

  const addSegment = (segment: Segment) => {
    setSegments((prev) => (prev.includes(segment) ? prev : [...prev, segment]));
  };

  const confirmDay = (date: string) => {
    setConfirmedDates((prev) => (prev.includes(date) ? prev : [...prev, date]));
  };

  const unconfirmDay = (date: string) => {
    setConfirmedDates((prev) => prev.filter((d) => d !== date));
  };

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 sm:py-12">
      <main className="mx-auto flex w-full max-w-md flex-col gap-6">
        <header className="flex items-center justify-between">
          <p className="text-sm font-medium text-gray-500">習慣PL</p>
          <Link
            href="/onboarding"
            className="text-xs text-gray-400 underline hover:text-gray-600"
          >
            AIと一緒に設計する
          </Link>
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
          targetDate={activeDate}
          isToday={activeDate === today}
          backlogCount={backlogCount}
          isConfirmed={confirmedDates.includes(activeDate)}
          onRecord={recordForActiveDate}
          onConfirm={() => confirmDay(activeDate)}
          onUnconfirm={() => unconfirmDay(activeDate)}
        />

        <PeriodReport habits={habits} records={records} segments={segments} />

        <HistoryList records={records} habits={habits} />

        <HabitSettings
          habits={habits}
          segments={segments}
          onAdd={addHabit}
          onUpdate={updateHabit}
          onDelete={deleteHabit}
          onAddSegment={addSegment}
        />
      </main>
    </div>
  );
}
