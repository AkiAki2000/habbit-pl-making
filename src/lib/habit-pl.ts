export type EvaluationKey = "achieved" | "notApplicable" | "notAchieved";

export interface EvaluationAmounts {
  achieved: number;
  notApplicable: number;
  notAchieved: number;
}

// Segments are freeform, user- (or onboarding-) defined names, not a fixed
// enum: different people organize their habits along different axes.
export type Segment = string;

export const DEFAULT_SEGMENTS: Segment[] = [
  "健康",
  "家族",
  "自己投資",
  "デジタル習慣",
];

const DEFAULT_SEGMENT: Segment = DEFAULT_SEGMENTS[0];

// Segments were a fixed 4-value enum (English keys) before they became
// freeform; this maps old habit records' `segment` field to its Japanese
// display name so existing data doesn't suddenly show raw English keys.
const LEGACY_SEGMENT_LABELS: Record<string, string> = {
  health: "健康",
  family: "家族",
  selfInvestment: "自己投資",
  digitalHabits: "デジタル習慣",
};

function normalizeSegment(segment: string | undefined): Segment {
  if (!segment) return DEFAULT_SEGMENT;
  return LEGACY_SEGMENT_LABELS[segment] ?? segment;
}

export interface Habit {
  id: string;
  name: string;
  segment: Segment;
  amounts: EvaluationAmounts;
  /** Optional free-text reminder of what counts as each evaluation tier, e.g. set via onboarding. */
  note?: string;
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
  confirmedDates: string[];
  startDate: string;
  segments: Segment[];
}

export const EVALUATION_KEYS: EvaluationKey[] = [
  "achieved",
  "notApplicable",
  "notAchieved",
];

export const EVALUATION_LABELS: Record<EvaluationKey, string> = {
  achieved: "達成",
  notApplicable: "該当なし",
  notAchieved: "未達",
};

// Records made under the old 3-tier design ("大きく未達") stay in history
// as-is; this only supplies a label so they still render instead of "undefined".
const LEGACY_EVALUATION_LABELS: Record<string, string> = {
  bigMiss: "大きく未達",
};

export function evaluationLabel(evaluation: string): string {
  return (
    EVALUATION_LABELS[evaluation as EvaluationKey] ??
    LEGACY_EVALUATION_LABELS[evaluation] ??
    evaluation
  );
}

export const DEFAULT_AMOUNTS: EvaluationAmounts = {
  achieved: 100,
  notApplicable: 0,
  notAchieved: -100,
};

const HABITS_KEY = "habit-pl:habits";
const RECORDS_KEY = "habit-pl:records";
const CONFIRMED_DATES_KEY = "habit-pl:confirmed-dates";
const START_DATE_KEY = "habit-pl:start-date";
const SEGMENTS_KEY = "habit-pl:segments";
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

function datesBetween(start: string, end: string): string[] {
  const dates: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) dates.push(d);
  return dates;
}

export interface EntryQueue {
  /** The date the daily entry UI should target: the oldest unconfirmed day, or today once caught up. */
  activeDate: string;
  /** Unconfirmed days strictly before today, i.e. still owed. */
  backlogCount: number;
}

/**
 * You can never get ahead and record a future day, but if you skipped a few
 * days, this walks the entry UI through them oldest-first: `activeDate` stays
 * on the earliest unconfirmed day (even if that's in the past) until it's
 * confirmed, only reaching `today` once everything before it is caught up.
 */
export function getEntryQueue(
  startDate: string,
  today: string,
  confirmedDates: string[],
): EntryQueue {
  const unconfirmed = datesBetween(startDate, today).filter(
    (d) => !confirmedDates.includes(d),
  );
  const backlogCount = unconfirmed.filter((d) => d < today).length;
  const activeDate = unconfirmed.length > 0 ? unconfirmed[0] : today;
  return { activeDate, backlogCount };
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

/** The segment list, extended with any segment names already in use by habits but not yet listed. */
function reconcileSegments(segments: Segment[], habits: Habit[]): Segment[] {
  const known = new Set(segments);
  const extra: Segment[] = [];
  for (const habit of habits) {
    if (!known.has(habit.segment)) {
      known.add(habit.segment);
      extra.push(habit.segment);
    }
  }
  return [...segments, ...extra];
}

interface LegacyRecord {
  date: string;
  evaluation: string;
  amount: number;
}

/**
 * Migrates the single-habit MVP's localStorage shape (one habit, records
 * without habitId) into the multi-habit shape, so existing users keep their
 * history instead of it silently disappearing.
 */
function migrateLegacyState(startDate: string): AppState | null {
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
    evaluation: r.evaluation as EvaluationKey,
    amount: r.amount,
  }));
  return {
    habits: [habit],
    records,
    confirmedDates: [],
    startDate,
    segments: reconcileSegments(DEFAULT_SEGMENTS, [habit]),
  };
}

/**
 * The date catch-up backfill starts counting from. Reads the persisted value,
 * or initializes it to today on first run (whether that's a brand-new
 * install or an existing one upgrading to this feature) — either way there's
 * no backlog before the day this concept was introduced.
 */
function loadOrInitStartDate(): string {
  const stored = window.localStorage.getItem(START_DATE_KEY);
  if (stored) return stored;
  const today = todayString();
  window.localStorage.setItem(START_DATE_KEY, today);
  return today;
}

function loadStoredSegments(): Segment[] | null {
  const raw = window.localStorage.getItem(SEGMENTS_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function loadState(): AppState {
  const startDate = loadOrInitStartDate();
  const storedHabitsRaw = window.localStorage.getItem(HABITS_KEY);
  if (!storedHabitsRaw) {
    const migrated = migrateLegacyState(startDate);
    if (migrated) return migrated;
    const habits = createDefaultHabits();
    return {
      habits,
      records: [],
      confirmedDates: [],
      startDate,
      segments: reconcileSegments(DEFAULT_SEGMENTS, habits),
    };
  }

  let habits: Habit[] = [];
  try {
    // Habits saved before segments/notApplicable existed won't have these fields yet.
    const parsed = JSON.parse(storedHabitsRaw) as (Omit<
      Habit,
      "segment" | "amounts"
    > & {
      segment?: string;
      amounts: Partial<EvaluationAmounts>;
    })[];
    habits = parsed.map((h) => ({
      ...h,
      segment: normalizeSegment(h.segment),
      amounts: { ...DEFAULT_AMOUNTS, ...h.amounts },
    }));
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

  let confirmedDates: string[] = [];
  const storedConfirmedRaw = window.localStorage.getItem(CONFIRMED_DATES_KEY);
  if (storedConfirmedRaw) {
    try {
      confirmedDates = JSON.parse(storedConfirmedRaw) as string[];
    } catch {
      confirmedDates = [];
    }
  }

  const segments = reconcileSegments(
    loadStoredSegments() ?? DEFAULT_SEGMENTS,
    habits,
  );

  return { habits, records, confirmedDates, startDate, segments };
}

export function saveHabits(habits: Habit[]): void {
  window.localStorage.setItem(HABITS_KEY, JSON.stringify(habits));
}

export function saveSegments(segments: Segment[]): void {
  window.localStorage.setItem(SEGMENTS_KEY, JSON.stringify(segments));
}

export function saveRecords(records: HabitRecord[]): void {
  window.localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
}

export function saveConfirmedDates(dates: string[]): void {
  window.localStorage.setItem(CONFIRMED_DATES_KEY, JSON.stringify(dates));
}
