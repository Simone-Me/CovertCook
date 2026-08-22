-- Phase 3: what LIVE and TIMED actually do.
--
-- 0018 recorded the choice and deliberately left advance_phase alone,
-- because the phase machine only ever needed to know *whether* voting
-- happens. This is the other half: who triggers it, when results become
-- visible, and whether a vote can be changed.
--
-- Nothing here touches advance_phase either. Everything is either a new
-- column with a default that preserves today's behaviour, or a new
-- host-only RPC.

-- ---------------------------------------------------------------------------
-- 1. Results are published, not merely computed
--
-- LIVE means the Executive Chef reads the room before the room reads the
-- results: they see them first, then decide whether to announce them in the
-- app or out loud. TIMED means nobody waits on anybody — the deadline
-- passes and the results are simply there.
--
-- Rather than teach the phase machine two ways to enter RESULTS, the phase
-- stays one thing and visibility becomes a separate fact.
-- ---------------------------------------------------------------------------

alter table rounds add column results_published_at timestamptz;

comment on column rounds.results_published_at is
  'When results became visible to players. TIMED rounds set it automatically as the deadline passes; LIVE rounds wait for the Executive Chef. Null in RESULTS means the host is looking and nobody else can yet.';

-- Are the results readable by an ordinary player right now? One place, so
-- get_results and the frontend can never disagree about it.
create or replace function results_are_public(p_round rounds)
returns boolean
language sql
immutable
as $$
  select
    p_round.results_published_at is not null
    -- A TIMED round publishes itself: waiting for a host who has gone to
    -- bed would be the whole point of picking TIMED, missed.
    or (p_round.voting_mode = 'TIMED'
        and p_round.voting_closes_at is not null
        and now() >= p_round.voting_closes_at)
    -- Voting was never part of this round, so there is nothing to gate.
    or p_round.voting_mode = 'DISABLED'
    -- The evening is filed away; withholding it at that point helps nobody.
    or p_round.status = 'ARCHIVED';
$$;

create or replace function publish_results(p_round_id uuid)
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
    raise exception 'only the Executive Chef can publish the results';
  end if;
  if v_round.status not in ('RESULTS', 'ARCHIVED') then
    raise exception 'there are no results yet';
  end if;

  update rounds set results_published_at = coalesce(results_published_at, now())
  where id = p_round_id;
end;
$$;

grant execute on function publish_results(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. A deadline the host can actually set
--
-- voting_closes_at has existed since 0001 and submit_ballot has always
-- respected it, but nothing could write it — so the column was a promise
-- the app never kept. Fixed minutes rather than a free datetime: this is a
-- decision made at a table with a glass in hand, not a calendar entry.
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
  if v_round.voting_mode = 'DISABLED' then
    raise exception 'this dinner has no vote';
  end if;
  if p_minutes is not null and p_minutes not in (5, 10, 60, 180, 1440) then
    raise exception 'unsupported deadline';
  end if;

  v_closes := case when p_minutes is null then null else now() + make_interval(mins => p_minutes) end;
  update rounds set voting_closes_at = v_closes where id = p_round_id;
  return v_closes;
end;
$$;

grant execute on function set_voting_deadline(uuid, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. A vote can be changed until it can't
--
-- submit_ballot refused a second call outright — "ballots are final" — which
-- is the right rule at the moment the count is taken and the wrong one for
-- the twenty minutes before it. Someone who ranked six dishes on a phone
-- and immediately spotted a mistake had no recourse.
--
-- Replacing the ballot rather than editing it in place: ballot_items cascade
-- from ballots, so one delete leaves no orphans and no half-updated ranking
-- if the rewrite fails partway.
-- ---------------------------------------------------------------------------

create or replace function withdraw_ballot(p_round_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
  v_voter_id uuid;
begin
  select * into v_round from rounds where id = p_round_id;
  if not found then raise exception 'round not found'; end if;

  if v_round.status <> 'VOTING' then
    raise exception 'voting is not open';
  end if;
  if v_round.voting_closes_at is not null and now() >= v_round.voting_closes_at then
    raise exception 'voting has closed';
  end if;

  select id into v_voter_id from round_members
  where round_id = p_round_id and profile_id = v_uid and status = 'ACTIVE' and approved;
  if not found then raise exception 'not an active member of this round'; end if;

  delete from ballots where round_id = p_round_id and voter_id = v_voter_id;
end;
$$;

grant execute on function withdraw_ballot(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. How many have voted — never who, and never what
--
-- The Executive Chef needs one number to know when to close: has everyone
-- finished. They must not learn a single ballot's contents, which is why
-- this returns counts and nothing else, and why it is a function rather
-- than a read of a table the client could widen.
-- ---------------------------------------------------------------------------

create or replace function get_vote_progress(p_round_id uuid)
returns table (voted int, eligible int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not is_round_host(p_round_id, v_uid) then
    raise exception 'only the Executive Chef can see voting progress';
  end if;

  return query
  select
    (select count(*)::int from ballots b where b.round_id = p_round_id),
    (select count(*)::int from round_members m
      where m.round_id = p_round_id and m.status = 'ACTIVE' and m.approved);
end;
$$;

grant execute on function get_vote_progress(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Skipping the vote without rewriting the round
--
-- The dinner ran long, nobody is in a state to rank six dishes, and the
-- Executive Chef wants to go straight to the end. 0013's advance_phase
-- allows the DINNER -> RESULTS jump only for a round configured with no
-- vote at all, so this is its own RPC rather than a loosened guard — and it
-- deliberately does NOT rewrite voting_mode. The round was a voting round;
-- this evening just didn't get there.
-- ---------------------------------------------------------------------------

create or replace function skip_voting(p_round_id uuid)
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
    raise exception 'only the Executive Chef can skip the vote';
  end if;
  if v_round.status not in ('DINNER', 'VOTING') then
    raise exception 'there is no vote to skip at this point';
  end if;

  update rounds set status = 'RESULTS', voting_closes_at = null where id = p_round_id;
  perform compute_results(p_round_id);

  insert into audit_log (round_id, actor_id, action, payload)
  values (p_round_id, v_uid, 'PHASE_ADVANCED',
          jsonb_build_object('to', 'RESULTS', 'skipped_voting', true));
end;
$$;

grant execute on function skip_voting(uuid) to authenticated;
