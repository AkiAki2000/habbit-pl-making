-- 習慣PL — schema for a plain Postgres database (Supabase's hosted Postgres
-- works as-is; any other Postgres provider does too, since the app talks to
-- it over a normal connection string, not Supabase's REST/SDK layer).
--
-- Run this once against a fresh database, e.g. via the Supabase dashboard's
-- SQL editor, or `psql "$DATABASE_URL" -f db/schema.sql`.

create extension if not exists pgcrypto;

create table if not exists segments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
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

-- One current rule per account (no change history for this MVP — updates
-- overwrite in place; `change_reason` is carried over from the onboarding
-- JSON schema but otherwise unused today).
--
-- IMPORTANT naming note: this table's 3 tiers are named after the original
-- onboarding schema (achieved/missed/badly_missed), but the app's own UI
-- uses 3 different tier labels (達成/該当なし/未達 = achieved/not-applicable/
-- not-achieved). They're the same 3 slots — "missed" is simply the slot the
-- app's UI presents as "該当なし" (not applicable), defaulting to 0 but
-- editable per habit, exactly like the other two tiers. The app layer is
-- responsible for this achieved/missed/badly_missed <-> achieved/
-- not_applicable/not_achieved relabeling; the DB just stores 3 amounts.
create table if not exists weight_rules (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references accounts(id) on delete cascade,
  amount_achieved integer not null default 100,
  amount_missed integer not null default 0,
  amount_badly_missed integer not null default -100,
  change_reason text,
  updated_at timestamptz not null default now()
);

-- A day's recorded outcome for one account. `amount` is frozen at record
-- time from that day's weight_rules (ledger semantics: later editing a
-- habit's amounts must never retroactively change past entries).
--
-- account_id is nullable and ON DELETE SET NULL (not CASCADE): deleting a
-- habit/account must not erase its history, matching the app's existing
-- "(削除済みの科目)" placeholder behavior for orphaned entries.
create table if not exists entries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references accounts(id) on delete set null,
  date date not null,
  evaluation text not null check (evaluation in ('achieved', 'not_applicable', 'not_achieved')),
  amount integer not null,
  created_at timestamptz not null default now(),
  unique (account_id, date)
);

-- A confirmed/locked day (the daily-entry UI won't let you re-edit it
-- without explicitly unlocking). Presence of a row = confirmed.
create table if not exists settlements (
  date date primary key,
  confirmed_at timestamptz not null default now()
);

-- Small singleton key/value store for app-wide settings that don't warrant
-- their own table — currently just `start_date`, the day the backlog
-- catch-up queue starts counting from.
create table if not exists app_settings (
  key text primary key,
  value jsonb not null
);

-- Onboarding chat state, so closing the tab mid-conversation doesn't lose
-- progress. Single-user app: at most one `in_progress` session at a time
-- (enforced below), always resumed from on reopen; a confirmed session
-- flips to 'completed' and a fresh one starts next time onboarding opens.
create table if not exists onboarding_sessions (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'abandoned')),
  messages jsonb not null default '[]'::jsonb,
  proposal jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists onboarding_sessions_one_active
  on onboarding_sessions (status)
  where status = 'in_progress';

create index if not exists entries_date_idx on entries (date);
create index if not exists accounts_segment_id_idx on accounts (segment_id);
