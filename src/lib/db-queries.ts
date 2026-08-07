import { sql } from "@/lib/db";
import {
  DEFAULT_AMOUNTS,
  DEFAULT_SEGMENTS,
  type AppState,
  type EvaluationAmounts,
  type EvaluationKey,
  type Habit,
  type HabitRecord,
  type Segment,
} from "@/lib/habit-pl";
import { todayString } from "@/lib/habit-pl";
import type { OnboardingAccount, OnboardingProposal } from "@/lib/onboarding";

const DEFAULT_HABIT_NAMES = ["睡眠", "トレーニング・運動", "深酒", "たばこ"];

/**
 * The app's own evaluation tiers (達成/該当なし/未達) map 1:1 onto the
 * weight_rules table's 3 amount columns, which keep the names from the
 * original onboarding JSON schema (achieved/missed/badly_missed). "missed"
 * is simply the slot the app's UI presents as "該当なし" (not applicable) —
 * see the long comment on the weight_rules table in db/schema.sql.
 */
function amountsFromRow(row: {
  amount_achieved: number;
  amount_missed: number;
  amount_badly_missed: number;
}): EvaluationAmounts {
  return {
    achieved: row.amount_achieved,
    notApplicable: row.amount_missed,
    notAchieved: row.amount_badly_missed,
  };
}

function evaluationToDb(evaluation: EvaluationKey): string {
  return evaluation === "notApplicable"
    ? "not_applicable"
    : evaluation === "notAchieved"
      ? "not_achieved"
      : "achieved";
}

function evaluationFromDb(evaluation: string): EvaluationKey {
  return evaluation === "not_applicable"
    ? "notApplicable"
    : evaluation === "not_achieved"
      ? "notAchieved"
      : "achieved";
}

function buildNote(row: {
  criteria_achieved: string | null;
  criteria_missed: string | null;
  criteria_badly_missed: string | null;
}): string | undefined {
  const parts = [
    row.criteria_achieved && `達成: ${row.criteria_achieved}`,
    row.criteria_missed && `該当なし: ${row.criteria_missed}`,
    row.criteria_badly_missed && `未達: ${row.criteria_badly_missed}`,
  ].filter(Boolean);
  return parts.length > 0 ? (parts.join(" / ") as string) : undefined;
}

/** Seeds a brand-new (empty) database with the same starting point the old localStorage version shipped with. */
async function seedIfEmpty(): Promise<void> {
  const [{ count }] = await sql<{ count: string }[]>`select count(*)::int as count from segments`;
  if (Number(count) > 0) return;

  await sql.begin(async (tx) => {
    const segmentRows = await tx<{ id: string; name: string }[]>`
      insert into segments ${tx(DEFAULT_SEGMENTS.map((name) => ({ name })))}
      returning id, name
    `;
    const segmentIdByName = new Map(segmentRows.map((s) => [s.name, s.id]));
    const defaultSegmentId = segmentIdByName.get(DEFAULT_SEGMENTS[0])!;

    for (const name of DEFAULT_HABIT_NAMES) {
      const [account] = await tx<{ id: string }[]>`
        insert into accounts (segment_id, name) values (${defaultSegmentId}, ${name})
        returning id
      `;
      await tx`
        insert into weight_rules (account_id, amount_achieved, amount_missed, amount_badly_missed)
        values (${account.id}, ${DEFAULT_AMOUNTS.achieved}, ${DEFAULT_AMOUNTS.notApplicable}, ${DEFAULT_AMOUNTS.notAchieved})
      `;
    }

    const today = todayString();
    await tx`
      insert into app_settings (key, value) values ('start_date', ${JSON.stringify(today)}::jsonb)
      on conflict (key) do nothing
    `;
  });
}

async function getStartDate(): Promise<string> {
  const rows = await sql<{ value: string }[]>`select value from app_settings where key = 'start_date'`;
  if (rows.length > 0) return JSON.parse(rows[0].value) as string;
  const today = todayString();
  await sql`
    insert into app_settings (key, value) values ('start_date', ${JSON.stringify(today)}::jsonb)
    on conflict (key) do nothing
  `;
  return today;
}

