-- A recipe should arrive when it is sent, not when the last one is.
--
-- Until now a cook could read the recipe written for them only once the round
-- reached BRIEFS_CLOSED — which meant the whole table waited for the slowest
-- writer, and then waited again for the Executive Chef to notice and push the
-- phase. That is the single biggest stall in the evening, and it buys nothing:
-- a submitted brief is already frozen (submit_brief refuses to run outside
-- ASSIGNED, and the editor locks once status = 'SUBMITTED'), so holding it
-- back protects nobody.
--
-- Two changes, and they belong together:
--   1. get_my_brief hands over a brief the moment it is SUBMITTED.
--   2. BRIEFS_CLOSED stops being a stop on the journey.
--
-- The enum value stays. Rounds already sitting in BRIEFS_CLOSED must keep
-- working, and deleting an enum member that live rows reference is not a
-- migration, it is an outage.

-- ---------------------------------------------------------------------------
-- 1. The recipe lands on submit.
--
-- Drafts are still invisible: the gate moved from "which phase is the round
-- in" to "has its author actually finished". A cook seeing half a recipe would
-- be worse than seeing none, because they would start shopping from it.
-- ---------------------------------------------------------------------------

create or replace function get_my_brief(p_round_id uuid)
returns table (
  pairing_id uuid, brief_id uuid, dish_name text, course course, procedure text,
  external_url text, difficulty integer, est_cost text, prep_minutes integer,
  note_to_cook text, contains_tags text[], ingredients jsonb, acknowledged boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
  v_my_member_id uuid;
begin
  select * into v_round from rounds where id = p_round_id;
  if not found then raise exception 'round not found'; end if;

  select id into v_my_member_id from round_members
  where round_id = p_round_id and profile_id = v_uid and status = 'ACTIVE' and approved;
  if not found then raise exception 'not an active member of this round'; end if;

  -- Before the roulette there is nothing to be a cook of.
  if v_round.status in ('DRAFT', 'OPEN', 'LOCKED') then
    raise exception 'briefs are not visible to cooks yet';
  end if;

  return query
    select
      p.id, b.id, b.dish_name, b.course, b.procedure, b.external_url, b.difficulty,
      b.est_cost, b.prep_minutes, b.note_to_cook, b.contains_tags,
      coalesce(
        (select jsonb_agg(jsonb_build_object('name', bi.name, 'quantity', bi.quantity, 'unit', bi.unit) order by bi.position)
         from brief_ingredients bi where bi.brief_id = b.id),
        '[]'::jsonb
      ),
      (b.acknowledged_at is not null)
    from briefs b
    join pairings p on p.id = b.pairing_id
    where p.round_id = p_round_id
      and p.assignment_version = v_round.assignment_version
      and p.cook_id = v_my_member_id
      -- The one gate that matters now.
      and b.status = 'SUBMITTED';
end;
$$;

grant execute on function get_my_brief(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. BRIEFS_CLOSED leaves the journey.
--
-- ASSIGNED now steps straight to DINNER, and DINNER steps straight back to
-- ASSIGNED. A round already parked in BRIEFS_CLOSED can still move either way,
-- so nothing in flight breaks — the phase simply stops being somewhere new
-- rounds are sent.
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
  v_step int;
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

  v_step := v_target_idx - v_current_idx;

  -- ASSIGNED <-> DINNER is two array positions apart only because
  -- BRIEFS_CLOSED still sits between them in the enum. Treat it as one step.
  if abs(v_step) = 2
     and 'BRIEFS_CLOSED' = v_forward_order[least(v_current_idx, v_target_idx) + 1] then
    v_step := sign(v_step);
  end if;

  if v_step = 1 then
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

  elsif v_step = -1 then
    if v_is_service then
      raise exception 'automated jobs may only move a round forward';
    end if;
    -- One step back changes nothing but the phase: no row in any other table
    -- is touched. The client says exactly which actions that opens or closes.
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
