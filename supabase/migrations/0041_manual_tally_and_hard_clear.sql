-- Counting hands, and a way out of a menu that is truly stuck.

-- ---------------------------------------------------------------------------
-- 1. Clearing the assignment when recipes already exist.
--
-- clear_assignment refuses once anything is written, which is right by default:
-- a brief is somebody's work and no button throws that away by accident. But
-- refusing *always* left one genuine dead end — a host who has to change the
-- courses after the roulette has run, with recipes already in, had no route at
-- all.
--
-- So the refusal becomes the default rather than the only answer. Discarding
-- is opt-in, one boolean, and the caller has to pass it deliberately. What it
-- costs is stated here because the UI must repeat it: deleting the pairings
-- cascades to briefs AND to every private message on those pairings. It is the
-- most destructive thing in this codebase and it is the only one.
-- ---------------------------------------------------------------------------

create or replace function clear_assignment(p_round_id uuid, p_discard_briefs boolean default false)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
  v_briefs int;
begin
  select * into v_round from rounds where id = p_round_id for update;
  if not found then raise exception 'round not found'; end if;

  if not is_round_host(p_round_id, v_uid) then
    raise exception 'only the Executive Chef can clear the assignment';
  end if;

  if v_round.status <> 'LOCKED' then
    raise exception 'the assignment can only be cleared while the round is LOCKED';
  end if;

  select count(*) into v_briefs
  from briefs b join pairings p on p.id = b.pairing_id
  where p.round_id = p_round_id;

  if v_briefs > 0 and not p_discard_briefs then
    raise exception 'BRIEFS_EXIST';
  end if;

  delete from pairings where round_id = p_round_id;

  insert into audit_log (round_id, actor_id, action, payload)
  values (p_round_id, v_uid, 'ASSIGNMENT_CLEARED', jsonb_build_object('briefs_discarded', v_briefs));

  -- So the caller can tell the host what it actually cost.
  return v_briefs;
end;
$$;

grant execute on function clear_assignment(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The manual tally.
--
-- A show of hands, entered by the Executive Chef in three passes: third places
-- first, then seconds, then firsts. One row per dish per place, holding how
-- many hands went up — not who raised them, because nobody is writing down who
-- raised them and a table that could hold that would invite somebody to.
--
-- Points follow the places: 3rd = 1, 2nd = 2, 1st = 3.
-- ---------------------------------------------------------------------------

create table if not exists manual_tally (
  round_id uuid not null references rounds (id) on delete cascade,
  brief_id uuid not null references briefs (id) on delete cascade,
  place int not null check (place between 1 and 3),
  voters int not null default 0 check (voters >= 0),
  primary key (round_id, brief_id, place)
);

alter table manual_tally enable row level security;

comment on table manual_tally is
  'Hands counted per dish per place in a MANUAL vote. Counts only — never who voted, because nobody is writing that down at the table.';

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

  -- The dish has to belong to this dinner.
  if not exists (
    select 1 from briefs b join pairings p on p.id = b.pairing_id
    where b.id = p_brief_id and p.round_id = p_round_id
  ) then
    raise exception 'that dish is not on this menu';
  end if;

  insert into manual_tally (round_id, brief_id, place, voters)
  values (p_round_id, p_brief_id, p_place, p_voters)
  on conflict (round_id, brief_id, place) do update set voters = excluded.voters;
end;
$$;

grant execute on function set_manual_tally(uuid, uuid, int, int) to authenticated;

create or replace function get_manual_tally(p_round_id uuid)
returns table (brief_id uuid, place int, voters int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not is_round_host(p_round_id, v_uid) then
    raise exception 'only the Executive Chef sees the running count';
  end if;

  return query
  select mt.brief_id, mt.place, mt.voters
  from manual_tally mt where mt.round_id = p_round_id;
end;
$$;

grant execute on function get_manual_tally(uuid) to authenticated;

-- Writes into the same `results` table the online vote produces, so every
-- screen downstream — get_results, the results page, publishing — is untouched
-- and does not need to know how the numbers were arrived at.
create or replace function close_manual_vote(p_round_id uuid)
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
    raise exception 'only the Executive Chef can close the count';
  end if;

  if v_round.voting_mode <> 'MANUAL' then
    raise exception 'this dinner is not counting by hand';
  end if;

  delete from results where round_id = p_round_id;

  insert into results (round_id, brief_id, borda_points, first_places, final_rank)
  select
    p_round_id,
    b.id,
    coalesce(sum(mt.voters * (4 - mt.place)), 0),
    coalesce(max(mt.voters) filter (where mt.place = 1), 0),
    rank() over (
      order by coalesce(sum(mt.voters * (4 - mt.place)), 0) desc,
               coalesce(max(mt.voters) filter (where mt.place = 1), 0) desc,
               b.dish_name
    )
  from briefs b
  join pairings p on p.id = b.pairing_id
  left join manual_tally mt on mt.brief_id = b.id and mt.round_id = p_round_id
  where p.round_id = p_round_id
    and p.assignment_version = v_round.assignment_version
    and b.status = 'SUBMITTED'
  group by b.id, b.dish_name;

  update rounds set status = 'RESULTS', voting_closes_at = null where id = p_round_id;

  insert into audit_log (round_id, actor_id, action)
  values (p_round_id, v_uid, 'MANUAL_VOTE_CLOSED');
end;
$$;

grant execute on function close_manual_vote(uuid) to authenticated;