export async function getFullState(): Promise<AppState> {
  await seedIfEmpty();

  const segmentRows = await sql<{ id: string; name: string }[]>`
    select id, name from segments order by created_at asc
  `;
  const segments: Segment[] = segmentRows.map((s) => s.name);
  const segmentNameById = new Map(segmentRows.map((s) => [s.id, s.name]));

  const accountRows = await sql<
    {
      id: string;
      segment_id: string;
      name: string;
      criteria_achieved: string | null;
      criteria_missed: string | null;
      criteria_badly_missed: string | null;
      amount_achieved: number;
      amount_missed: number;
      amount_badly_missed: number;
    }[]
  >`
    select a.id, a.segment_id, a.name,
           a.criteria_achieved, a.criteria_missed, a.criteria_badly_missed,
           w.amount_achieved, w.amount_missed, w.amount_badly_missed
    from accounts a
    join weight_rules w on w.account_id = a.id
    order by a.created_at asc
  `;

  const habits: Habit[] = accountRows.map((a) => ({
    id: a.id,
    name: a.name,
    segment: segmentNameById.get(a.segment_id) ?? DEFAULT_SEGMENTS[0],
    amounts: amountsFromRow(a),
    note: buildNote(a),
  }));

  const entryRows = await sql<
    { id: string; account_id: string | null; date: string; evaluation: string; amount: number }[]
  >`select id, account_id, date::text as date, evaluation, amount from entries order by date asc`;
  const records: HabitRecord[] = entryRows.map((e) => ({
    id: e.id,
    habitId: e.account_id ?? "",
    date: e.date,
    evaluation: evaluationFromDb(e.evaluation),
    amount: e.amount,
  }));

  const settlementRows = await sql<{ date: string }[]>`select date::text as date from settlements`;
  const confirmedDates = settlementRows.map((s) => s.date);

  const startDate = await getStartDate();

  return { habits, records, confirmedDates, startDate, segments };
}

export async function createSegment(name: string): Promise<void> {
  await sql`insert into segments (name) values (${name}) on conflict (name) do nothing`;
}

async function getOrCreateSegmentId(name: string): Promise<string> {
  const [existing] = await sql<{ id: string }[]>`select id from segments where name = ${name}`;
  if (existing) return existing.id;
  const [created] = await sql<{ id: string }[]>`
    insert into segments (name) values (${name}) returning id
  `;
  return created.id;
}

export async function createHabit(
  name: string,
  segment: string,
  amounts: EvaluationAmounts,
): Promise<Habit> {
  const segmentId = await getOrCreateSegmentId(segment);
  const [account] = await sql<{ id: string }[]>`
    insert into accounts (segment_id, name) values (${segmentId}, ${name}) returning id
  `;
  await sql`
    insert into weight_rules (account_id, amount_achieved, amount_missed, amount_badly_missed)
    values (${account.id}, ${amounts.achieved}, ${amounts.notApplicable}, ${amounts.notAchieved})
  `;
  return { id: account.id, name, segment, amounts };
}

export async function updateHabit(
  habitId: string,
  updates: Partial<Pick<Habit, "name" | "segment" | "amounts">>,
): Promise<void> {
  if (updates.name !== undefined) {
    await sql`update accounts set name = ${updates.name} where id = ${habitId}`;
  }
  if (updates.segment !== undefined) {
    const segmentId = await getOrCreateSegmentId(updates.segment);
    await sql`update accounts set segment_id = ${segmentId} where id = ${habitId}`;
  }
  if (updates.amounts !== undefined) {
    const a = updates.amounts;
    await sql`
      update weight_rules
      set amount_achieved = ${a.achieved}, amount_missed = ${a.notApplicable}, amount_badly_missed = ${a.notAchieved}, updated_at = now()
      where account_id = ${habitId}
    `;
  }
}

export async function deleteHabit(habitId: string): Promise<void> {
  await sql`delete from accounts where id = ${habitId}`;
}

/** Records (or overwrites) one day's evaluation for a habit, freezing the amount from that habit's current weight_rule. */
export async function recordEntry(
  habitId: string,
  date: string,
  evaluation: EvaluationKey,
): Promise<HabitRecord> {
  const [rule] = await sql<
    { amount_achieved: number; amount_missed: number; amount_badly_missed: number }[]
  >`select amount_achieved, amount_missed, amount_badly_missed from weight_rules where account_id = ${habitId}`;
  if (!rule) throw new Error("habit not found");

  const amounts = amountsFromRow(rule);
  const amount = amounts[evaluation];
  const dbEvaluation = evaluationToDb(evaluation);

  const [row] = await sql<{ id: string }[]>`
    insert into entries (account_id, date, evaluation, amount)
    values (${habitId}, ${date}, ${dbEvaluation}, ${amount})
    on conflict (account_id, date) do update set evaluation = excluded.evaluation, amount = excluded.amount
    returning id
  `;
  return { id: row.id, habitId, date, evaluation, amount };
}

