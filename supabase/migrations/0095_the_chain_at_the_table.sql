-- ---------------------------------------------------------------------------
-- THE CHAIN, READ BY THE WHOLE TABLE ONCE THE RESULTS ARE OUT.
--
-- `get_chain` (0005) is the Executive Chef's: it works in every phase, which is
-- exactly why nobody else may call it. But once the results are announced the
-- chain is no longer a secret — it is the punchline. Each chef already learns
-- their own two links through the conversations on the results page; the ring
-- is the rest of the table's, and it is what everybody turns to at the end.
--
-- SO A SECOND DOOR, NOT A WIDER FIRST ONE. Same columns as `get_chain`, for an
-- active approved member, and only in RESULTS or ARCHIVED. It does not mark
-- `host_saw_chain_at`: that stamp records the host looking early, which this
-- door cannot do.
-- ---------------------------------------------------------------------------

create or replace function get_revealed_chain(p_round_id uuid)
returns table (
  sender_member_id uuid, sender_secret_name text, sender_display_name text,
  cook_member_id uuid, cook_secret_name text, cook_display_name text,
  slot_id uuid, course course, lap int
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_round rounds;
begin
  if not is_round_member(p_round_id, auth.uid()) then
    raise exception 'NOT_A_MEMBER';
  end if;

  select * into v_round from rounds where id = p_round_id;
  if v_round.status not in ('RESULTS', 'ARCHIVED') then
    raise exception 'NOT_REVEALED';
  end if;

  return query
    select
      p.sender_id, sm.secret_name, spr.display_name,
      p.cook_id, cm.secret_name, cpr.display_name,
      p.slot_id, s.course, p.lap
    from pairings p
    join round_members sm on sm.id = p.sender_id
    join round_members cm on cm.id = p.cook_id
    left join profiles spr on spr.id = sm.profile_id
    left join profiles cpr on cpr.id = cm.profile_id
    join slots s on s.id = p.slot_id
    where p.round_id = p_round_id and p.assignment_version = v_round.assignment_version
    order by p.lap, sm.secret_name;
end;
$$;

revoke all on function get_revealed_chain(uuid) from public;
grant execute on function get_revealed_chain(uuid) to authenticated;
