-- 習慣PL — schema for a plain Postgres database (Supabase's hosted Postgres
-- works as-is; any other Postgres provider does too, since the app talks to
-- it over a normal connection string, not Supabase's REST/SDK layer).
--
-- Run this once against a fresh database, e.g. via the Supabase dashboard's
-- SQL editor, or `psql "$DATABASE_URL" -f db/schema.sql`.

create extension if not exists pgcrypto;

-- --- Single-user "tenant" column ------------------------------------------
--
-- Every user-owned table carries a `user_id`, even though there's no auth
-- yet and the whole app is single-user today. All rows default to the same
-- constant id via this function, so there's one place to change when real
-- accounts (e.g. Supabase Auth, whose users live in `auth.users`) show up —
-- at that point `user_id` starts getting set explicitly per request and can
-- pick up a real `references auth.users(id)` FK; nothing here hard-codes a
-- dependency on Supabase's auth schema in the meantime, so this still runs
-- on any plain Postgres.
create or replace function default_user_id() returns uuid
  language sql immutable as $$ select '00000000-0000-0000-0000-000000000001'::uuid $$;

create table if not exists segments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default default_user_id(),
  name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default default_user_id(),
  segment_id uuid not null references segments(id),
  name text not null,
  type text not null default 'revenue' check (type in ('revenue', 'expense')),
  frequency text not null default 'daily' check (frequency in ('daily', 'weekly', 'monthly')),
  -- Free-text description of each evaluation tier (e.g. from onboarding).
  -- All nullable: habits added directly in the app's UI have no criteria text.
  criteria_achieved text,
  criteria_missed text,
  criteria_badly_missed text,
  created_at timestamptz not null default now()
);

create index if not exists accounts_segment_id_idx on accounts (segment_id);
create index if not exists accounts_user_id_idx on accounts (user_id);

-- --- weight_rules: append-only amount-change history ----------------------
--
-- IMPORTANT naming note: this table's 3 tiers are named after the original
-- onboarding schema (achieved/missed/badly_missed), but the app's own UI
-- uses 3 different tier labels (達成/該当なし/未達 = achieved/not-applicable/
-- not-achieved). They're the same 3 slots — "missed" is simply the slot the
-- app's UI presents as "該当なし" (not applicable), defaulting to 0 but
-- editable per habit, exactly like the other two tiers. The app layer is
-- responsible for this achieved/missed/badly_missed <-> achieved/
-- not_applicable/not_achieved relabeling; the DB just stores 3 amounts.
--
-- Every amount change inserts a new row rather than updating one in place,
-- so past entries can always be traced back to the exact rule (amounts +
-- reason) that was in effect when they were recorded. The previous_amount_*
-- columns duplicate the prior row's values onto the new one so a change's
-- before/after diff reads directly off a single row, without a self-join.
-- A trigger below makes the table physically append-only (no UPDATE/DELETE),
-- since a mutable "history" table is not real history.
create table if not exists weight_rules (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  amount_achieved integer not null default 100,
  amount_missed integer not null default 0,
  amount_badly_missed integer not null default -100,
  previous_amount_achieved integer,
  previous_amount_missed integer,
  previous_amount_badly_missed integer,
  change_reason text,
  -- When this rule starts applying (entries recorded from this instant
  -- onward use it); defaults to "now", but can be backdated if needed.
  effective_from timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists weight_rules_account_effective_idx
  on weight_rules (account_id, effective_from desc);

create or replace function forbid_weight_rules_mutation() returns trigger
  language plpgsql as $$
begin
  raise exception 'weight_rules is append-only: insert a new row instead of updating/deleting row %', old.id;
end;
$$;

drop trigger if exists weight_rules_no_update on weight_rules;
create trigger weight_rules_no_update
  before update or delete on weight_rules
  for each row execute function forbid_weight_rules_mutation();

-- --- entries ---------------------------------------------------------------
--
-- A day's recorded outcome for one account. `amount` is frozen at record
-- time (ledger semantics: later editing a habit's amounts must never
-- retroactively change past entries) and `weight_rule_id` points at exactly
-- which weight_rules row produced it, so any entry's amount can always be
-- traced back to the rule version (and its change_reason) that applied.
--
-- account_id is nullable and ON DELETE SET NULL (not CASCADE): deleting a
-- habit/account must not erase its history, matching the app's existing
-- "(削除済みの科目)" placeholder behavior for orphaned entries. weight_rule_id
-- is likewise ON DELETE SET NULL for the same reason, though weight_rules
-- rows are themselves never deleted in normal operation (see the trigger
-- above) — this only matters if an account is deleted, cascading away its
-- weight_rules rows too.
create table if not exists entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default default_user_id(),
  account_id uuid references accounts(id) on delete set null,
  weight_rule_id uuid references weight_rules(id) on delete set null,
  date date not null,
  evaluation text not null check (evaluation in ('achieved', 'not_applicable', 'not_achieved')),
  amount integer not null,
  created_at timestamptz not null default now(),
  unique (account_id, date)
);

