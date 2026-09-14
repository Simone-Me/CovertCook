-- HOW WELL THE DISH FOLLOWED THE THREAD.
--
-- The ballot has carried two optional secondary scores since 0009 —
-- originality, and how closely the brief was followed — and the fil rouge
-- (0083, 0085) adds the third question a table actually argues about after
-- eating: did this one honour it.
--
-- OPTIONAL, LIKE THE OTHER TWO, AND INVISIBLE WITHOUT A THREAD. People vote
-- at twenty to eleven with wine in front of them, so a ballot that grows a
-- mandatory third row for every dish is a ballot that gets abandoned. On a
-- dinner with no fil rouge the line is not shown, nothing is scored, and the
-- award below finds nobody to give itself to — which is the correct outcome
-- rather than a special case.
--
-- WHY THE BALLOT NOW CARRIES A THREAD PER DISH. On a PER_COOK dinner every
-- cook was dealt a different one, so "did it honour the thread" cannot be
-- answered against the round: the voter has to be told that THIS dish was
-- supposed to be blue. get_ballot_options therefore returns the pairing's own
-- code. It leaks nothing — a per-cook value is already known to its cook and
-- to their sender, and to everyone else a colour beside a dish names nobody.
--
-- The three functions below are 0009's, unchanged except where marked: they
-- are reproduced in full because Postgres replaces a function body whole.

alter table ballot_items add column if not exists theme_score int
  check (theme_score between 1 and 5);

comment on column ballot_items.theme_score is
  'How well the dish honoured the dinner''s fil rouge, 1-5. Optional, and never asked on a dinner that has none.';

-- ---------------------------------------------------------------------------
-- 1. The ballot learns which thread each dish was given.
-- ---------------------------------------------------------------------------

-- Dropped rather than replaced: `create or replace` refuses to change the row
-- type an OUT-parameter function returns, and this adds a column to it. The
-- drop and the create are in one migration file, which Supabase runs as a
-- single transaction, so there is no window in which the function is missing.
-- Same reasoning as 0057 recorded for get_results.
drop function if exists get_ballot_options(uuid);

create function get_ballot_options(p_round_id uuid)
returns table (
  brief_id uuid, dish_name text, course course,
  difficulty int, est_cost text, prep_minutes int,
  -- The thread this particular dish had to honour. Null on a shared dinner,
  -- where the round carries one for everybody, and null when there is none.
  fil_rouge_code text
)
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

  select id into v_voter_id from round_members
  where round_id = p_round_id and profile_id = v_uid and status = 'ACTIVE' and approved;
  if not found then raise exception 'not an active member of this round'; end if;

  if v_round.status not in ('VOTING', 'RESULTS', 'ARCHIVED') then
    raise exception 'voting has not opened yet';
  end if;

  return query
    select b.id, b.dish_name, b.course, b.difficulty, b.est_cost, b.prep_minutes,
           p.fil_rouge_code
    from briefs b
    join pairings p on p.id = b.pairing_id
    where p.round_id = p_round_id
      and p.assignment_version = v_round.assignment_version
      and b.status = 'SUBMITTED' and b.delivered
      and p.cook_id <> v_voter_id;
end;
$$;

