-- CovertCook — core schema
-- Conventions: uuid pk default gen_random_uuid(), all timestamps timestamptz.
-- RLS and RPC functions live in later migrations; this file is tables + constraints only.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- enums
-- ---------------------------------------------------------------------------

create type dietary_kind as enum ('ALLERGY_SEVERE', 'ALLERGY_MILD', 'DIET', 'DISLIKE');

create type round_status as enum (
  'DRAFT', 'OPEN', 'LOCKED', 'ASSIGNED', 'BRIEFS_CLOSED',
  'DINNER', 'VOTING', 'RESULTS', 'ARCHIVED', 'CANCELLED'
);

create type round_visibility as enum ('PUBLIC_LINK', 'PRIVATE_CODE');
create type round_anonymity as enum ('ANONYMOUS', 'OPEN');
create type slot_mode as enum ('FREE', 'CATEGORIES');
create type scoring_method as enum ('BORDA');

create type member_role as enum ('HOST', 'PLAYER');
create type member_status as enum ('ACTIVE', 'LEFT', 'REMOVED');

create type course as enum ('STARTER', 'MAIN', 'DESSERT', 'DRINK', 'OTHER');

create type brief_status as enum ('DRAFT', 'SUBMITTED');

-- NO_BRIEF is the canned message a Cook sends when their Sender never wrote
-- anything (§8) — distinct from CANNOT_COOK, which is a Cook backing out of
-- a dish they were assigned. Both raise a host_alert of the matching kind.
create type message_category as enum (
  'CLARIFICATION', 'SUBSTITUTION', 'NUDGE', 'CANNOT_COOK', 'NO_BRIEF', 'THANKS', 'REPLY'
);
create type message_slot_type as enum ('NONE', 'INGREDIENT', 'SHORT_TEXT');
create type message_direction as enum ('SENDER_TO_COOK', 'COOK_TO_SENDER');

create type host_alert_kind as enum (
  'CANNOT_COOK', 'NO_BRIEF', 'DROPOUT', 'REPORTED_MESSAGE', 'OTHER'
);

-- ---------------------------------------------------------------------------
-- profiles + dietary
-- ---------------------------------------------------------------------------

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  avatar_url text,
  locale text not null default 'fr',
  has_no_restrictions boolean not null default false,
  created_at timestamptz not null default now(),
  anonymised_at timestamptz
);

-- Enforced by the signup RPC (see 0003_functions.sql: complete_signup), not by a
-- table CHECK — "≥1 dietary_entries row OR has_no_restrictions" spans two tables
-- and can only be guaranteed by controlling the write path, not by DDL.
create table dietary_entries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  kind dietary_kind not null,
  label text not null check (char_length(label) between 1 and 80),
  note text,
  created_at timestamptz not null default now()
);

create index dietary_entries_profile_id_idx on dietary_entries (profile_id);

-- ---------------------------------------------------------------------------
-- rounds + membership
-- ---------------------------------------------------------------------------

create table rounds (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  host_id uuid not null references profiles (id),
  status round_status not null default 'DRAFT',
  visibility round_visibility not null default 'PRIVATE_CODE',
  anonymity round_anonymity not null default 'ANONYMOUS',
  requires_approval boolean not null default true,
  max_players int check (max_players is null or max_players >= 3),
  join_code text unique,
  accent_color text not null,
  accent_emoji text not null,
  dinner_at timestamptz,
  timezone text not null default 'Europe/Paris',
  location text,
  budget_hint text,
  notes text,
  guest_count int not null default 0 check (guest_count >= 0),
  slot_mode slot_mode not null default 'FREE',
  allow_mutual_pairs boolean not null default false,
  registration_closes_at timestamptz,
  briefs_due_at timestamptz,
  voting_opens_at timestamptz,
  voting_closes_at timestamptz,
  scoring_method scoring_method not null default 'BORDA',
  ballots_anonymous boolean not null default true,
  assignment_version int not null default 0,
  host_saw_chain_at timestamptz,
  created_at timestamptz not null default now(),

  check (
    registration_closes_at is null or briefs_due_at is null
    or registration_closes_at <= briefs_due_at
  ),
  check (
    voting_opens_at is null or voting_closes_at is null
    or voting_opens_at < voting_closes_at
  )
);