create index if not exists entries_date_idx on entries (date);
create index if not exists entries_account_id_idx on entries (account_id);
create index if not exists entries_weight_rule_id_idx on entries (weight_rule_id);
create index if not exists entries_user_id_idx on entries (user_id);

-- --- daily_locks -------------------------------------------------------
--
-- A confirmed/locked day (the daily-entry UI won't let you re-edit it
-- without explicitly unlocking). Presence of a row = confirmed. Distinct
-- from `settlements` below: this is a UX-level per-day lock driving the
-- catch-up queue, not a P&L snapshot.
create table if not exists daily_locks (
  user_id uuid not null default default_user_id(),
  date date not null,
  confirmed_at timestamptz not null default now(),
  primary key (user_id, date)
);

-- --- settlements: weekly-flash / monthly-final P&L snapshots ---------------
--
-- A settlement is a point-in-time snapshot of a period's P&L (not a
-- cumulative running total) — either a `weekly_flash` (preliminary, can be
-- recomputed as the week's entries change) or a `monthly_final` (the
-- official month-end close). `total_amount` is the period's total across
-- all segments; per-segment breakdown lives in the child table below so
-- segment totals stay properly relational (FK'd to segments) instead of an
-- untyped blob.
create table if not exists settlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default default_user_id(),
  period_type text not null check (period_type in ('weekly_flash', 'monthly_final')),
  period_start date not null,
  period_end date not null,
  total_amount integer not null,
  created_at timestamptz not null default now(),
  unique (user_id, period_type, period_start)
);

create index if not exists settlements_period_idx on settlements (period_type, period_start desc);
create index if not exists settlements_user_id_idx on settlements (user_id);

create table if not exists settlement_segment_totals (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references settlements(id) on delete cascade,
  -- ON DELETE SET NULL, not CASCADE: a settlement snapshot must survive a
  -- segment being renamed away/deleted later, same reasoning as entries above.
  segment_id uuid references segments(id) on delete set null,
  amount integer not null,
  unique (settlement_id, segment_id)
);

create index if not exists settlement_segment_totals_settlement_id_idx
  on settlement_segment_totals (settlement_id);

-- --- app_settings ------------------------------------------------------
--
-- Small per-user key/value store for app-wide settings that don't warrant
-- their own table — currently just `start_date`, the day the backlog
-- catch-up queue starts counting from.
create table if not exists app_settings (
  user_id uuid not null default default_user_id(),
  key text not null,
  value jsonb not null,
  primary key (user_id, key)
);

-- --- onboarding_sessions -------------------------------------------------
--
-- Onboarding chat state, so closing the tab mid-conversation doesn't lose
-- progress. Single-user app: at most one `in_progress` session per user at
-- a time (enforced below), always resumed from on reopen; a confirmed
-- session flips to 'completed' and a fresh one starts next time onboarding
-- opens.
create table if not exists onboarding_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default default_user_id(),
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'abandoned')),
  messages jsonb not null default '[]'::jsonb,
  proposal jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists onboarding_sessions_one_active
  on onboarding_sessions (user_id, status)
  where status = 'in_progress';
