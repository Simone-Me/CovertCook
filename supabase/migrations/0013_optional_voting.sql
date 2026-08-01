-- Optional voting: a host can choose, at creation, for a round to skip
-- voting entirely (DINNER -> RESULTS directly) instead of always going
-- through DINNER -> VOTING -> RESULTS. Round-configuration setting, same
-- bucket as slot_mode/allow_mutual_pairs/requires_approval — set once at
-- creation, no update RPC (matches how every other creation-time setting
-- in this codebase already works).
--
-- compute_results already tolerates zero ballots (results.sql: `eligible`
-- lists every submitted+delivered dish regardless of votes, `scored` is
-- left-joined so borda_points defaults to 0) — a voting-skipped round's
-- dishes still show up on the results screen, just untied by rank beyond
-- the disclosed random tiebreak.

alter table rounds add column voting_enabled boolean not null default true;

-- ---------------------------------------------------------------------------
-- create_round — same body as 0004, with p_voting_enabled appended as a new
-- optional parameter. The old 10-arg signature is dropped so PostgREST
-- never has two ambiguous overloads to choose between.
-- ---------------------------------------------------------------------------

drop function if exists create_round(
  text, round_visibility, round_anonymity, slot_mode, int,
  timestamptz, text, text, boolean, boolean
);

create or replace function create_round(
  p_name text,
  p_visibility round_visibility,
  p_anonymity round_anonymity,
  p_slot_mode slot_mode default 'FREE',
  p_max_players int default null,
  p_dinner_at timestamptz default null,
  p_timezone text default 'Europe/Paris',
  p_location text default null,
  p_allow_mutual_pairs boolean default false,
  p_requires_approval boolean default true,
  p_voting_enabled boolean default true
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

  loop
    v_code := generate_unambiguous_code(8);
    exit when not exists (select 1 from rounds where join_code = v_code);
  end loop;

  insert into rounds (
    name, host_id, visibility, anonymity, slot_mode, max_players,
    dinner_at, timezone, location, allow_mutual_pairs, requires_approval,
    voting_enabled, join_code, accent_color, accent_emoji
  ) values (
    p_name, v_uid, p_visibility, p_anonymity, p_slot_mode, p_max_players,
    p_dinner_at, coalesce(p_timezone, 'Europe/Paris'), p_location,
    p_allow_mutual_pairs, p_requires_approval, p_voting_enabled,
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
  text, round_visibility, round_anonymity, slot_mode, int,
  timestamptz, text, text, boolean, boolean, boolean
) to authenticated;

-- ---------------------------------------------------------------------------
-- advance_phase — same body as 0006, with two new symmetric branches so a
-- voting_enabled=false round can hop DINNER<->RESULTS directly (a 2-step
-- move in v_forward_order) instead of only ever accepting exactly
-- one-step-forward / one-step-back. VOTING is simply never entered for
-- these rounds; get_ballot_options/submit_ballot are unreachable from the
-- UI for them since there's no VOTING status to expose a ballot screen for.
-- ---------------------------------------------------------------------------

create or replace function advance_phase(p_round_id uuid, p_target round_status)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_is_service boolean := auth.uid() is null;
  v_round rounds;
  v_forward_order round_status[] := array[
    'DRAFT','OPEN','LOCKED','ASSIGNED','BRIEFS_CLOSED','DINNER','VOTING','RESULTS','ARCHIVED'
  ]::round_status[];
  v_current_idx int;
  v_target_idx int;
  v_active_count int;
  v_slot_count int;
begin
  select * into v_round from rounds where id = p_round_id for update;
  if not found then
    raise exception 'round not found';
  end if;

  if not v_is_service and not is_round_host(p_round_id, v_uid) then
    raise exception 'only the host can advance this round''s phase';
  end if;

  if p_target = 'CANCELLED' then
    if v_round.status in ('RESULTS', 'ARCHIVED', 'CANCELLED') then
      raise exception 'round cannot be cancelled from its current phase';
    end if;
    update rounds set status = 'CANCELLED' where id = p_round_id;
    insert into audit_log (round_id, actor_id, action)
    values (p_round_id, v_uid, 'ROUND_CANCELLED');
    return;
  end if;

  v_current_idx := array_position(v_forward_order, v_round.status);
  v_target_idx := array_position(v_forward_order, p_target);

  if v_current_idx is null or v_target_idx is null then
    raise exception 'invalid phase for this round''s current state';
  end if;

  -- Closes a gap the generic one-step-back branch would otherwise leave
  -- open: without this, a voting_enabled=false round sitting in RESULTS
  -- could still be stepped back into VOTING (RESULTS is genuinely one
  -- index after VOTING in v_forward_order), even though the round was
  -- never meant to have a voting phase at all. Block VOTING outright for
  -- such rounds, forward or backward, regardless of which branch below
  -- would otherwise have matched.
  if p_target = 'VOTING' and not v_round.voting_enabled then
    raise exception 'voting is disabled for this round';
  end if;

  if v_target_idx = v_current_idx + 1 then
    if p_target = 'LOCKED' then
      select count(*) into v_active_count from round_members
      where round_id = p_round_id and status = 'ACTIVE' and approved;
      if v_active_count < 3 then
        raise exception 'need at least 3 active, approved players to lock the round';
      end if;

    elsif p_target = 'ASSIGNED' then
      if not exists (
        select 1 from pairings where round_id = p_round_id and assignment_version = v_round.assignment_version
      ) then
        raise exception 'generate an assignment before moving to ASSIGNED';
      end if;
      select count(*) into v_active_count from round_members
      where round_id = p_round_id and status = 'ACTIVE' and approved;
      select count(*) into v_slot_count from slots where round_id = p_round_id;
      if v_slot_count <> v_active_count then
        raise exception 'slot count (%) must equal active player count (%)', v_slot_count, v_active_count;
      end if;

    elsif p_target = 'BRIEFS_CLOSED' then
      if not v_is_service and v_round.briefs_due_at is not null and now() < v_round.briefs_due_at then
        raise exception 'briefs are not due yet';
      end if;

    elsif p_target = 'RESULTS' then
      if not v_is_service and v_round.voting_closes_at is not null and now() < v_round.voting_closes_at then
        raise exception 'voting has not closed yet';
      end if;
      perform compute_results(p_round_id);
    end if;

    update rounds set status = p_target where id = p_round_id;

  elsif v_target_idx = v_current_idx - 1 then
    if v_is_service then
      raise exception 'automated jobs may only move a round forward';
    end if;
    -- one step back: the client is responsible for the confirmation dialog
    -- describing exactly what will be lost; this just executes and logs it.
    update rounds set status = p_target where id = p_round_id;

  elsif v_round.status = 'DINNER' and p_target = 'RESULTS' and not v_round.voting_enabled
        and v_target_idx = v_current_idx + 2 then
    perform compute_results(p_round_id);
    update rounds set status = p_target where id = p_round_id;

  elsif v_round.status = 'RESULTS' and p_target = 'DINNER' and not v_round.voting_enabled
        and v_target_idx = v_current_idx - 2 then
    if v_is_service then
      raise exception 'automated jobs may only move a round forward';
    end if;
    update rounds set status = p_target where id = p_round_id;

  else
    raise exception 'can only advance one phase forward or step back one phase at a time';
  end if;

  insert into audit_log (round_id, actor_id, action, payload)
  values (p_round_id, v_uid, 'PHASE_CHANGED', jsonb_build_object(
    'from', v_round.status, 'to', p_target, 'automated', v_is_service
  ));
end;
$$;

grant execute on function advance_phase(uuid, round_status) to authenticated;
