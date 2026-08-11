import type {
  AppState,
  EvaluationAmounts,
  EvaluationKey,
  Habit,
  HabitRecord,
  Segment,
} from "@/lib/habit-pl";

async function request<T>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) {
    throw new Error(body.error ?? `リクエストに失敗しました (${res.status})`);
  }
  return body;
}

export function fetchState(): Promise<AppState> {
  return request<AppState>("/api/state");
}

export async function createSegment(name: Segment): Promise<void> {
  await request("/api/segments", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function createHabit(
  name: string,
  segment: Segment,
  amounts: EvaluationAmounts,
): Promise<Habit> {
  const { habit } = await request<{ habit: Habit }>("/api/habits", {
    method: "POST",
    body: JSON.stringify({ name, segment, amounts }),
  });
  return habit;
}

export async function updateHabit(
  habitId: string,
  updates: Partial<Pick<Habit, "name" | "segment" | "amounts">>,
): Promise<void> {
  await request(`/api/habits/${habitId}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export async function deleteHabit(habitId: string): Promise<void> {
  await request(`/api/habits/${habitId}`, { method: "DELETE" });
}

export async function recordEntry(
  habitId: string,
  date: string,
  evaluation: EvaluationKey,
): Promise<HabitRecord> {
  const { record } = await request<{ record: HabitRecord }>("/api/entries", {
    method: "POST",
    body: JSON.stringify({ habitId, date, evaluation }),
  });
  return record;
}

export async function confirmDate(date: string): Promise<void> {
  await request("/api/settlements", {
    method: "POST",
    body: JSON.stringify({ date }),
  });
}

export async function unconfirmDate(date: string): Promise<void> {
  await request(`/api/settlements/${date}`, { method: "DELETE" });
}
