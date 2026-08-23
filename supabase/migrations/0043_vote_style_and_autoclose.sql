-- Choosing how to vote, and stopping when there is nothing left to wait for.

-- ---------------------------------------------------------------------------
-- 1. The vote's style is decided when it is opened, not weeks earlier.
--
-- voting_mode could only be set at creation, which is the worst moment to ask:
-- the host is naming a dinner three weeks out and has no idea yet whether the
-- eight of them will be sitting round a table with phones away or scattered
-- home afterwards. So MANUAL was unreachable in practice — a round created
-- before it existed, or created with "Classic", had no route to it at all.
--
-- Changeable up to and including DINNER, frozen from VOTING on: once a ballot
-- exists, switching the counting method would be changing the rules mid-count.
-- DISABLED stays one-way, as it always has been.
-- ---------------------------------------------------------------------------

create or replace function set_voting_mode(p_round_id uuid, p_mode voting_mode)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
begin
  select * into v_round from rounds where id = p_round_id for update;
  if not found then raise exception 'round not found'; end if;

  if not is_round_host(p_round_id, v_uid) then
    raise exception 'only the Executive Chef decides how the vote runs';
  end if;

  if v_round.status not in ('DRAFT', 'OPEN', 'LOCKED', 'ASSIGNED', 'BRIEFS_CLOSED', 'DINNER') then
    raise exception 'VOTE_ALREADY_OPEN';
  end if;

  if v_round.voting_mode = 'DISABLED' and p_mode <> 'DISABLED' then
    raise exception 'voting was turned off for this dinner and cannot be turned back on';
  end if;

  update rounds set voting_mode = p_mode where id = p_round_id;

  insert into audit_log (round_id, actor_id, action, payload)
  values (p_round_id, v_uid, 'ROUND_UPDATED', jsonb_build_object('voting_mode', p_mode));
end;
$$;

grant execute on function set_voting_mode(uuid, voting_mode) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. A deadline is a promise, so it is set once.
--
-- set_voting_deadline could be called again and again, which turned a stated
-- closing time into something that moved while people were deciding whether
-- they had time to think. Now the first one sticks: clearing it is still
-- allowed (that removes a promise rather than changing one), but replacing a
-- live deadline with a different one is not.
-- ---------------------------------------------------------------------------

create or replace function set_voting_deadline(p_round_id uuid, p_minutes int)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
  v_closes timestamptz;
begin
  select * into v_round from rounds where id = p_round_id for update;
  if not found then raise exception 'round not found'; end if;

  if not is_round_host(p_round_id, v_uid) then
    raise exception 'only the Executive Chef can set the deadline';
  end if;

  if v_round.status <> 'VOTING' then
    raise exception 'the vote is not open';
  end if;

  if p_minutes is null then
    update rounds set voting_closes_at = null where id = p_round_id;
    return null;
  end if;

  if v_round.voting_closes_at is not null and v_round.voting_closes_at > now() then
    raise exception 'DEADLINE_ALREADY_SET';
  end if;

  v_closes := now() + make_interval(mins => p_minutes);
  update rounds set voting_closes_at = v_closes where id = p_round_id;
  return v_closes;
end;
$$;

grant execute on function set_voting_deadline(uuid, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. When everyone has voted there is nothing left to wait for.
--
-- Callable by anyone in the round rather than the host alone, and safe because
-- it does nothing at all unless the condition is genuinely met — the last
-- person to vote should not have to find the host to end a vote that is
-- already over. Waiting out a two-hour deadline that cannot change anything is
-- the kind of waiting that makes people close the app.
-- ---------------------------------------------------------------------------

create or replace function close_voting_if_complete(p_round_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
  v_eligible int;
  v_voted int;
begin
  select * into v_round from rounds where id = p_round_id for update;
  if not found then raise exception 'round not found'; end if;

  if not (is_round_host(p_round_id, v_uid) or is_round_member(p_round_id, v_uid)) then
    raise exception 'not a member of this round';
  end if;

  if v_round.status <> 'VOTING' or v_round.voting_mode = 'MANUAL' then
    return false;
  end if;

  select count(*) into v_eligible from round_members
  where round_id = p_round_id and status = 'ACTIVE' and approved;

  select count(*) into v_voted from ballots where round_id = p_round_id;

  if v_eligible = 0 or v_voted < v_eligible then
    return false;
  end if;

  perform compute_results(p_round_id);
  update rounds set status = 'RESULTS', voting_closes_at = null where id = p_round_id;

  insert into audit_log (round_id, actor_id, action, payload)
  values (p_round_id, null, 'PHASE_CHANGED', jsonb_build_object(
    'from', 'VOTING', 'to', 'RESULTS', 'reason', 'everyone voted'
  ));

  return true;
end;
$$;

grant execute on function close_voting_if_complete(uuid) to authenticated;
