-- The results stop being a leaderboard and become the menu (ROADMAP §7, step
-- 1). Almost all of that is a frontend change — the scores, the courses and the
-- awards are already here. This migration exists for the one thing the menu
-- needs and the leaderboard never did: **the dishes that did not arrive.**
--
-- `results` is computed from the ballots, and a dish is only on a ballot if
-- `briefs.delivered` is true. Removing a cook with LEAVE (0016) sets that false
-- on the recipe written for them, which is right — a dish nobody made cannot be
-- given a rank — and it means the row never reaches `get_results` at all.
--
-- On a leaderboard that is invisible: a list of five is a list of five. On a
-- menu it is a hole. A dinner that had a starter, and then did not, has a menu
-- with no starters on it, and the reader concludes the app lost something.
--
-- So the dish comes back, struck through, the way a kitchen strikes a line off
-- a service menu when it goes off. `served` is what says which, and it carries
-- no rank and no score, because there is nothing to score.

-- Dropped rather than replaced: `create or replace` refuses to change the row
-- type an OUT-parameter function returns, and this adds a column to it. The
-- drop and the create are in one migration file, which Supabase runs as a
-- single transaction, so there is no window in which the function is missing.
drop function if exists get_results(uuid);

create function get_results(p_round_id uuid)
returns table (
  brief_id uuid, dish_name text, course course,
  borda_points numeric, avg_rank numeric, first_places int, final_rank int,
  award_keys text[],
  -- False for a dish that was written and never reached the table.
  served boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_round rounds;
  v_is_host boolean;
begin
  select * into v_round from rounds where id = p_round_id;
  if not found then raise exception 'round not found'; end if;

  v_is_host := is_round_host(p_round_id, auth.uid());

  if not (v_is_host or is_round_member(p_round_id, auth.uid())) then
    raise exception 'not a member of this round';
  end if;

  if v_round.status not in ('RESULTS', 'ARCHIVED') then
    raise exception 'RESULTS_NOT_READY';
  end if;

  -- Named, not prose: the frontend has to turn this into "the Executive
  -- Chef has the results and hasn't announced them yet", in two languages.
  if not v_is_host and not results_are_public(v_round) then
    raise exception 'RESULTS_NOT_PUBLISHED';
  end if;

  return query
    -- What was cooked, scored, and ranked. Unchanged from 0025.
    select
      r.brief_id, b.dish_name, b.course, r.borda_points, r.avg_rank, r.first_places, r.final_rank,
      coalesce((select array_agg(a.award_key) from awards a where a.brief_id = r.brief_id and a.round_id = p_round_id), '{}'),
      true
    from results r
    join briefs b on b.id = r.brief_id
    where r.round_id = p_round_id

    union all

    -- What was written and never arrived. Submitted only: a recipe nobody
    -- wrote is not a dish that went off, it is a dish that never existed, and
    -- printing it would tell the table something about an empty seat.
    select
      b.id, b.dish_name, b.course, 0::numeric, null::numeric, 0, null::int, '{}'::text[],
      false
    from briefs b
    join pairings p on p.id = b.pairing_id
    where p.round_id = p_round_id
      and p.assignment_version = v_round.assignment_version
      and b.status = 'SUBMITTED'
      and not b.delivered
      -- A host may mark a dish undelivered AFTER the results are computed, and
      -- then it is in both halves of this union. The scored row wins: it is
      -- the one the ballots actually produced.
      and not exists (
        select 1 from results r2 where r2.round_id = p_round_id and r2.brief_id = b.id
      )

    -- Served first, in the order they placed; then the struck-through ones,
    -- alphabetically, because there is no order among dishes nobody ate. The
    -- frontend re-groups by course and this ordering survives the grouping.
    order by 9 desc, 7 nulls last, 2;
end;
$$;

grant execute on function get_results(uuid) to authenticated;
