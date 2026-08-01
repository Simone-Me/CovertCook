-- Host-editable diner logistics (location/time/timezone) after a round has
-- already been created, plus a spoiler-safe way for the frontend to know
-- whether an assignment has been generated yet for the current
-- assignment_version. Both were previously missing entirely: `rounds` had
-- no update RPC at all (only create_round set these columns, once, at
-- creation), and the only existing signal for "has generate_assignment run"
-- was get_chain(), which is host-only *and* stamps host_saw_chain_at — using
-- it just to check existence would burn the "host can stay blind" spoiler
-- gate for free. assignment_exists() returns a bare boolean and never reads
-- sender_id/cook_id, so it carries no spoiler risk.

create or replace function update_round_details(
  p_round_id uuid,
  p_location text,
  p_dinner_at timestamptz,
  p_timezone text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_status round_status;
begin
  if not is_round_host(p_round_id, v_uid) then
    raise exception 'only the host can edit round details';
  end if;

  select status into v_status from rounds where id = p_round_id;
  if not found then
    raise exception 'round not found';
  end if;

  if v_status in ('DINNER', 'VOTING', 'RESULTS', 'ARCHIVED', 'CANCELLED') then
    raise exception 'diner details can no longer be edited once dinner has started';
  end if;

  update rounds
  set location = p_location, dinner_at = p_dinner_at, timezone = p_timezone
  where id = p_round_id;

  insert into audit_log (round_id, actor_id, action, payload)
  values (p_round_id, v_uid, 'ROUND_DETAILS_UPDATED', jsonb_build_object(
    'location', p_location, 'dinner_at', p_dinner_at, 'timezone', p_timezone
  ));
end;
$$;

grant execute on function update_round_details(uuid, text, timestamptz, text) to authenticated;

create or replace function assignment_exists(p_round_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not (is_round_host(p_round_id, v_uid) or is_round_member(p_round_id, v_uid)) then
    raise exception 'not a member of this round';
  end if;

  return exists (
    select 1 from pairings p
    join rounds r on r.id = p.round_id
    where p.round_id = p_round_id and p.assignment_version = r.assignment_version
  );
end;
$$;

grant execute on function assignment_exists(uuid) to authenticated;
