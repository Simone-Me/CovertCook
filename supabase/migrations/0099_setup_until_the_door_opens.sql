-- The rest of a dinner's setup, changeable while it is a draft.
--
-- Themes went first (0098). What was still fixed at creation: how people get
-- in, whether they are waved in, how many seats there are, how covert the
-- evening is, and how many recipes each chef writes. In DRAFT only the host
-- exists, so none of these has been relied on by anybody yet — which is the
-- only reason they are safe to move. Once the door opens, they stay put.
--
-- Same rules as create_round: at least three seats if limited, and more than
-- one recipe per chef is Crème.

create or replace function set_draft_setup(
  p_round_id uuid,
  p_access round_access,
  p_anonymity round_anonymity,
  p_requires_approval boolean,
  p_max_players int,
  p_recipes_per_brief int
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
    raise exception 'only the Executive Chef can change the setup';
  end if;

  if v_round.status <> 'DRAFT' then
    raise exception 'SETUP_LOCKED';
  end if;

  if p_max_players is not null and p_max_players < 3 then
    raise exception 'MAX_PLAYERS_RANGE';
  end if;

  if p_recipes_per_brief is null or p_recipes_per_brief not between 1 and 3 then
    raise exception 'RECIPES_PER_BRIEF_RANGE';
  end if;
  if p_recipes_per_brief > 1 and p_recipes_per_brief <> v_round.recipes_per_brief
     and not is_pro(v_uid) then
    raise exception 'PRO_REQUIRED';
  end if;

  update rounds
  set access = p_access,
      anonymity = p_anonymity,
      requires_approval = p_requires_approval,
      max_players = p_max_players,
      recipes_per_brief = p_recipes_per_brief
  where id = p_round_id;
end;
$$;

grant execute on function set_draft_setup(uuid, round_access, round_anonymity, boolean, int, int) to authenticated;
