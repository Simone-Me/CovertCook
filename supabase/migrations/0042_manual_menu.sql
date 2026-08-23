-- The menu the Executive Chef reads out while counting hands.
--
-- get_ballot_options deliberately withholds who cooked what, because the
-- online vote is meant to be blind. A show of hands is not: everybody at the
-- table watched that person carry that dish in. Withholding it here would not
-- protect anything, it would only make the host's list harder to read out.
--
-- Host-only and MANUAL-only all the same, so nothing about this leaks into a
-- round that is voting online.

create or replace function get_manual_menu(p_round_id uuid)
returns table (brief_id uuid, dish_name text, course course, cook_name text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
begin
  select * into v_round from rounds where id = p_round_id;
  if not found then raise exception 'round not found'; end if;

  if not is_round_host(p_round_id, v_uid) then
    raise exception 'only the Executive Chef counts the hands';
  end if;

  if v_round.voting_mode <> 'MANUAL' then
    raise exception 'this dinner is not counting by hand';
  end if;

  return query
  select b.id, b.dish_name, b.course, cm.secret_name
  from briefs b
  join pairings p on p.id = b.pairing_id
  join round_members cm on cm.id = p.cook_id
  where p.round_id = p_round_id
    and p.assignment_version = v_round.assignment_version
    and b.status = 'SUBMITTED'
  order by b.dish_name;
end;
$$;

grant execute on function get_manual_menu(uuid) to authenticated;
