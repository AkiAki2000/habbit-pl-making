"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import * as api from "@/lib/api-client";
import { DailyEntry } from "@/components/daily-entry";
import { HabitSettings } from "@/components/habit-settings";
import { HistoryList } from "@/components/history-list";
import { PeriodReport } from "@/components/period-report";
import { StatTile } from "@/components/stat-tile";
import {
  DEFAULT_SEGMENTS,
  type EvaluationAmounts,
  type EvaluationKey,
  type Habit,
  type HabitRecord,
  type Segment,
  getEntryQueue,
  startOfWeek,
  todayString,
} from "@/lib/habit-pl";

// Habit name/amount edits fire on every keystroke (see AmountInput's
// commit-on-valid behavior in habit-settings.tsx), so sending a PATCH per
// keystroke would spam the network and risks out-of-order writes clobbering
// a later edit with an earlier one. Edits apply to local state immediately;
// the actual write is debounced and coalesced per habit.
const HABIT_UPDATE_DEBOUNCE_MS = 500;

export default function Home() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [records, setRecords] = useState<HabitRecord[]>([]);
  const [confirmedDates, setConfirmedDates] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(todayString());
  const [segments, setSegments] = useState<Segment[]>(DEFAULT_SEGMENTS);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pendingHabitUpdates = useRef(
    new Map<string, Partial<Pick<Habit, "name" | "segment" | "amounts">>>(),
  );
  const habitUpdateTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    api
      .fetchState()
      .then((stored) => {
        setHabits(stored.habits);
        setRecords(stored.records);
        setConfirmedDates(stored.confirmedDates);
        setStartDate(stored.startDate);
        setSegments(stored.segments);
        setLoaded(true);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

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
    const optimistic: HabitRecord = {
      id: `pending-${habitId}-${activeDate}`,
      habitId,
      date: activeDate,
      evaluation,
      amount: habit.amounts[evaluation],
    };
    setRecords((prev) => [
      ...prev.filter((r) => !(r.habitId === habitId && r.date === activeDate)),
      optimistic,
    ]);
    api
      .recordEntry(habitId, activeDate, evaluation)
      .then((record) => {
        setRecords((prev) => [
          ...prev.filter((r) => !(r.habitId === habitId && r.date === activeDate)),
          record,
        ]);
      })
      .catch((e: Error) => setError(e.message));
  };

  const addHabit = (
    name: string,
    segment: Segment,
    amounts: EvaluationAmounts,
  ) => {
    api
      .createHabit(name, segment, amounts)
      .then((habit) => setHabits((prev) => [...prev, habit]))
      .catch((e: Error) => setError(e.message));
  };

  const flushHabitUpdate = (habitId: string) => {
    const updates = pendingHabitUpdates.current.get(habitId);
    habitUpdateTimers.current.delete(habitId);
    pendingHabitUpdates.current.delete(habitId);
    if (!updates) return;
    api.updateHabit(habitId, updates).catch((e: Error) => setError(e.message));
  };

  const updateHabitField = (
    habitId: string,
    updates: Partial<Pick<Habit, "name" | "segment" | "amounts">>,
  ) => {
    setHabits((prev) =>
      prev.map((h) => (h.id === habitId ? { ...h, ...updates } : h)),
    );

    pendingHabitUpdates.current.set(habitId, {
      ...pendingHabitUpdates.current.get(habitId),
      ...updates,
    });
    const existingTimer = habitUpdateTimers.current.get(habitId);
    if (existingTimer) clearTimeout(existingTimer);
    habitUpdateTimers.current.set(
      habitId,
      setTimeout(() => flushHabitUpdate(habitId), HABIT_UPDATE_DEBOUNCE_MS),
    );
  };

  const deleteHabit = (habitId: string) => {
    setHabits((prev) => prev.filter((h) => h.id !== habitId));
    api.deleteHabit(habitId).catch((e: Error) => setError(e.message));
  };

  const addSegment = (segment: Segment) => {
    setSegments((prev) => (prev.includes(segment) ? prev : [...prev, segment]));
    api.createSegment(segment).catch((e: Error) => setError(e.message));
  };

  const confirmDay = (date: string) => {
    setConfirmedDates((prev) => (prev.includes(date) ? prev : [...prev, date]));
    api.confirmDate(date).catch((e: Error) => setError(e.message));
  };

  const unconfirmDay = (date: string) => {
    setConfirmedDates((prev) => prev.filter((d) => d !== date));
    api.unconfirmDate(date).catch((e: Error) => setError(e.message));
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

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">
            {error}
          </p>
        )}

        {!loaded && !error ? (
          <p className="py-12 text-center text-sm text-gray-400">読み込み中…</p>
        ) : (
          <>
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
              onUpdate={updateHabitField}
              onDelete={deleteHabit}
              onAddSegment={addSegment}
            />
          </>
        )}
      </main>
    </div>
  );
}
