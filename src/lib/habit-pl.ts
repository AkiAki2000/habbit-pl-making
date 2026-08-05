export type EvaluationKey = "achieved" | "notAchieved" | "bigMiss";

export interface EvaluationAmounts {
  achieved: number;
  notAchieved: number;
  bigMiss: number;
}

export type Segment = "health" | "family" | "selfInvestment" | "digitalHabits";

export const SEGMENTS: Segment[] = [
  "health",
  "family",
  "selfInvestment",
  "digitalHabits",
];

export const SEGMENT_LABELS: Record<Segment, string> = {
  health: "健康",
  family: "家族",
  selfInvestment: "自己投資",
  digitalHabits: "デジタル習慣",
};

const DEFAULT_SEGMENT: Segment = "health";

export interface Habit {
  id: string;
  name: string;
  segment: Segment;
  amounts: EvaluationAmounts;
}

export interface HabitRecord {
  id: string;
  habitId: string;
  date: string; // YYYY-MM-DD
  evaluation: EvaluationKey;
  amount: number;
}

export interface AppState {
  habits: Habit[];
  records: HabitRecord[];
}

export const EVALUATION_KEYS: EvaluationKey[] = [
  "achieved",
  "notAchieved",
  "bigMiss",
];

export const EVALUATION_LABELS: Record<EvaluationKey, string> = {
  achieved: "達成",
  notAchieved: "未達",
  bigMiss: "大きく未達",
};

export const DEFAULT_AMOUNTS: EvaluationAmounts = {
  achieved: 100,
  notAchieved: 0,
  bigMiss: -100,
};

const HABITS_KEY = "habit-pl:habits";
const RECORDS_KEY = "habit-pl:records";
const LEGACY_HABIT_NAME_KEY = "habit-pl:habit-name";

export function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function todayString(): string {
  return formatDate(new Date());
}

function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function formatYen(amount: number): string {
  const sign = amount > 0 ? "+" : amount < 0 ? "" : "±";
  return `${sign}${amount.toLocaleString("ja-JP")}円`;
}

function parseDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00`);
}

function addDays(dateStr: string, delta: number): string {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + delta);
  return formatDate(d);
}

/** Monday-start week containing the given YYYY-MM-DD date, returned as YYYY-MM-DD. */
export function startOfWeek(dateStr: string): string {
  const d = parseDate(dateStr);
  const day = d.getDay(); // 0 = Sunday .. 6 = Saturday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  return formatDate(d);
}

export type PeriodKey = "last7" | "last30" | "thisQuarter" | "ytd";

export const PERIODS: PeriodKey[] = ["last7", "last30", "thisQuarter", "ytd"];

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  last7: "直近7日",
  last30: "直近30日",
  thisQuarter: "今四半期",
  ytd: "年初来",
};

/** Inclusive [start, end] range for the given period, ending on `today`. */
export function periodRange(
  period: PeriodKey,
  today: string,
): { start: string; end: string } {
  const d = parseDate(today);
  switch (period) {
    case "last7":
      return { start: addDays(today, -6), end: today };
    case "last30":
      return { start: addDays(today, -29), end: today };
    case "thisQuarter": {
      const quarterStartMonth = Math.floor(d.getMonth() / 3) * 3;
      return {
        start: formatDate(new Date(d.getFullYear(), quarterStartMonth, 1)),
        end: today,
      };
    }
    case "ytd":
      return { start: formatDate(new Date(d.getFullYear(), 0, 1)), end: today };
  }
}

function createDefaultHabits(): Habit[] {
  const names = ["睡眠", "トレーニング・運動", "深酒", "たばこ"];
  return names.map((name) => ({
    id: generateId(),
    name,
    segment: DEFAULT_SEGMENT,
    amounts: { ...DEFAULT_AMOUNTS },
  }));
}

interface LegacyRecord {
  date: string;
  evaluation: EvaluationKey;
  amount: number;
}

/**
 * Migrates the single-habit MVP's localStorage shape (one habit, records
 * without habitId) into the multi-habit shape, so existing users keep their
 * history instead of it silently disappearing.
 */
function migrateLegacyState(): AppState | null {
  const legacyRecordsRaw = window.localStorage.getItem(RECORDS_KEY);
  if (!legacyRecordsRaw) return null;

  let legacyRecords: LegacyRecord[];
  try {
    legacyRecords = JSON.parse(legacyRecordsRaw) as LegacyRecord[];
  } catch {
    return null;
  }
  if (!Array.isArray(legacyRecords) || legacyRecords.length === 0) return null;
  if (legacyRecords.some((r) => "habitId" in r)) return null; // already migrated

  const habit: Habit = {
    id: generateId(),
    name: window.localStorage.getItem(LEGACY_HABIT_NAME_KEY) ?? "睡眠",
    segment: DEFAULT_SEGMENT,
    amounts: { ...DEFAULT_AMOUNTS },
  };
  const records: HabitRecord[] = legacyRecords.map((r) => ({
    id: generateId(),
    habitId: habit.id,
    date: r.date,
    evaluation: r.evaluation,
    amount: r.amount,
  }));
  return { habits: [habit], records };
}

export function loadState(): AppState {
  const storedHabitsRaw = window.localStorage.getItem(HABITS_KEY);
  if (!storedHabitsRaw) {
    const migrated = migrateLegacyState();
    if (migrated) return migrated;
    return { habits: createDefaultHabits(), records: [] };
  }

  let habits: Habit[] = [];
  try {
    // Habits saved before segments existed won't have this field yet.
    const parsed = JSON.parse(storedHabitsRaw) as (Omit<Habit, "segment"> & {
      segment?: Segment;
    })[];
    habits = parsed.map((h) => ({ ...h, segment: h.segment ?? DEFAULT_SEGMENT }));
  } catch {
    habits = createDefaultHabits();
  }

  const storedRecordsRaw = window.localStorage.getItem(RECORDS_KEY);
  let records: HabitRecord[] = [];
  if (storedRecordsRaw) {
    try {
      records = JSON.parse(storedRecordsRaw) as HabitRecord[];
    } catch {
      records = [];
    }
  }
  return { habits, records };
}

export function saveHabits(habits: Habit[]): void {
  window.localStorage.setItem(HABITS_KEY, JSON.stringify(habits));
}

export function saveRecords(records: HabitRecord[]): void {
  window.localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
}
