-- Round setup, phase 1 of the redesign in PRESENTATION.md. Three changes to
-- how a dinner is configured at creation, plus the read the SPY mode needs.
--
-- Existing rows are test data only, so these migrate the simple way rather
-- than the careful way — no defensive backfill paths.

-- ---------------------------------------------------------------------------
-- 1. visibility: two names for the same act, replaced by two real choices
--
-- PUBLIC_LINK and PRIVATE_CODE both meant "share a code"; the difference
-- described nothing a person would recognise. They collapse into CODE, and
-- INVITE is genuinely new: the host names an existing account and that
-- person gets an in-app invitation to accept or decline. Both old values
-- become CODE, which is what they always were.
--
-- A new type rather than ALTER TYPE, because Postgres cannot remove enum
-- values — renaming in place would leave PUBLIC_LINK sitting in the schema
-- forever, meaning nothing.
-- ---------------------------------------------------------------------------

drop function if exists create_round(
  text, round_visibility, round_anonymity, slot_mode, int,
  timestamptz, text, text, boolean, boolean, boolean
);

create type round_access as enum ('CODE', 'INVITE');

alter table rounds add column access round_access not null default 'CODE';
alter table rounds drop column visibility;
drop type round_visibility;

-- ---------------------------------------------------------------------------
-- 2. voting: a boolean that could only say yes or no, replaced by how
--
-- LIVE   — the host opens voting during the dinner and publishes results
--          when ready, seeing them first.
-- TIMED  — a deadline runs and results publish themselves when it expires.
-- DISABLED — no voting at all, the previous `voting_enabled = false`.
--
-- advance_phase is deliberately NOT rewritten. The phase machine only ever
-- needed to know whether voting happens at all, never which flavour — LIVE
-- and TIMED differ in who triggers the transition and when results become
-- visible, which is phase 3's problem, not the state machine's. So
-- voting_enabled survives as a generated column derived from the new one,
-- and every existing branch in advance_phase (including the one added by
-- 0013 to stop a DISABLED round re-entering VOTING) keeps working
-- untouched. Fewer moving parts than replaying that logic against a new
-- column for no behavioural gain.
-- ---------------------------------------------------------------------------

create type voting_mode as enum ('LIVE', 'TIMED', 'DISABLED');

alter table rounds add column voting_mode voting_mode not null default 'LIVE';
update rounds set voting_mode = (case when voting_enabled then 'LIVE' else 'DISABLED' end)::voting_mode;
alter table rounds drop column voting_enabled;
alter table rounds add column voting_enabled boolean
  generated always as (voting_mode <> 'DISABLED') stored;

-- ---------------------------------------------------------------------------
-- 3. create_round, rebuilt around both
-- ---------------------------------------------------------------------------

create or replace function create_round(
  p_name text,
  p_access round_access,
  p_anonymity round_anonymity,
  p_slot_mode slot_mode default 'FREE',
  p_max_players int default null,
  p_dinner_at timestamptz default null,
  p_timezone text default 'Europe/Paris',
  p_location text default null,
  p_allow_mutual_pairs boolean default false,
  p_requires_approval boolean default true,
  p_voting_mode voting_mode default 'LIVE'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round_id uuid;
  v_code text;
  v_accent record;
  v_locale text;
  v_secret_name text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select locale into v_locale from profiles where id = v_uid;
  if not found then
    raise exception 'complete signup before creating a round';
  end if;

  select * into v_accent from pick_round_accent();

  -- Every round still gets a code. An INVITE round simply doesn't share
  -- it — which keeps the door open for a host who invites the core group
  -- and then wants a code for the last two seats, without a second
  -- creation path.
  loop
    v_code := generate_unambiguous_code(8);
    exit when not exists (select 1 from rounds where join_code = v_code);
  end loop;

  insert into rounds (
    name, host_id, access, anonymity, slot_mode, max_players,
    dinner_at, timezone, location, allow_mutual_pairs, requires_approval,
    voting_mode, join_code, accent_color, accent_emoji
  ) values (
    p_name, v_uid, p_access, p_anonymity, p_slot_mode, p_max_players,
    p_dinner_at, coalesce(p_timezone, 'Europe/Paris'), p_location,
    p_allow_mutual_pairs, p_requires_approval, p_voting_mode,
    v_code, v_accent.color, v_accent.emoji
  )
  returning id into v_round_id;

  select assign_secret_name(v_round_id, coalesce(v_locale, 'fr')) into v_secret_name;

  insert into round_members (round_id, profile_id, secret_name, role, approved)
  values (v_round_id, v_uid, v_secret_name, 'HOST', true);

  insert into audit_log (round_id, actor_id, action, payload)
  values (v_round_id, v_uid, 'ROUND_CREATED', jsonb_build_object('name', p_name));

  return v_round_id;
end;
$$;

grant execute on function create_round(
  text, round_access, round_anonymity, slot_mode, int,
  timestamptz, text, text, boolean, boolean, voting_mode
) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The read SPY mode exists for
--
-- Same shape as get_pending_members (0015) and for the same reason: the
-- names are not merely unrequested by the frontend, they are unreadable —
-- profiles_select_co_members returns a co-member's row, but nothing joins
-- it to "who is this really" in a way a SPY host can use without also
-- exposing it to everyone else. Host-only, and it refuses outright on a
-- round that isn't SPY, so the capability can't be reached by accident on
-- an ANONYMOUS round.
-- ---------------------------------------------------------------------------

create or replace function get_member_identities(p_round_id uuid)
returns table (
  member_id uuid,
  real_name text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_anonymity round_anonymity;
begin
  if not is_round_host(p_round_id, v_uid) then
    raise exception 'only the host can see who is who';
  end if;

  select r.anonymity into v_anonymity from rounds r where r.id = p_round_id;
  if v_anonymity <> 'SPY' then
    raise exception 'this round is not in spy mode';
  end if;

  -- Qualified throughout: RETURNS TABLE columns are implicitly-declared
  -- variables for the whole body, and an unqualified match is silently
  -- captured (the bug 0014 had to fix). real_name rather than display_name
  -- for the same reason.
  return query
  select m.id, p.display_name
  from round_members m
  join profiles p on p.id = m.profile_id
  where m.round_id = p_round_id
    and m.status = 'ACTIVE'
    and m.approved
  order by m.joined_at;
end;
$$;

grant execute on function get_member_identities(uuid) to authenticated;