grant execute on function get_ballot_options(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. And accepts a score for it.
-- ---------------------------------------------------------------------------

create or replace function submit_ballot(p_round_id uuid, p_items jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
  v_voter_id uuid;
  v_eligible_brief_ids uuid[];
  v_given_brief_ids uuid[];
  v_ballot_id uuid;
  v_item jsonb;
  v_rank int;
  v_seen_ranks int[] := '{}';
  v_m int;
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

  if exists (select 1 from ballots where round_id = p_round_id and voter_id = v_voter_id) then
    raise exception 'ballot already submitted; ballots are final';
  end if;

  select coalesce(array_agg(b.id), '{}') into v_eligible_brief_ids
  from briefs b
  join pairings p on p.id = b.pairing_id
  where p.round_id = p_round_id
    and p.assignment_version = v_round.assignment_version
    and b.status = 'SUBMITTED'
    and b.delivered
    and p.cook_id <> v_voter_id;

  select coalesce(array_agg((elem->>'brief_id')::uuid), '{}') into v_given_brief_ids
  from jsonb_array_elements(p_items) elem;

  v_m := array_length(v_eligible_brief_ids, 1);

  if array_length(v_given_brief_ids, 1) is distinct from v_m then
    raise exception 'ballot must rank exactly every eligible dish, no more and no fewer';
  end if;

  if exists (select unnest(v_given_brief_ids) except select unnest(v_eligible_brief_ids))
     or exists (select unnest(v_eligible_brief_ids) except select unnest(v_given_brief_ids)) then
    raise exception 'ballot does not match the current eligible dish list (it may have changed)';
  end if;

  insert into ballots (round_id, voter_id) values (p_round_id, v_voter_id) returning id into v_ballot_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_rank := (v_item->>'rank')::int;
    if v_rank = any(v_seen_ranks) then
      raise exception 'duplicate rank % in ballot', v_rank;
    end if;
    v_seen_ranks := array_append(v_seen_ranks, v_rank);

    insert into ballot_items (
      ballot_id, brief_id, rank, originality_score, brief_respect_score, theme_score
    )
    values (
      v_ballot_id,
      (v_item->>'brief_id')::uuid,
      v_rank,
      nullif(v_item->>'originality_score', '')::int,
      nullif(v_item->>'brief_respect_score', '')::int,
      -- Optional exactly like the other two, and absent from the ballot
      -- altogether on a dinner with no fil rouge to honour.
      nullif(v_item->>'theme_score', '')::int
    );
  end loop;

  if (select array_agg(x order by x) from unnest(v_seen_ranks) x)
     <> (select array_agg(g) from generate_series(1, coalesce(v_m, 0)) g) then
    raise exception 'ranks must be a contiguous sequence from 1 to %', v_m;
  end if;

  insert into audit_log (round_id, actor_id, action, payload)
  values (p_round_id, v_uid, 'BALLOT_SUBMITTED', jsonb_build_object('ballot_id', v_ballot_id));

  return v_ballot_id;
end;
$$;

grant execute on function submit_ballot(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Best interpretation of the fil rouge.
-- ---------------------------------------------------------------------------

create or replace function compute_results(p_round_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from results where round_id = p_round_id;
  delete from awards where round_id = p_round_id;

  with ballot_sizes as (
    select ballot_id, count(*) as m from ballot_items group by ballot_id
  ),
  points as (
    select
      bi.brief_id,
      bi.ballot_id,
      bi.rank,
      (bs.m - bi.rank + 1) as pts,
      (bi.rank = 1) as is_first,
      (bi.rank = 2) as is_second
    from ballot_items bi
    join ballots b on b.id = bi.ballot_id
    join ballot_sizes bs on bs.ballot_id = bi.ballot_id
    where b.round_id = p_round_id
  ),
  scored as (
    select
      brief_id,
      sum(pts)::numeric / nullif(count(*), 0) as borda_points,
      avg(rank)::numeric as avg_rank,
      count(*) filter (where is_first) as first_places,
      count(*) filter (where is_second) as second_places
    from points
    group by brief_id
  ),
  eligible as (
    select b.id as brief_id
    from briefs b
    join pairings p on p.id = b.pairing_id
    join rounds r on r.id = p.round_id
    where p.round_id = p_round_id
      and p.assignment_version = r.assignment_version
      and b.status = 'SUBMITTED' and b.delivered
  ),
  final as (
    select
      e.brief_id,
      coalesce(s.borda_points, 0) as borda_points,
      s.avg_rank,
      coalesce(s.first_places, 0) as first_places,
      coalesce(s.second_places, 0) as second_places,
      random() as tiebreak_random
    from eligible e
    left join scored s on s.brief_id = e.brief_id
  )
  insert into results (round_id, brief_id, borda_points, avg_rank, first_places, final_rank, computed_at)
  select
    p_round_id, brief_id, borda_points, avg_rank, first_places,
    row_number() over (order by borda_points desc, first_places desc, second_places desc, tiebreak_random desc),
    now()
  from final;

  insert into awards (round_id, brief_id, award_key)
  select p_round_id, x.brief_id, x.award_key
  from (
    select distinct on (s.course)
      r.brief_id,
      ('BEST_' || s.course::text) as award_key
    from results r
    join briefs b on b.id = r.brief_id
    join pairings p on p.id = b.pairing_id
    join slots s on s.id = p.slot_id
    where r.round_id = p_round_id and s.course <> 'OTHER'
    order by s.course, r.borda_points desc
  ) x;

  insert into awards (round_id, brief_id, award_key)
  select p_round_id, x.brief_id, 'MOST_ORIGINAL'
  from (
    select bi.brief_id, avg(bi.originality_score) as avg_score
    from ballot_items bi
    join ballots ba on ba.id = bi.ballot_id
    where ba.round_id = p_round_id and bi.originality_score is not null
    group by bi.brief_id
    order by avg_score desc
    limit 1
  ) x
  on conflict (round_id, award_key) do nothing;

  insert into awards (round_id, brief_id, award_key)
  select p_round_id, x.brief_id, 'BEST_BRIEF_RESPECT'
  from (
    select bi.brief_id, avg(bi.brief_respect_score) as avg_score
    from ballot_items bi
    join ballots ba on ba.id = bi.ballot_id
    where ba.round_id = p_round_id and bi.brief_respect_score is not null
    group by bi.brief_id
    order by avg_score desc
    limit 1
  ) x
  on conflict (round_id, award_key) do nothing;

  -- The third secondary award, and it only exists where there was a thread to
  -- follow: on a dinner with no fil rouge nobody scored this line, every score
  -- is null, and the select below finds nothing to give it to.
  insert into awards (round_id, brief_id, award_key)
  select p_round_id, x.brief_id, 'BEST_FIL_ROUGE'
  from (
    select bi.brief_id, avg(bi.theme_score) as avg_score
    from ballot_items bi
    join ballots ba on ba.id = bi.ballot_id
    where ba.round_id = p_round_id and bi.theme_score is not null
    group by bi.brief_id
    order by avg_score desc
    limit 1
  ) x
  on conflict (round_id, award_key) do nothing;

  insert into audit_log (round_id, action, payload)
  values (p_round_id, 'RESULTS_COMPUTED', '{}'::jsonb);
end;
$$;

grant execute on function compute_results(uuid) to authenticated;