-- join_code must use an unambiguous alphabet (no O/0/I/1) and be >= 6 chars;
-- enforced in the RPC that generates it (see create_round), not here, since
-- generation needs a retry-on-collision loop that a CHECK can't express well.
-- This CHECK only guards against an obviously-wrong value being written at all.
alter table rounds add constraint rounds_join_code_shape
  check (join_code is null or join_code ~ '^[2-9A-HJ-NP-Z]{6,12}$');

create index rounds_host_id_idx on rounds (host_id);
create index rounds_status_idx on rounds (status);

create table round_members (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds (id) on delete cascade,
  profile_id uuid not null references profiles (id),
  secret_name text not null,
  role member_role not null default 'PLAYER',
  status member_status not null default 'ACTIVE',
  approved boolean not null default true,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  removed_at timestamptz,

  unique (round_id, profile_id),
  unique (round_id, secret_name)
);

create index round_members_round_id_idx on round_members (round_id);
create index round_members_profile_id_idx on round_members (profile_id);

-- A player occupies a seat only once approved and active. Partial unique index
-- so max_players checks (in the join RPC) can just count this set.
create index round_members_active_approved_idx on round_members (round_id)
  where status = 'ACTIVE' and approved;

create table exclusion_pairs (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds (id) on delete cascade,
  member_a uuid not null references round_members (id) on delete cascade,
  member_b uuid not null references round_members (id) on delete cascade,
  created_at timestamptz not null default now(),

  check (member_a <> member_b),
  -- canonical ordering so (A,B) and (B,A) can't both be inserted
  check (member_a < member_b),
  unique (round_id, member_a, member_b)
);

-- ---------------------------------------------------------------------------
-- slots
-- ---------------------------------------------------------------------------

-- One row per dish-sized slot to fill. In FREE mode, generate_assignment
-- materialises exactly one OTHER slot per active player, so slot_id on
-- pairings is never null — a nullable slot_id gives no real uniqueness
-- protection in Postgres (NULL <> NULL for unique constraints).
create table slots (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds (id) on delete cascade,
  course course not null,
  created_at timestamptz not null default now()
);

create index slots_round_id_idx on slots (round_id);

-- ---------------------------------------------------------------------------
-- pairings (the secret graph — no player SELECT policy, ever; RPC only)
-- ---------------------------------------------------------------------------

-- `lap` exists so a future "each cook gets N dishes" mode (a second full cycle
-- offset over the same members) is an additive feature, not a migration.
-- v1 only ever writes lap = 0. sum(slots) for a round must equal the number
-- of active+approved players before LOCKED -> ASSIGNED (enforced in
-- advance_phase), which is what keeps lap 0 a single Sattolo cycle.
create table pairings (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds (id) on delete cascade,
  sender_id uuid not null references round_members (id),
  cook_id uuid not null references round_members (id),
  slot_id uuid not null references slots (id),
  assignment_version int not null,
  lap int not null default 0,
  -- Set only when this pairing's sender_id was administratively reassigned
  -- (remove_member / splice) after a brief already existed under a different
  -- author. Lets the reveal credit the true writer instead of the current
  -- sender_id. Null means sender_id has always been the author.
  original_sender_id uuid references round_members (id),
  created_at timestamptz not null default now(),

  check (sender_id <> cook_id),
  unique (round_id, assignment_version, lap, sender_id),
  unique (round_id, assignment_version, lap, cook_id, slot_id)
);

create index pairings_round_id_idx on pairings (round_id);
create index pairings_sender_id_idx on pairings (sender_id);
create index pairings_cook_id_idx on pairings (cook_id);

-- ---------------------------------------------------------------------------
-- briefs (no player SELECT policy, ever; RPC only — see 0002_rls.sql)
-- ---------------------------------------------------------------------------

create table briefs (
  id uuid primary key default gen_random_uuid(),
  pairing_id uuid not null unique references pairings (id) on delete cascade,
  dish_name text not null default '',
  course course not null,
  procedure text not null default '',
  external_url text check (external_url is null or external_url ~ '^https?://'),
  difficulty int check (difficulty is null or difficulty between 1 and 5),
  est_cost text,
  prep_minutes int check (prep_minutes is null or prep_minutes > 0),
  note_to_cook text,
  contains_tags text[] not null default '{}',
  -- distinguishes "confirmed: none of the tracked allergens apply" (empty
  -- array, confirmed = true) from "never filled in" (empty array,
  -- confirmed = false) — an empty array alone can't tell those apart.
  contains_tags_confirmed boolean not null default false,
  status brief_status not null default 'DRAFT',
  submitted_at timestamptz,
  updated_at timestamptz not null default now(),

  -- length/shape rules only bite at submission time; drafts autosave freely.
  check (status = 'DRAFT' or char_length(dish_name) between 3 and 80),
  check (status = 'DRAFT' or char_length(procedure) >= 50),
  check (char_length(procedure) <= 5000),
  check (status = 'DRAFT' or contains_tags_confirmed)
);

