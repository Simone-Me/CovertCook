-- The roster addresses every member by secret_name, including the ones
-- still waiting to be let in — which makes the approval step meaningless:
-- the host is deciding whether to admit someone they cannot identify.
--
-- This is not merely a frontend that forgot to ask for the name. The name
-- is unreachable: profiles_select_co_members (0002_rls.sql) requires
-- *both* sides of the join to be approved, so a pending member's
-- display_name is invisible to every client, the host's included.
--
-- Widening that policy is the wrong fix — it would expose pending
-- profiles to the whole round, not just to the person doing the vetting.
-- So this is a narrow, host-only SECURITY DEFINER read instead, covering
-- exactly the moment the decision is made.
--
-- Anonymity is not weakened by this. A pending member holds no seat and
-- is not in the game yet (§"Round-membership approval is a real feature"
-- in README.md); the instant they are approved they become their secret
-- name to everyone, host included, and this function stops returning
-- them. The real name is visible during the decision and never after.

create or replace function get_pending_members(p_round_id uuid)
returns table (
  member_id uuid,
  real_name text,
  joined_day date
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not is_round_host(p_round_id, v_uid) then
    raise exception 'only the host can see who is waiting to join';
  end if;

  -- Every column is qualified on purpose. PL/pgSQL exposes RETURNS TABLE
  -- columns as implicitly-declared variables for the whole function body,
  -- so an unqualified reference that happens to match one of them is
  -- silently captured — the exact bug 0014 had to fix in
  -- get_my_brief_draft. Hence real_name rather than display_name as the
  -- output name, too: it cannot collide with profiles.display_name.
  return query
  select m.id, p.display_name, m.joined_at::date
  from round_members m
  join profiles p on p.id = m.profile_id
  where m.round_id = p_round_id
    and m.status = 'ACTIVE'
    and not m.approved
  order by m.joined_at;
end;
$$;

grant execute on function get_pending_members(uuid) to authenticated;
