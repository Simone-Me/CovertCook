-- The other half of publish_results (0024): making it mean something.
--
-- get_results gates on the phase alone — reaching RESULTS makes the table
-- readable by every member at once. That is the whole of the TIMED story
-- and none of the LIVE one, where the point is that the Executive Chef
-- reads the room first and then decides how to announce.
--
-- The phase stays one thing; visibility becomes a second question, asked
-- through results_are_public(). Same body as 0009 with one guard added,
-- and the host is exempt from it — seeing them first is the feature.

create or replace function get_results(p_round_id uuid)
returns table (
  brief_id uuid, dish_name text, course course,
  borda_points numeric, avg_rank numeric, first_places int, final_rank int,
  award_keys text[]
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
    select
      r.brief_id, b.dish_name, b.course, r.borda_points, r.avg_rank, r.first_places, r.final_rank,
      coalesce((select array_agg(a.award_key) from awards a where a.brief_id = r.brief_id and a.round_id = p_round_id), '{}')
    from results r
    join briefs b on b.id = r.brief_id
    where r.round_id = p_round_id
    order by r.final_rank;
end;
$$;

grant execute on function get_results(uuid) to authenticated;