create table brief_ingredients (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references briefs (id) on delete cascade,
  position int not null,
  name text not null check (char_length(name) between 1 and 80),
  quantity numeric,
  unit text,

  unique (brief_id, position)
);

create index brief_ingredients_brief_id_idx on brief_ingredients (brief_id);

-- ---------------------------------------------------------------------------
-- messaging (canned, anonymous) — RPC only, see 0002_rls.sql
-- ---------------------------------------------------------------------------

create table message_templates (
  id uuid primary key default gen_random_uuid(),
  category message_category not null,
  locale text not null,
  body text not null,
  slot_type message_slot_type not null default 'NONE',
  active boolean not null default true
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  pairing_id uuid not null references pairings (id) on delete cascade,
  direction message_direction not null,
  template_id uuid not null references message_templates (id),
  slot_value text,
  created_at timestamptz not null default now(), -- never exposed, see 0002_rls.sql
  -- not a GENERATED column: timestamptz -> date casts aren't IMMUTABLE
  -- (they depend on the session timezone), which Postgres requires for
  -- generated columns. A same-transaction DEFAULT is consistent with
  -- created_at's now() without that restriction.
  created_day date not null default current_date,
  read_at timestamptz,
  reported boolean not null default false
);

create index messages_pairing_id_idx on messages (pairing_id);

create table host_alerts (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds (id) on delete cascade,
  kind host_alert_kind not null,
  pairing_id uuid references pairings (id),
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index host_alerts_round_id_idx on host_alerts (round_id);

-- ---------------------------------------------------------------------------
-- secret names (locale-aware word lists, assigned randomly — never join order)
-- ---------------------------------------------------------------------------

create table secret_name_words (
  id uuid primary key default gen_random_uuid(),
  locale text not null,
  word text not null,
  unique (locale, word)
);

-- ---------------------------------------------------------------------------
-- voting
-- ---------------------------------------------------------------------------

create table ballots (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds (id) on delete cascade,
  voter_id uuid not null references round_members (id),
  submitted_at timestamptz not null default now(),

  unique (round_id, voter_id)
);

-- Secondary scores are deliberately just two: originality and respect of the
-- brief. Taste/presentation are already what the rank itself measures; these
-- two exist only because Borda alone can't produce the "most original" and
-- "best respect of the brief" awards.
create table ballot_items (
  id uuid primary key default gen_random_uuid(),
  ballot_id uuid not null references ballots (id) on delete cascade,
  brief_id uuid not null references briefs (id),
  rank int not null check (rank > 0),
  originality_score int check (originality_score between 1 and 5),
  brief_respect_score int check (brief_respect_score between 1 and 5),

  unique (ballot_id, brief_id),
  unique (ballot_id, rank)
);

create table results (
  round_id uuid not null references rounds (id) on delete cascade,
  brief_id uuid not null references briefs (id),
  borda_points numeric not null,
  avg_rank numeric,
  first_places int not null default 0,
  final_rank int not null,
  computed_at timestamptz not null default now(),

  primary key (round_id, brief_id)
);

-- One dish can win several awards simultaneously (best main + most original),
-- so this is its own table rather than a single nullable column on results.
create table awards (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds (id) on delete cascade,
  brief_id uuid not null references briefs (id),
  award_key text not null, -- 'BEST_STARTER' | 'BEST_MAIN' | 'BEST_DESSERT' | 'BEST_DRINK' | 'MOST_ORIGINAL' | 'BEST_BRIEF_RESPECT'
  computed_at timestamptz not null default now(),

  unique (round_id, award_key)
);

-- ---------------------------------------------------------------------------
-- invites + audit
-- ---------------------------------------------------------------------------

create table invites (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds (id) on delete cascade,
  code text not null unique check (code ~ '^[2-9A-HJ-NP-Z]{6,12}$'),
  email text,
  expires_at timestamptz not null,
  max_uses int not null default 1 check (max_uses > 0),
  uses int not null default 0 check (uses >= 0),
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now()
);

create index invites_round_id_idx on invites (round_id);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references rounds (id) on delete cascade,
  actor_id uuid references profiles (id),
  action text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index audit_log_round_id_idx on audit_log (round_id);
