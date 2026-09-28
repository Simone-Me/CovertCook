-- THE MENU, FOR THE EXECUTIVE CHEF ALONE.
--
-- 0087 gave a dinner two settings: nobody sees a dish before the evening
-- (HIDDEN), or everybody sees the names of the dishes already sent (NAMES).
-- There is a third evening people run: the table keeps its surprise, but the
-- person hosting wants to know what is coming — to buy the bread that goes
-- with it, to notice that nothing sweet has been sent, to keep track of the
-- evening they are responsible for. That is HOST.
--
-- WHAT THE HOST LEARNS. Exactly what NAMES shows everybody: course and dish
-- name, never who wrote or who cooks. The host is not handed anything a member
-- of a NAMES dinner does not already see — only the audience is narrower.
--
-- Same function signatures as 0087; this file applies on its own.

alter table rounds drop constraint if exists rounds_menu_visibility_values;
alter table rounds add constraint rounds_menu_visibility_values
  check (menu_visibility in ('HIDDEN', 'NAMES', 'HOST'));

comment on column rounds.menu_visibility is
  'HIDDEN: nobody sees a dish before the dinner. NAMES: members see course and dish name, never who. HOST: only the host sees them. Default HIDDEN — a classic dinner keeps its surprise.';

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

  if p_value not in ('HIDDEN', 'NAMES', 'HOST') then
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
  v_host boolean;
begin
  select * into v_round from rounds where id = p_round_id;
  if not found then raise exception 'round not found'; end if;

  v_host := is_round_host(p_round_id, v_uid);
  if not (v_host or is_round_member(p_round_id, v_uid)) then
    raise exception 'not a member of this round';
  end if;

  -- The same refusal whether the menu is closed to everybody or only to you:
  -- a member of a HOST dinner learns nothing from it that a member of a
  -- HIDDEN one does not.
  if not (v_round.menu_visibility = 'NAMES' or (v_round.menu_visibility = 'HOST' and v_host)) then
    raise exception 'MENU_NOT_SHARED';
  end if;

  -- Course, then name — never an order somebody could read a person out of
  -- (see 0087).
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
  'Course and dish name for the recipes already sent, and nothing else. For every member when the menu is NAMES, for the host alone when it is HOST.';
