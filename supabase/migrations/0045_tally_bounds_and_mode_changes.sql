-- Two ways the hand count could produce a nonsense result, and the mode being
-- one-way once chosen.

-- ---------------------------------------------------------------------------
-- 1. How many people are actually voting.
--
-- Nothing bounded the counts, so a dish could be given more votes than there
-- were people in the room, and the totals across a place could add up to more
-- hands than existed. Both are typos, not opinions, and the moment to catch
-- them is while the room is still there to ask again.
--
-- It is asked rather than derived from the member count on purpose: somebody
-- who turned up to the dinner without cooking is at the table, ate the food,
-- and has as much right to an opinion about it as anybody. The Executive Chef
-- is the one who can see how many hands there are.
-- ---------------------------------------------------------------------------

alter table rounds add column if not exists manual_voters int;

comment on column rounds.manual_voters is
  'How many people are voting in a MANUAL round. Asked, not derived: guests who did not cook still eat and still get a say.';

create or replace function set_manual_voters(p_round_id uuid, p_voters int)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not is_round_host(p_round_id, v_uid) then
    raise exception 'only the Executive Chef counts the room';
  end if;

  if p_voters is not null and p_voters < 1 then
    raise exception 'a vote needs at least one voter';
  end if;

  update rounds set manual_voters = p_voters where id = p_round_id;
end;
$$;

grant execute on function set_manual_voters(uuid, int) to authenticated;

-- Both bounds enforced here rather than only in the interface, because the
-- interface is where a typo is convenient to catch and the database is where
-- it has to be impossible.
create or replace function set_manual_tally(
  p_round_id uuid,
  p_brief_id uuid,
  p_place int,
  p_voters int
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
  v_others int;
begin
  select * into v_round from rounds where id = p_round_id for update;
  if not found then raise exception 'round not found'; end if;

  if not is_round_host(p_round_id, v_uid) then
    raise exception 'only the Executive Chef counts the hands';
  end if;

  if v_round.voting_mode <> 'MANUAL' then
    raise exception 'this dinner is not counting by hand';
  end if;

  if v_round.status <> 'VOTING' then
    raise exception 'the vote is not open';
  end if;

  if p_place not between 1 and 3 then
    raise exception 'place must be 1, 2 or 3';
  end if;

  if p_voters < 0 then
    raise exception 'a count cannot be negative';
  end if;

  if not exists (
    select 1 from briefs b join pairings p on p.id = b.pairing_id
    where b.id = p_brief_id and p.round_id = p_round_id
  ) then
    raise exception 'that dish is not on this menu';
  end if;

  if v_round.manual_voters is not null then
    -- One dish cannot get more hands than there are hands.
    if p_voters > v_round.manual_voters then
      raise exception 'TOO_MANY_FOR_DISH';
    end if;

    -- And one place cannot be handed out more times than there are people:
    -- everybody has exactly one third place to give.
    select coalesce(sum(voters), 0) into v_others
    from manual_tally
    where round_id = p_round_id and place = p_place and brief_id <> p_brief_id;

    if v_others + p_voters > v_round.manual_voters then
      raise exception 'TOO_MANY_FOR_PLACE';
    end if;
  end if;

  insert into manual_tally (round_id, brief_id, place, voters)
  values (p_round_id, p_brief_id, p_place, p_voters)
  on conflict (round_id, brief_id, place) do update set voters = excluded.voters;
end;
$$;

grant execute on function set_manual_tally(uuid, uuid, int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Changing your mind about how the vote runs.
--
-- The mode froze at VOTING, which meant picking "by hand" once and then
-- discovering half the table had gone home left no way back to an online
-- ballot. The real constraint was never the phase — it is whether anything has
-- been counted yet. So: change it freely until somebody has voted, refuse once
-- they have, and say which.
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

  if v_round.status in ('RESULTS', 'ARCHIVED', 'CANCELLED') then
    raise exception 'VOTE_ALREADY_CLOSED';
  end if;

  if v_round.voting_mode = 'DISABLED' and p_mode <> 'DISABLED' then
    raise exception 'voting was turned off for this dinner and cannot be turned back on';
  end if;

  -- Anything already counted, by either method.
  if exists (select 1 from ballots where round_id = p_round_id)
     or exists (select 1 from manual_tally where round_id = p_round_id and voters > 0) then
    raise exception 'VOTES_ALREADY_CAST';
  end if;

  update rounds set voting_mode = p_mode where id = p_round_id;

  insert into audit_log (round_id, actor_id, action, payload)
  values (p_round_id, v_uid, 'ROUND_UPDATED', jsonb_build_object('voting_mode', p_mode));
end;
$$;

grant execute on function set_voting_mode(uuid, voting_mode) to authenticated;
