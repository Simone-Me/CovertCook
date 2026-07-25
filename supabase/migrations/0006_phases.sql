-- Phase state machine. Deadlines are re-checked here on every attempted
-- transition (host-triggered or pg_cron-triggered) rather than trusted from
-- a prior cron run — but the individual action RPCs (submit_brief,
-- submit_ballot) independently re-check their own deadline too, so a missed
-- cron tick can never let someone act late merely because rounds.status is
-- stale.
--
-- auth.uid() is null when called by the service_role (pg_cron / the
-- keep-alive job), which is how automated deadline-driven advances are
-- distinguished from host-triggered ones without a separate function.

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