export async function confirmDate(date: string): Promise<void> {
  await sql`insert into settlements (date) values (${date}) on conflict (date) do nothing`;
}

export async function unconfirmDate(date: string): Promise<void> {
  await sql`delete from settlements where date = ${date}`;
}

// --- Onboarding session persistence (resume-on-reopen) ---------------------

export interface OnboardingSessionRow {
  id: string;
  messages: { role: "user" | "assistant"; content: string }[];
  proposal: OnboardingProposal | null;
}

export async function getActiveOnboardingSession(): Promise<OnboardingSessionRow | null> {
  const [row] = await sql<
    { id: string; messages: unknown; proposal: unknown }[]
  >`select id, messages, proposal from onboarding_sessions where status = 'in_progress' order by updated_at desc limit 1`;
  if (!row) return null;
  return {
    id: row.id,
    messages: row.messages as OnboardingSessionRow["messages"],
    proposal: row.proposal as OnboardingProposal | null,
  };
}

/** Creates the session on first call (no `id`), or appends to it on later turns. */
export async function saveOnboardingTurn(
  id: string | null,
  messages: OnboardingSessionRow["messages"],
  proposal: OnboardingProposal | null,
): Promise<string> {
  if (id) {
    await sql`
      update onboarding_sessions
      set messages = ${JSON.stringify(messages)}::jsonb, proposal = ${proposal ? JSON.stringify(proposal) : null}::jsonb, updated_at = now()
      where id = ${id}
    `;
    return id;
  }
  const [row] = await sql<{ id: string }[]>`
    insert into onboarding_sessions (messages, proposal)
    values (${JSON.stringify(messages)}::jsonb, ${proposal ? JSON.stringify(proposal) : null}::jsonb)
    returning id
  `;
  return row.id;
}

/**
 * Writes a confirmed onboarding proposal directly into segments/accounts/
 * weight_rules — the only place this app writes those tables from onboarding
 * output, and only ever called from the explicit user "confirm" action.
 */
export async function confirmOnboardingProposal(
  sessionId: string,
  proposal: OnboardingProposal,
): Promise<void> {
  await sql.begin(async (tx) => {
    const segmentIdByName = new Map<string, string>();
    for (const segment of proposal.segments) {
      const [existing] = await tx<{ id: string }[]>`select id from segments where name = ${segment.name}`;
      if (existing) {
        segmentIdByName.set(segment.name, existing.id);
      } else {
        const [created] = await tx<{ id: string }[]>`
          insert into segments (name) values (${segment.name}) returning id
        `;
        segmentIdByName.set(segment.name, created.id);
      }
    }

    const ruleByAccount = new Map(proposal.weight_rules.map((r) => [r.account_name, r]));
    for (const account of proposal.accounts) {
      let segmentId = segmentIdByName.get(account.segment_name);
      if (!segmentId) {
        const [created] = await tx<{ id: string }[]>`
          insert into segments (name) values (${account.segment_name}) returning id
        `;
        segmentId = created.id;
        segmentIdByName.set(account.segment_name, segmentId);
      }
      const rule = ruleByAccount.get(account.name);
      const [created] = await tx<{ id: string }[]>`
        insert into accounts (segment_id, name, type, frequency, criteria_achieved, criteria_missed, criteria_badly_missed)
        values (${segmentId}, ${account.name}, ${account.type}, ${account.frequency}, ${account.criteria_achieved}, ${account.criteria_missed}, ${account.criteria_badly_missed})
        returning id
      `;
      await tx`
        insert into weight_rules (account_id, amount_achieved, amount_missed, amount_badly_missed, change_reason)
        values (
          ${created.id},
          ${rule?.amount_achieved ?? DEFAULT_AMOUNTS.achieved},
          ${rule?.amount_missed ?? DEFAULT_AMOUNTS.notApplicable},
          ${rule?.amount_badly_missed ?? DEFAULT_AMOUNTS.notAchieved},
          ${rule?.change_reason ?? null}
        )
      `;
    }

    await tx`update onboarding_sessions set status = 'completed', updated_at = now() where id = ${sessionId}`;
  });
}

export async function abandonOnboardingSession(id: string): Promise<void> {
  await sql`update onboarding_sessions set status = 'abandoned', updated_at = now() where id = ${id}`;
}

export type { OnboardingAccount };
