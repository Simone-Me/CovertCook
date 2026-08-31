-- Whether the table splits its costs is a rule; the number is a decision.
--
-- `set_cost_settings` (0065) treated them as one thing and let both move until
-- LOCKED. Both halves of that are wrong in different directions.
--
-- TURNING SHARING ON LATE is not a setting, it is a new deal. People agreed to
-- come to a dinner where nothing was being split, several of them have already
-- shopped, and the rule changes underneath them — a receipt that was a gift on
-- Tuesday is a debt on Friday. So the mode is settled when the dinner is
-- created and never afterwards.
--
-- THE BUDGET, meanwhile, was frozen at LOCKED — which is before anybody has
-- been to a shop. "Let's say twenty each" turning into "make it thirty, the
-- fish was mad" is the most ordinary thing at a dinner, and it was the one
-- thing the app refused. It moves, for the whole life of the dinner, and only
-- the Executive Chef moves it.
--
-- Turning sharing OFF stays possible for as long as the mode is settable, and
-- deliberately: it is the escape hatch from a mistyped setup, and it takes an
-- obligation away rather than adding one.

create or replace function set_cost_settings(
  p_round_id uuid,
  p_mode cost_mode,
  p_budget_per_head int default null,
  p_currency text default 'EUR'
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
  select * into v_round from rounds where id = p_round_id;
  if not found then raise exception 'round not found'; end if;
  if not is_round_host(p_round_id, v_uid) then
    raise exception 'only the host can set the budget';
  end if;

  -- DRAFT only, and DRAFT is where the creation form still is: it calls this
  -- immediately after create_round, before anybody could have been invited.
  -- MODE_SETTLED rather than the old BUDGET_TOO_LATE, because the two say
  -- different things and only one of them is still true.
  if v_round.cost_mode is distinct from p_mode and v_round.status <> 'DRAFT' then
    raise exception 'MODE_SETTLED';
  end if;

  update rounds
  set cost_mode = p_mode,
      budget_per_head = case when p_mode = 'SHARED' then p_budget_per_head else null end,
      currency = coalesce(nullif(btrim(p_currency), ''), 'EUR')
  where id = p_round_id;

  insert into audit_log (round_id, actor_id, action, payload)
  values (p_round_id, v_uid, 'ROUND_UPDATED',
          jsonb_build_object('cost_mode', p_mode, 'budget_per_head', p_budget_per_head));
end;
$$;

grant execute on function set_cost_settings(uuid, cost_mode, int, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The number, on its own, host-only, all evening.
--
-- Null is a real answer and not a missing one: "we're splitting, with no
-- ceiling" is a thing a table decides, and it is what clearing the field
-- means.
-- ---------------------------------------------------------------------------

create or replace function set_budget_per_head(p_round_id uuid, p_budget_per_head int)
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
    raise exception 'only the Executive Chef sets the budget';
  end if;

  if v_round.cost_mode <> 'SHARED' then
    raise exception 'COSTS_NOT_SHARED';
  end if;

  -- A record does not take new numbers (0054): the settlement has been read
  -- and people have paid each other by then.
  if v_round.status in ('ARCHIVED', 'CANCELLED') then
    raise exception 'ROUND_IS_OVER';
  end if;

  if p_budget_per_head is not null and (p_budget_per_head < 0 or p_budget_per_head > 100000000) then
    raise exception 'AMOUNT_INVALID';
  end if;

  update rounds set budget_per_head = p_budget_per_head where id = p_round_id;

  insert into audit_log (round_id, actor_id, action, payload)
  values (p_round_id, v_uid, 'ROUND_UPDATED', jsonb_build_object('budget_per_head', p_budget_per_head));
end;
$$;

grant execute on function set_budget_per_head(uuid, int) to authenticated;
