-- THE MENU, WHILE IT IS STILL BEING WRITTEN.
--
-- Until now nobody could see a dish name before the dinner. That is right for
-- the surprise and wrong for one specific thing: in FREE mode nothing stops
-- three people writing a tiramisù, and the table finds out at the buffet.
--
-- WHAT IS EXPOSED, AND WHAT IS DELIBERATELY NOT. Course and dish name. No
-- author, no cook, no pairing, no ingredients, no method. `briefs` and
-- `pairings` still have no player-facing SELECT policy and still never will —
-- this is one RPC that returns two columns, which is the only way anything
-- crosses to the client from those tables.
--
-- WHY THAT LEAKS NOTHING. A reader who sees "dessert: tiramisù" learns a dish
-- exists. Their own dish they already knew; the one they wrote they already
-- wrote. Nobody is named, and nobody can be worked out from a list of names
-- with no people attached to it — which is the whole reason the author is not
-- on it.
--
-- ONLY SUBMITTED RECIPES. A draft is not a dish; it is somebody still
-- thinking, and publishing a working title would be reading over a shoulder.
--
-- NOT A DECISION MADE AT CREATION. Unlike anonymity or the fil rouge, this one
-- is reversible and costs nothing to change: turning it on reveals names that
-- are public at the end of the evening anyway, and turning it off takes back
-- nothing anybody wrote against. So it is a switch the Executive Chef can
-- throw whenever they like, right up until the dinner starts — after which
-- everybody is in the room and the menu is on the table.

alter table rounds add column if not exists menu_visibility text not null default 'HIDDEN';

alter table rounds drop constraint if exists rounds_menu_visibility_values;
alter table rounds add constraint rounds_menu_visibility_values
  check (menu_visibility in ('HIDDEN', 'NAMES'));

comment on column rounds.menu_visibility is
  'HIDDEN: nobody sees a dish before the dinner. NAMES: members see course and dish name, never who. Default HIDDEN — a classic dinner keeps its surprise.';

create or replace function set_menu_visibility(p_round_id uuid, p_value text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_status round_status;
begin
  if not is_round_host(p_round_id, v_uid) then
    raise exception 'only the host can change the menu';
  end if;

  if p_value not in ('HIDDEN', 'NAMES') then
    raise exception 'MENU_VISIBILITY_VALUE';
  end if;

  select status into v_status from rounds where id = p_round_id;
  if not found then raise exception 'round not found'; end if;

  -- From DINNER onwards the table is looking at the food. A switch that
  -- changes nothing is a switch that should not be offered.
  if v_status in ('DINNER', 'VOTING', 'RESULTS', 'ARCHIVED', 'CANCELLED') then
    raise exception 'MENU_ALREADY_SERVED';
  end if;

  update rounds set menu_visibility = p_value where id = p_round_id;

  insert into audit_log (round_id, actor_id, action, payload)
  values (p_round_id, v_uid, 'MENU_VISIBILITY_SET', jsonb_build_object('value', p_value));
end;
$$;

grant execute on function set_menu_visibility(uuid, text) to authenticated;

-- Two columns, and it refuses rather than returning an empty list when the
-- dinner did not ask for this — an empty menu and a closed menu look the same
-- to a screen, and the frontend has to be able to tell them apart.
create or replace function get_round_dishes(p_round_id uuid)
returns table (course course, dish_name text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds;
begin
  select * into v_round from rounds where id = p_round_id;
  if not found then raise exception 'round not found'; end if;

  if not (is_round_host(p_round_id, v_uid) or is_round_member(p_round_id, v_uid)) then
    raise exception 'not a member of this round';
  end if;

  if v_round.menu_visibility <> 'NAMES' then
    raise exception 'MENU_NOT_SHARED';
  end if;

  -- Sorted by course and then by name, never by anything that carries an
  -- order somebody could read a person out of: not by when it was written,
  -- not by the pairing, not by the slot. `course` is an enum declared in the
  -- order a meal is eaten (0066), so this is the menu's own order.
  return query
  select b.course, b.dish_name
  from briefs b
  join pairings p on p.id = b.pairing_id
  where p.round_id = p_round_id
    and p.assignment_version = v_round.assignment_version
    and b.status = 'SUBMITTED'
    and b.delivered
  order by b.course, b.dish_name;
end;
$$;

grant execute on function get_round_dishes(uuid) to authenticated;

comment on function get_round_dishes(uuid) is
  'Course and dish name for the recipes already sent, and nothing else. Exists so a table can avoid three tiramisùs without learning who wrote what.';
