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

// There's no auth yet — the app is single-user — but every table carries a
// user_id (see db/schema.sql) defaulting to the same constant everywhere,
// so multi-user support later is a query change, not a schema migration.
// Queries below don't filter by it explicitly: with a single user_id value
// in play, every row already belongs to "the" user, so the column earns its
// keep once real per-request user ids exist rather than before.

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

/** The latest (current) weight_rules row for an account — never the only one, since the table is append-only. */
async function getCurrentWeightRule(accountId: string): Promise<{
  id: string;
  amount_achieved: number;
  amount_missed: number;
  amount_badly_missed: number;
} | null> {
  const [rule] = await sql<
    { id: string; amount_achieved: number; amount_missed: number; amount_badly_missed: number }[]
  >`
    select id, amount_achieved, amount_missed, amount_badly_missed
    from weight_rules
    where account_id = ${accountId}
    order by effective_from desc
    limit 1
  `;
  return rule ?? null;
}

/** Inserts a new weight_rules row (the table is append-only — see db/schema.sql), carrying the prior row's amounts as the "before" values for the audit trail. */
async function insertWeightRule(
  accountId: string,
  amounts: EvaluationAmounts,
  changeReason: string | null = null,
): Promise<void> {
  const previous = await getCurrentWeightRule(accountId);
  await sql`
    insert into weight_rules (
      account_id, amount_achieved, amount_missed, amount_badly_missed,
      previous_amount_achieved, previous_amount_missed, previous_amount_badly_missed,
      change_reason
    )
    values (
      ${accountId}, ${amounts.achieved}, ${amounts.notApplicable}, ${amounts.notAchieved},
      ${previous?.amount_achieved ?? null}, ${previous?.amount_missed ?? null}, ${previous?.amount_badly_missed ?? null},
      ${changeReason}
    )
  `;
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
      on conflict (user_id, key) do nothing
    `;
  });
}

async function getStartDate(): Promise<string> {
  const rows = await sql<{ value: string }[]>`select value from app_settings where key = 'start_date'`;
  if (rows.length > 0) return JSON.parse(rows[0].value) as string;
  const today = todayString();
  await sql`
    insert into app_settings (key, value) values ('start_date', ${JSON.stringify(today)}::jsonb)
    on conflict (user_id, key) do nothing
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
    join lateral (
      select amount_achieved, amount_missed, amount_badly_missed
      from weight_rules
      where account_id = a.id
      order by effective_from desc
      limit 1
    ) w on true
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

  const lockRows = await sql<{ date: string }[]>`select date::text as date from daily_locks`;
  const confirmedDates = lockRows.map((s) => s.date);

  const startDate = await getStartDate();

  return { habits, records, confirmedDates, startDate, segments };
}

export async function createSegment(name: string): Promise<void> {
  await sql`insert into segments (name) values (${name}) on conflict (user_id, name) do nothing`;
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
  await insertWeightRule(account.id, amounts);
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
    // weight_rules is append-only (see db/schema.sql): an amount change
    // inserts a new history row rather than mutating the existing one.
    await insertWeightRule(habitId, updates.amounts);
  }
}

export async function deleteHabit(habitId: string): Promise<void> {
  await sql`delete from accounts where id = ${habitId}`;
}

/** Records (or overwrites) one day's evaluation for a habit, freezing the amount from — and linking to — that habit's current weight_rule. */
export async function recordEntry(
  habitId: string,
  date: string,
  evaluation: EvaluationKey,
): Promise<HabitRecord> {
  const rule = await getCurrentWeightRule(habitId);
  if (!rule) throw new Error("habit not found");

  const amounts = amountsFromRow(rule);
  const amount = amounts[evaluation];
  const dbEvaluation = evaluationToDb(evaluation);

  const [row] = await sql<{ id: string }[]>`
    insert into entries (account_id, weight_rule_id, date, evaluation, amount)
    values (${habitId}, ${rule.id}, ${date}, ${dbEvaluation}, ${amount})
    on conflict (account_id, date) do update
      set evaluation = excluded.evaluation, amount = excluded.amount, weight_rule_id = excluded.weight_rule_id
    returning id
  `;
  return { id: row.id, habitId, date, evaluation, amount };
}

export async function confirmDate(date: string): Promise<void> {
  await sql`insert into daily_locks (date) values (${date}) on conflict (user_id, date) do nothing`;
}

export async function unconfirmDate(date: string): Promise<void> {
  await sql`delete from daily_locks where date = ${date}`;
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
      // First weight_rules row for a brand-new account: no prior rule, so
      // there's nothing to carry into previous_amount_* (left null).
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
