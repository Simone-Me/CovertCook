-- "No voting" stops being a one-way door.
--
-- THE RULE THAT WAS THERE, AND WHY IT SHOULD NOT HAVE BEEN. Since 0043,
-- set_voting_mode has carried this:
--
--     if v_round.voting_mode = 'DISABLED' and p_mode <> 'DISABLED' then
--       raise exception 'voting was turned off ... cannot be turned back on';
--     end if;
--
-- Two lines, repeated in 0045, and nothing else in the schema depends on them.
-- `voting_enabled` is a GENERATED column derived from `voting_mode` (0018), so
-- the phase machine's guard — advance_phase refusing to enter VOTING when
-- voting is off (0013) — opens by itself the instant the mode changes. There
-- was never a technical reason for the door. It was a judgement, and it was
-- the wrong one.
--
-- It treated "we are not going to rank our friends' cooking" as a destructive
-- act needing protection from, when it is simply one of the four ordinary ways
-- a dinner ends. Every other voting choice on the form can be revisited over
-- dinner with the turning arrow; this one alone was final, so a host who
-- picked it in June and found in October that the table wanted to vote after
-- all had no way back — and the interface, correctly, warned them in red at
-- the moment of choosing, which made an ordinary choice feel like disarming
-- something.
--
-- WHAT STILL REFUSES, and these are the guards that were always doing the real
-- work: a vote cannot be reshaped once RESULTS have been reached, and it
-- cannot be reshaped once anybody has actually voted. Those protect ballots
-- that exist. The old rule protected nothing.

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

  if v_round.status in ('RESULTS', 'ARCHIVED', 'CANCELLED') then
    raise exception 'VOTE_ALREADY_CLOSED';
  end if;

  -- Anything already counted, by either method. This is the guard that
  -- matters: changing the method under ballots that exist would either throw
  -- them away or score them by rules nobody agreed to.
  if exists (select 1 from ballots where round_id = p_round_id)
     or exists (select 1 from manual_tally where round_id = p_round_id and voters > 0) then
    raise exception 'VOTES_ALREADY_CAST';
  end if;

  update rounds set voting_mode = p_mode where id = p_round_id;

  -- A round parked in RESULTS because it had no vote is a real case: 0013 lets
  -- a voteless dinner hop DINNER <-> RESULTS directly. Turning voting on there
  -- is refused above, so nothing has to be undone here — but the deadline of a
  -- mode being left behind does have to go, or a TIMED round switched to LIVE
  -- keeps a clock nobody is watching and closes itself.
  if p_mode <> 'TIMED' then
    update rounds set voting_closes_at = null where id = p_round_id;
  end if;

  insert into audit_log (round_id, actor_id, action, payload)
  values (p_round_id, v_uid, 'ROUND_UPDATED', jsonb_build_object('voting_mode', p_mode));
end;
$$;

grant execute on function set_voting_mode(uuid, voting_mode) to authenticated;

comment on function set_voting_mode(uuid, voting_mode) is
  'How this dinner votes, changeable in either direction until somebody has voted or the results are in (0078). DISABLED is a choice like the other three, not a door.';
